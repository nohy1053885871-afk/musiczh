/**
 * 「强制转 MP3」模块（v0.7.0 流式版）
 *
 * 流程：
 *   1. 按 2MB 分块读入源字节，喂给 WASM 流式解码器
 *      （@wasm-audio-decoders/flac / ogg-vorbis，libFLAC / libvorbis 编译版，动态导入）
 *   2. 每块解出的 Float32 PCM 立刻喂给 LAME 编码、随即丢弃——内存峰值与文件大小解耦
 *   3. wasm-media-encoders（动态导入）按 LAME -V 2 编码，平均 ~190 kbps VBR
 *
 * v0.6.x 用 AudioContext.decodeAudioData 一次性整段解码（200MB FLAC → ~1GB PCM 峰值），
 * 本版换流式后峰值降到几十 MB；Hi-Res（24-bit / ≥96kHz）从拦截转为支持，
 * >48kHz 输入显式钉 48kHz 输出、走 LAME 内部重采样。
 *
 * 注意：转码仍是有损的，但 -V 2 接近无损（普通耳几乎 ABX 失败）。
 */

import {
  DecryptError,
  isMp3TranscodableFormat,
  type ProgressCallback,
} from './types'
import { sniffAudioFormat } from './sniff'
import type { AudioChunkConsumer, DecodedAudioChunk } from './m4a'

const VBR_QUALITY = 2 // LAME -V 2，平均 ~190 kbps
const DECODE_CHUNK_BYTES = 2 * 1024 * 1024 // 压缩域切块；解出的 PCM 瞬时占用 ~10MB 级，即用即弃
const ENCODER_TAG = 'wasm-lame-v2'
// WASM decoder 堆上 _decode() 的输入 buffer 有泄漏（allocateTypedArray setPointer=false 且无手动 free），
// 堆固定 16MB 不可增长。每处理 DECODER_RESET_BYTES 重建 WASM 实例回收堆。
const DECODER_RESET_BYTES = 12 * 1024 * 1024
const COALESCE_THRESHOLD = 500 // Mp3Sink 缓冲碎片合并阈值

export const TRANSCODE_ENCODER = ENCODER_TAG

/** 两个 decoder 包（FLACDecoder / OggVorbisDecoder）API 同构，取最小公共面 */
type DecodedChunk = DecodedAudioChunk

interface StreamDecoder {
  ready: Promise<void>
  free: () => void
  decode: (data: Uint8Array) => Promise<DecodedChunk>
  flush: () => Promise<DecodedChunk>
}

type ResettableDecoder = StreamDecoder & {
  _decoder: { reset: () => Promise<void> }
}

async function createDecoder(isFlac: boolean): Promise<StreamDecoder> {
  if (isFlac) {
    const { FLACDecoder } = await import('@wasm-audio-decoders/flac')
    const decoder = new FLACDecoder()
    await decoder.ready
    return decoder
  }
  const { OggVorbisDecoder } = await import('@wasm-audio-decoders/ogg-vorbis')
  const decoder = new OggVorbisDecoder()
  await decoder.ready
  return decoder
}

type Mp3Encoder = Awaited<
  ReturnType<typeof import('wasm-media-encoders').createMp3Encoder>
>

/** 收 PCM、喂 LAME、攒 MP3 字节；configure 延迟到第一个有 PCM 的块（才拿得到真实采样率/声道数） */
class Mp3Sink {
  private encoder: Mp3Encoder
  private buffers: Uint8Array[] = []
  private configured = false
  private channels: 1 | 2 = 2
  totalSamples = 0

  constructor(encoder: Mp3Encoder) {
    this.encoder = encoder
  }

  feed(decoded: DecodedChunk) {
    if (decoded.samplesDecoded === 0) return // 首块可能只含 metadata，无 PCM
    if (!this.configured) {
      this.channels = Math.min(decoded.channelData.length, 2) as 1 | 2
      this.encoder.configure({
        channels: this.channels,
        sampleRate: decoded.sampleRate,
        vbrQuality: VBR_QUALITY,
        // MP3 输出采样率上限 48k：Hi-Res 输入显式钉死，不赌 LAME 缺省启发式选率
        ...(decoded.sampleRate > 48000 ? { outputSampleRate: 48000 as const } : {}),
      })
      this.configured = true
    }
    // 多声道源只取前两声道（FL/FR），与旧 getChannelData(0/1) 行为一致
    const view = this.encoder.encode(decoded.channelData.slice(0, this.channels))
    // encode()/finalize() 返回的 Uint8Array 指向 wasm 内部内存，下次调用会被覆盖，必须立即拷出
    if (view.length > 0) this.buffers.push(new Uint8Array(view))
    this.totalSamples += decoded.samplesDecoded
    if (this.buffers.length >= COALESCE_THRESHOLD) this.coalesce()
  }

  /** 把碎片 Uint8Array 合并成一块，减少 GC 压力 */
  private coalesce() {
    const total = this.buffers.reduce((s, b) => s + b.length, 0)
    const merged = new Uint8Array(total)
    let pos = 0
    for (const buf of this.buffers) { merged.set(buf, pos); pos += buf.length }
    this.buffers = [merged]
  }

  finalize(): Blob {
    const tail = this.encoder.finalize()
    if (tail.length > 0) this.buffers.push(new Uint8Array(tail))
    return new Blob(this.buffers as BlobPart[], { type: 'audio/mpeg' })
  }
}

export async function transcodeToMp3(
  source: Blob,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  // ========== 0. 文件头嗅探（真实字节优先于扩展名） ==========
  const head = new Uint8Array(await source.slice(0, 64).arrayBuffer())
  const format = sniffAudioFormat(head)
  if (!isMp3TranscodableFormat(format)) {
    throw new DecryptError(
      'INVALID_HEADER',
      '这个文件不是可转为 MP3 的有效音频，可能仍是加密文件、已损坏或命名错误',
    )
  }

  if (format === 'm4a') {
    return transcodeM4a(source, onProgress)
  }

  // ========== 1. FLAC / OGG 流式解码 + 编码（原路径不变） ==========
  const decoder = await createDecoder(format === 'flac')
  try {
    const { createMp3Encoder } = await import('wasm-media-encoders')
    const sink = new Mp3Sink(await createMp3Encoder())

    const total = source.size
    for (let offset = 0; offset < total; offset += DECODE_CHUNK_BYTES) {
      // WASM decoder 堆泄漏回收：每 12MB 重建 WASM 实例（codec-parser 不受影响，帧解码无跨帧状态）
      if (offset > 0 && offset % DECODER_RESET_BYTES < DECODE_CHUNK_BYTES) {
        await (decoder as ResettableDecoder)._decoder.reset()
      }
      const end = Math.min(offset + DECODE_CHUNK_BYTES, total)
      const bytes = new Uint8Array(await source.slice(offset, end).arrayBuffer())
      sink.feed(await decoder.decode(bytes))
      onProgress?.((end / total) * 0.98)
    }
    sink.feed(await decoder.flush())

    if (sink.totalSamples === 0) {
      throw new DecryptError(
        'DECRYPT_FAILED',
        '无法从这个文件解出有效的音频数据，文件可能已损坏，请确认它能正常播放',
      )
    }
    const mp3 = sink.finalize()
    onProgress?.(1)
    return mp3
  } finally {
    decoder.free()
  }
}

async function transcodeM4a(
  source: Blob,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const { decodeM4aWithLibAv, decodeM4aWithWebCodecs } = await import('./m4a')
  let furthestProgress = 0
  const progress = (value: number) => {
    furthestProgress = Math.max(furthestProgress, value)
    onProgress?.(furthestProgress)
  }

  // 浏览器验收专用构建开关；生产环境未设置时始终走 WebCodecs 优先。
  if (import.meta.env.VITE_FORCE_M4A_LIBAV === '1') {
    return encodeDecodedM4a(
      (consume) => decodeM4aWithLibAv(source, consume, progress),
      progress,
    )
  }

  try {
    return await encodeDecodedM4a(
      (consume) => decodeM4aWithWebCodecs(source, consume, progress),
      progress,
    )
  } catch (webCodecsError) {
    try {
      return await encodeDecodedM4a(
        (consume) => decodeM4aWithLibAv(source, consume, progress),
        progress,
      )
    } catch (libAvError) {
      throw new DecryptError(
        'AAC_DECODE_FAILED',
        '无法解码这个 M4A 音频，文件可能已损坏或使用了不支持的 AAC 配置',
        new AggregateError(
          [webCodecsError, libAvError],
          'WebCodecs 与 LibAV.js 均解码失败',
        ),
      )
    }
  }
}

async function encodeDecodedM4a(
  decode: (consume: AudioChunkConsumer) => Promise<void>,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const { createMp3Encoder } = await import('wasm-media-encoders')
  const sink = new Mp3Sink(await createMp3Encoder())
  await decode((chunk) => sink.feed(chunk))
  if (sink.totalSamples === 0) throw new Error('AAC 解码结果为空')
  const mp3 = sink.finalize()
  onProgress?.(1)
  return mp3
}
