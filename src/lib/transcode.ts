/**
 * 「强制转 MP3」模块
 *
 * 流程：
 *   1. AudioContext.decodeAudioData() 把任意浏览器原生支持的格式（MP3/FLAC/OGG/WAV）解码成 PCM
 *   2. 转 Float32Array → Int16Array
 *   3. lamejs（动态导入）按 1152 sample 一帧编码成 128kbps CBR MP3
 *
 * 注意：转码是有损的，FLAC → MP3 会有音质降级。
 */

import {
  DecryptError,
  type ProgressCallback,
} from './types'

const TARGET_BITRATE = 128 // kbps
const MP3_FRAME_SAMPLES = 1152

export async function transcodeToMp3(
  source: Blob,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  // ========== 1. 解码到 PCM ==========
  let audioBuffer: AudioBuffer
  try {
    const arrayBuffer = await source.arrayBuffer()
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    try {
      audioBuffer = await ctx.decodeAudioData(arrayBuffer)
    } finally {
      // 关闭 AudioContext，避免泄漏
      if (typeof ctx.close === 'function') {
        ctx.close().catch(() => {})
      }
    }
  } catch (e) {
    throw new DecryptError(
      'DECRYPT_FAILED',
      '当前浏览器无法解码这个音频，请尝试用 Chrome / Edge 打开',
      e,
    )
  }
  onProgress?.(0.1)

  // ========== 2. 拿声道数据并转成 Int16 PCM ==========
  const numChannels = Math.min(audioBuffer.numberOfChannels, 2)
  const sampleRate = audioBuffer.sampleRate
  const totalSamples = audioBuffer.length

  const left = floatToInt16(audioBuffer.getChannelData(0))
  const right =
    numChannels === 2 ? floatToInt16(audioBuffer.getChannelData(1)) : null
  onProgress?.(0.2)

  // ========== 3. 动态加载 lamejs（用 @breezystack/lamejs，原版 ESM 下 cross-file 全局会丢） ==========
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const encoder = new Mp3Encoder(numChannels, sampleRate, TARGET_BITRATE)
  onProgress?.(0.25)

  // ========== 4. 分帧编码 ==========
  const buffers: Uint8Array[] = []
  let processed = 0
  for (let i = 0; i < totalSamples; i += MP3_FRAME_SAMPLES) {
    const leftChunk = left.subarray(i, i + MP3_FRAME_SAMPLES)
    const mp3buf = right
      ? encoder.encodeBuffer(leftChunk, right.subarray(i, i + MP3_FRAME_SAMPLES))
      : encoder.encodeBuffer(leftChunk)
    if (mp3buf.length > 0) buffers.push(mp3buf)

    processed += MP3_FRAME_SAMPLES
    // 每 200 帧（~5s 音频）让一下事件循环并报进度
    if ((processed / MP3_FRAME_SAMPLES) % 200 === 0) {
      onProgress?.(0.25 + Math.min(processed / totalSamples, 1) * 0.7)
      await yieldToEventLoop()
    }
  }
  const tail = encoder.flush()
  if (tail.length > 0) buffers.push(tail)
  onProgress?.(1)

  return new Blob(buffers as BlobPart[], { type: 'audio/mpeg' })
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
