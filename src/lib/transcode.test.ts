import assert from 'node:assert/strict'
import test from 'node:test'
import { createOggEncoder } from 'wasm-media-encoders'
import { writeId3ToMp3 } from './metadata'
import { TRANSCODE_ENCODER, transcodeToMp3 } from './transcode'

const SAMPLE_RATE = 44100
const DURATION_SECONDS = 12
const SILENCE_SECONDS = 1
const PCM_CHUNK_SAMPLES = 4096

type Mp3Frame = {
  bitrateKbps: number
  byteLength: number
  sampleRate: number
  samples: number
}

test('CBR 转码产物在安静片头场景仍保持准确时长', async () => {
  const source = await buildQuietIntroOgg()
  const rawMp3 = await transcodeToMp3(source)
  const taggedMp3 = await writeId3ToMp3(rawMp3, null, {
    musicName: 'CBR 时长验收',
    artist: [['拾音测试', 0]],
  })
  const bytes = new Uint8Array(await taggedMp3.arrayBuffer())
  const frames = parseMp3Frames(bytes)

  assert.equal(TRANSCODE_ENCODER, 'wasm-lame-cbr-192')
  assert.ok(frames.length > 0, '产物必须包含有效 MP3 帧')
  assert.deepEqual(
    [...new Set(frames.map((frame) => frame.bitrateKbps))],
    [192],
    '44.1kHz 输出的全部音频帧都应保持 192 kbps CBR',
  )

  const frameDuration = frames.reduce(
    (seconds, frame) => seconds + frame.samples / frame.sampleRate,
    0,
  )
  assert.ok(
    Math.abs(frameDuration - DURATION_SECONDS) <= 0.1,
    `输出帧时长 ${frameDuration.toFixed(3)}s 应与输入 ${DURATION_SECONDS}s 接近`,
  )

  // 无 Xing 头的播放器常按首帧码率和音频字节数估算时长。
  // CBR 产物必须让这种保守算法也得到正确结果，覆盖“4 分钟显示成十几分钟”的回归。
  const audioBytes = frames.reduce((total, frame) => total + frame.byteLength, 0)
  const estimatedDuration = (audioBytes * 8) / (frames[0].bitrateKbps * 1000)
  assert.ok(
    Math.abs(estimatedDuration - frameDuration) <= 0.05,
    `首帧估算 ${estimatedDuration.toFixed(3)}s 应与帧时长 ${frameDuration.toFixed(3)}s 一致`,
  )
})

async function buildQuietIntroOgg(): Promise<Blob> {
  const encoder = await createOggEncoder()
  encoder.configure({
    channels: 2,
    sampleRate: SAMPLE_RATE,
    vbrQuality: 3,
    oggSerialNo: 1,
  })
  const buffers: Uint8Array[] = []
  const totalSamples = SAMPLE_RATE * DURATION_SECONDS
  let seed = 0x12345678

  const randomSample = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return (seed / 0x100000000) * 2 - 1
  }

  for (let offset = 0; offset < totalSamples; offset += PCM_CHUNK_SAMPLES) {
    const length = Math.min(PCM_CHUNK_SAMPLES, totalSamples - offset)
    const left = new Float32Array(length)
    const right = new Float32Array(length)
    for (let i = 0; i < length; i++) {
      if (offset + i < SAMPLE_RATE * SILENCE_SECONDS) continue
      left[i] = randomSample() * 0.65
      right[i] = randomSample() * 0.65
    }
    const encoded = encoder.encode([left, right])
    if (encoded.length > 0) buffers.push(new Uint8Array(encoded))
  }

  const tail = encoder.finalize()
  if (tail.length > 0) buffers.push(new Uint8Array(tail))
  return new Blob(buffers as BlobPart[], { type: 'audio/ogg' })
}

function parseMp3Frames(bytes: Uint8Array): Mp3Frame[] {
  const frames: Mp3Frame[] = []
  let offset = skipId3v2(bytes)

  while (offset + 4 <= bytes.length) {
    const header = readUint32BE(bytes, offset)
    assert.equal(
      (header & 0xffe00000) >>> 0,
      0xffe00000,
      `offset ${offset} 缺少 MP3 sync`,
    )

    const version = (header >>> 19) & 0b11
    const layer = (header >>> 17) & 0b11
    const bitrateIndex = (header >>> 12) & 0b1111
    const sampleRateIndex = (header >>> 10) & 0b11
    const padding = (header >>> 9) & 1
    assert.notEqual(version, 0b01, 'MPEG version 不能是保留值')
    assert.equal(layer, 0b01, '产物必须是 MPEG Layer III')
    assert.ok(bitrateIndex > 0 && bitrateIndex < 15, 'MP3 码率索引必须有效')
    assert.ok(sampleRateIndex < 3, 'MP3 采样率索引必须有效')

    const mpeg1 = version === 0b11
    const bitrateTable = mpeg1
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    const baseSampleRate = [44100, 48000, 32000][sampleRateIndex]
    const sampleRate = version === 0b11
      ? baseSampleRate
      : version === 0b10
        ? baseSampleRate / 2
        : baseSampleRate / 4
    const bitrateKbps = bitrateTable[bitrateIndex]
    const byteLength = Math.floor(
      ((mpeg1 ? 144 : 72) * bitrateKbps * 1000) / sampleRate,
    ) + padding
    assert.ok(offset + byteLength <= bytes.length, '最后一个 MP3 帧不能被截断')

    frames.push({
      bitrateKbps,
      byteLength,
      sampleRate,
      samples: mpeg1 ? 1152 : 576,
    })
    offset += byteLength
  }

  assert.equal(offset, bytes.length, 'MP3 音频帧之后不应有无法解释的尾部字节')
  return frames
}

function skipId3v2(bytes: Uint8Array): number {
  if (
    bytes.length < 10 ||
    bytes[0] !== 0x49 ||
    bytes[1] !== 0x44 ||
    bytes[2] !== 0x33
  ) return 0
  const size =
    ((bytes[6] & 0x7f) << 21) |
    ((bytes[7] & 0x7f) << 14) |
    ((bytes[8] & 0x7f) << 7) |
    (bytes[9] & 0x7f)
  return 10 + size + ((bytes[5] & 0x10) !== 0 ? 10 : 0)
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>> 0
  )
}
