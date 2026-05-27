/**
 * 「强制转 MP3」模块
 *
 * 流程：
 *   1. AudioContext.decodeAudioData() 把任意浏览器原生支持的格式（MP3/FLAC/OGG/WAV）解码成 PCM
 *   2. 拿 Float32 声道数据（编码器直接吃 Float32，不用先转 Int16）
 *   3. wasm-media-encoders（动态导入）按 LAME -V 2 编码，平均 ~190 kbps VBR
 *
 * 注意：转码仍是有损的，但 -V 2 接近无损（普通耳几乎 ABX 失败）；
 * 文件比 v0.6.1 的 128 CBR 大约 +50%。
 */

import {
  DecryptError,
  type ProgressCallback,
} from './types'

const VBR_QUALITY = 2 // LAME -V 2，平均 ~190 kbps
const FRAME_SAMPLES = 1152 // MP3 帧样本数；用于节流 + 进度，编码器内部对齐由库处理
const ENCODER_TAG = 'wasm-lame-v2'

export const TRANSCODE_ENCODER = ENCODER_TAG

export async function transcodeToMp3(
  source: Blob,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const arrayBuffer = await source.arrayBuffer()

  // ========== 0. 文件头嗅探：把「假 FLAC」与「真 FLAC 但浏览器解不了」分开报错 ==========
  // FLAC: 66 4c 61 43 ("fLaC")  /  Ogg: 4f 67 67 53 ("OggS"，可能是 Ogg-Vorbis 或 Ogg-FLAC)
  const head = new Uint8Array(arrayBuffer, 0, Math.min(4, arrayBuffer.byteLength))
  const isFlac =
    head.length >= 4 &&
    head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43
  const isOgg =
    head.length >= 4 &&
    head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53
  if (!isFlac && !isOgg) {
    throw new DecryptError(
      'INVALID_HEADER',
      '这个文件可能不是有效的 FLAC（看起来像加密文件或命名错误），请确认源文件是否真的已解密',
    )
  }

  // ========== 1. 解码到 PCM ==========
  let audioBuffer: AudioBuffer
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    } finally {
      if (typeof ctx.close === 'function') {
        ctx.close().catch(() => {})
      }
    }
  } catch (e) {
    if (isFlac) {
      throw new DecryptError(
        'HIRES_NOT_SUPPORTED',
        '这个 FLAC 可能是 Hi-Res（24-bit 或 ≥96kHz），当前浏览器内置解码器不支持。建议在桌面版 Chrome / Edge 重试',
        e,
      )
    }
    throw new DecryptError(
      'DECRYPT_FAILED',
      '转码失败：当前浏览器无法解码这个音频，请尝试用 Chrome / Edge 打开',
      e,
    )
  }
  onProgress?.(0.1)

  // ========== 2. 拿 Float32 声道数据 ==========
  const numChannels = Math.min(audioBuffer.numberOfChannels, 2) as 1 | 2
  const sampleRate = audioBuffer.sampleRate
  const totalSamples = audioBuffer.length

  const left = audioBuffer.getChannelData(0)
  const right = numChannels === 2 ? audioBuffer.getChannelData(1) : null
  onProgress?.(0.2)

  // ========== 3. 动态加载 wasm-media-encoders（LAME WASM 编译） ==========
  const { createMp3Encoder } = await import('wasm-media-encoders')
  const encoder = await createMp3Encoder()
  encoder.configure({
    channels: numChannels,
    sampleRate,
    vbrQuality: VBR_QUALITY,
  })
  onProgress?.(0.25)

  // ========== 4. 分帧编码 ==========
  // 关键：encoder.encode() / finalize() 返回的 Uint8Array 指向 wasm 内部内存，
  // 下次调用会被覆盖；必须立即用 new Uint8Array(view) 拷出来再 push
  const buffers: Uint8Array[] = []
  let processed = 0
  for (let i = 0; i < totalSamples; i += FRAME_SAMPLES) {
    const leftChunk = left.subarray(i, i + FRAME_SAMPLES)
    const view = right
      ? encoder.encode([leftChunk, right.subarray(i, i + FRAME_SAMPLES)])
      : encoder.encode([leftChunk])
    if (view.length > 0) buffers.push(new Uint8Array(view))

    processed += FRAME_SAMPLES
    // 每 200 帧（~5s 音频）让一下事件循环并报进度
    if ((processed / FRAME_SAMPLES) % 200 === 0) {
      onProgress?.(0.25 + Math.min(processed / totalSamples, 1) * 0.7)
      await yieldToEventLoop()
    }
  }
  const tail = encoder.finalize()
  if (tail.length > 0) buffers.push(new Uint8Array(tail))
  onProgress?.(1)

  return new Blob(buffers as BlobPart[], { type: 'audio/mpeg' })
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
