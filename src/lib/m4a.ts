/**
 * M4A/AAC → Float32 PCM 解码。
 *
 * 主路径：Mediabunny 解封装 + 浏览器 WebCodecs AudioDecoder。
 * 备用路径：LGPL LibAV.js 自定义变体（MOV/MP4 demux + FFmpeg AAC decoder）。
 * 两条路径都逐帧回调 PCM，调用方立即喂给 LAME，不保留整段 PCM。
 */

import type { ProgressCallback } from './types'

export interface DecodedAudioChunk {
  channelData: Float32Array[]
  samplesDecoded: number
  sampleRate: number
}

export type AudioChunkConsumer = (chunk: DecodedAudioChunk) => void

const LIBAV_BASE_PATH = '/libav'
const LIBAV_VARIANT = 'libav-6.9.8.1-musiczh-aac'
const LIBAV_READ_LIMIT = 4 * 1024 * 1024
const PLANAR_SAMPLE_FORMATS = new Set([5, 6, 7, 8, 9, 11, 12])

type LibAvStream = {
  codec_type: number
  codec_id: number
  codecpar: unknown
  duration: number
  index: number
  time_base_num: number
  time_base_den: number
}

type LibAvApi = {
  AVMEDIA_TYPE_AUDIO: number
  AVERROR_EOF: number
  EAGAIN: number
  mkreadaheadfile(name: string, source: Blob): Promise<void>
  unlinkreadaheadfile(name: string): Promise<void>
  ff_init_demuxer_file(name: string): Promise<[number, LibAvStream[]]>
  ff_init_decoder(
    codecId: number,
    codecParameters: unknown,
  ): Promise<[number, number, number, number]>
  ff_read_frame_multi(
    formatContext: number,
    packet: number,
    options: { limit: number },
  ): Promise<[number, Record<number, unknown[]>]>
  ff_decode_multi(
    decoderContext: number,
    packet: number,
    frame: number,
    packets: unknown[],
    atEnd: boolean,
  ): Promise<LibAvFrame[]>
  ff_free_decoder(
    decoderContext: number,
    packet: number,
    frame: number,
  ): Promise<void>
  avformat_close_input_js(formatContext: number): Promise<void>
  terminate(): void
}

export async function decodeM4aWithWebCodecs(
  source: Blob,
  consume: AudioChunkConsumer,
  onProgress?: ProgressCallback,
): Promise<void> {
  const {
    ALL_FORMATS,
    AudioSampleSink,
    BlobSource,
    Input,
  } = await import('mediabunny')
  const input = new Input({
    source: new BlobSource(source),
    formats: ALL_FORMATS,
  })

  try {
    const track = await input.getPrimaryAudioTrack()
    if (!track) throw new Error('M4A 中没有音频轨')
    const codec = await track.getCodec()
    if (codec !== 'aac') {
      throw new Error(`M4A 音频编码不是 AAC（${codec || 'unknown'}）`)
    }
    if (!(await track.canDecode())) {
      throw new Error('当前浏览器不支持这个 AAC 配置')
    }

    const duration = await input.computeDuration()
    const sink = new AudioSampleSink(track)
    for await (const sample of sink.samples()) {
      try {
        const channels = Math.min(sample.numberOfChannels, 2)
        const channelData: Float32Array[] = []
        for (let channel = 0; channel < channels; channel++) {
          const plane = new Float32Array(sample.numberOfFrames)
          sample.copyTo(plane, {
            planeIndex: channel,
            format: 'f32-planar',
          })
          channelData.push(plane)
        }
        consume({
          channelData,
          samplesDecoded: sample.numberOfFrames,
          sampleRate: sample.sampleRate,
        })
        if (duration > 0) {
          onProgress?.(
            Math.min(0.98, ((sample.timestamp + sample.duration) / duration) * 0.98),
          )
        }
      } finally {
        sample.close()
      }
    }
  } finally {
    input.dispose()
  }
}

export async function decodeM4aWithLibAv(
  source: Blob,
  consume: AudioChunkConsumer,
  onProgress?: ProgressCallback,
): Promise<void> {
  const base = `${self.location.origin}${LIBAV_BASE_PATH}`
  const frontendUrl = `${base}/${LIBAV_VARIANT}.mjs`
  const imported = (await import(/* @vite-ignore */ frontendUrl)) as {
    default: {
      LibAV(options: Record<string, unknown>): Promise<LibAvApi>
    }
  }
  const libav = await imported.default.LibAV({
    base,
    toImport: `${base}/${LIBAV_VARIANT}.wasm.mjs`,
    wasmurl: `${base}/${LIBAV_VARIANT}.wasm.wasm`,
    noworker: true,
    nothreads: true,
  })

  const inputName = `m4a-${crypto.randomUUID()}.m4a`
  let formatContext = 0
  let decoderContext = 0
  let packet = 0
  let frame = 0
  try {
    await libav.mkreadaheadfile(inputName, source)
    const demuxed = await libav.ff_init_demuxer_file(inputName)
    formatContext = demuxed[0]
    const audioStream = demuxed[1].find(
      (stream) => stream.codec_type === libav.AVMEDIA_TYPE_AUDIO,
    )
    if (!audioStream) throw new Error('M4A 中没有音频轨')
    const durationSeconds =
      audioStream.duration > 0 &&
      audioStream.time_base_num > 0 &&
      audioStream.time_base_den > 0
        ? (audioStream.duration * audioStream.time_base_num) /
          audioStream.time_base_den
        : 0

    const decoder = await libav.ff_init_decoder(
      audioStream.codec_id,
      audioStream.codecpar,
    )
    decoderContext = decoder[1]
    packet = decoder[2]
    frame = decoder[3]

    let samplesDecoded = 0
    while (true) {
      const [result, groupedPackets] = await libav.ff_read_frame_multi(
        formatContext,
        packet,
        { limit: LIBAV_READ_LIMIT },
      )
      const packets = groupedPackets[audioStream.index] || []
      const atEnd = result === libav.AVERROR_EOF
      const frames = await libav.ff_decode_multi(
        decoderContext,
        packet,
        frame,
        packets,
        atEnd,
      )
      for (const decoded of frames) {
        const chunk = libAvFrameToChunk(decoded)
        if (!chunk) continue
        consume(chunk)
        samplesDecoded += chunk.samplesDecoded
        if (durationSeconds > 0) {
          onProgress?.(
            Math.min(
              0.98,
              (samplesDecoded / (durationSeconds * chunk.sampleRate)) * 0.98,
            ),
          )
        }
      }
      if (atEnd) break
      if (result < 0 && result !== -libav.EAGAIN) {
        throw new Error(`LibAV 读取 M4A 失败（${result}）`)
      }
    }
  } finally {
    if (decoderContext) {
      await libav.ff_free_decoder(decoderContext, packet, frame).catch(() => {})
    }
    if (formatContext) {
      await libav.avformat_close_input_js(formatContext).catch(() => {})
    }
    await libav.unlinkreadaheadfile(inputName).catch(() => {})
    libav.terminate()
  }
}

type LibAvFrame = {
  data: unknown
  format: number
  channels?: number
  nb_samples?: number
  sample_rate?: number
}

function libAvFrameToChunk(frame: LibAvFrame): DecodedAudioChunk | null {
  const samples = frame.nb_samples || 0
  const sampleRate = frame.sample_rate || 0
  if (samples <= 0 || sampleRate <= 0) return null

  // FFmpeg AVSampleFormat 的 planar 枚举不是简单的“>=5”：
  // S64(10) 仍是 packed，S64P(11) 才是 planar。显式列举避免未来
  // AAC 解码器输出格式变化时把交错 PCM 错当平面 PCM。
  const planar = PLANAR_SAMPLE_FORMATS.has(frame.format)
  const planes = Array.isArray(frame.data) ? frame.data : [frame.data]
  const channels = Math.min(frame.channels || (planar ? planes.length : 2), 2)
  if (channels <= 0) return null

  const channelData: Float32Array[] = []
  if (planar) {
    for (let channel = 0; channel < channels; channel++) {
      channelData.push(convertPlane(planes[channel], frame.format, samples))
    }
  } else {
    const packed = convertPlane(planes[0], frame.format, samples * channels)
    for (let channel = 0; channel < channels; channel++) {
      const plane = new Float32Array(samples)
      for (let i = 0; i < samples; i++) {
        plane[i] = packed[i * channels + channel]
      }
      channelData.push(plane)
    }
  }

  return { channelData, samplesDecoded: samples, sampleRate }
}

function convertPlane(
  value: unknown,
  format: number,
  expectedSamples: number,
): Float32Array {
  if (!ArrayBuffer.isView(value)) {
    throw new Error('LibAV 返回了无效 PCM 数据')
  }
  if (value instanceof Float32Array) {
    const length = Math.min(expectedSamples, value.length)
    const out = new Float32Array(length)
    out.set(value.subarray(0, length))
    return out
  } else if (value instanceof Float64Array) {
    const length = Math.min(expectedSamples, value.length)
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) out[i] = value[i]
    return out
  } else if (value instanceof Int16Array) {
    const length = Math.min(expectedSamples, value.length)
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) out[i] = value[i] / 0x8000
    return out
  } else if (value instanceof Int32Array) {
    const length = Math.min(expectedSamples, value.length)
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) out[i] = value[i] / 0x80000000
    return out
  } else if (value instanceof Uint8Array) {
    const length = Math.min(expectedSamples, value.length)
    const out = new Float32Array(length)
    for (let i = 0; i < length; i++) out[i] = (value[i] - 128) / 128
    return out
  } else {
    throw new Error(`LibAV 返回了不支持的 PCM 格式（${format}）`)
  }
}
