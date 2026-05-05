/**
 * 酷狗 KGM / VPR v2 解密模块
 *
 * 文件结构（按字节偏移）：
 *  1. [0x00 - 0x10]  Magic（KGM 与 VPR 不同）
 *  2. [0x10 - 0x14]  header_len（uint32 小端，通常 0x400）
 *  3. [0x1C - 0x2C]  16 字节文件密钥；算法里末尾追加一个 0 凑成 17 字节
 *  4. [header_len - end] 加密音频字节流
 *
 * 流密码算法（每字节）：
 *   med = enc[i] ^ key[i % 17] ^ MASK_PREDEF[i % 272] ^ MASK_LARGE[i >> 4]
 *   plain[i] = med ^ ((med & 0x0F) << 4)
 *   if VPR: plain[i] ^= MASK_DIFF_VPR[i % 17]
 *
 * MASK_LARGE 是一张 73MB 的查表，但它高度可压缩（公开常数）。
 * 我们打包了前 6.5MB（gzip 压缩到 ~1.1MB，存放于 public/kgm-v2-mask.bin.gz），
 * 这覆盖了「加密音频长度 ≤ 100MB」的文件——和项目整体的单文件上限一致。
 * 解密资源仅在首次解密 KGM/VPR 时一次性拉取，之后浏览器缓存。
 *
 * 全部解密在浏览器内完成，文件不会上传到任何服务器。
 */

import {
  DecryptError,
  type AudioMeta,
  type AudioFormat,
  type DecryptResult,
  type ProgressCallback,
} from './types'

// ============== Magic ==============

const KGM_HEADER = new Uint8Array([
  0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b,
  0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99, 0x14,
])

const VPR_HEADER = new Uint8Array([
  0x05, 0x28, 0xbc, 0x96, 0xe9, 0xe4, 0x5a, 0x43,
  0x91, 0xaa, 0xbd, 0xd0, 0x7a, 0xf5, 0x36, 0x31,
])

// ============== 常量查找表（公开常数） ==============

// 17 × 16 = 272 字节
const MASK_PREDEF = new Uint8Array([
  0xb8, 0xd5, 0x3d, 0xb2, 0xe9, 0xaf, 0x78, 0x8c, 0x83, 0x33, 0x71, 0x51, 0x76, 0xa0, 0xcd, 0x37,
  0x2f, 0x3e, 0x35, 0x8d, 0xa9, 0xbe, 0x98, 0xb7, 0xe7, 0x8c, 0x22, 0xce, 0x5a, 0x61, 0xdf, 0x68,
  0x69, 0x89, 0xfe, 0xa5, 0xb6, 0xde, 0xa9, 0x77, 0xfc, 0xc8, 0xbd, 0xbd, 0xe5, 0x6d, 0x3e, 0x5a,
  0x36, 0xef, 0x69, 0x4e, 0xbe, 0xe1, 0xe9, 0x66, 0x1c, 0xf3, 0xd9, 0x02, 0xb6, 0xf2, 0x12, 0x9b,
  0x44, 0xd0, 0x6f, 0xb9, 0x35, 0x89, 0xb6, 0x46, 0x6d, 0x73, 0x82, 0x06, 0x69, 0xc1, 0xed, 0xd7,
  0x85, 0xc2, 0x30, 0xdf, 0xa2, 0x62, 0xbe, 0x79, 0x2d, 0x62, 0x62, 0x3d, 0x0d, 0x7e, 0xbe, 0x48,
  0x89, 0x23, 0x02, 0xa0, 0xe4, 0xd5, 0x75, 0x51, 0x32, 0x02, 0x53, 0xfd, 0x16, 0x3a, 0x21, 0x3b,
  0x16, 0x0f, 0xc3, 0xb2, 0xbb, 0xb3, 0xe2, 0xba, 0x3a, 0x3d, 0x13, 0xec, 0xf6, 0x01, 0x45, 0x84,
  0xa5, 0x70, 0x0f, 0x93, 0x49, 0x0c, 0x64, 0xcd, 0x31, 0xd5, 0xcc, 0x4c, 0x07, 0x01, 0x9e, 0x00,
  0x1a, 0x23, 0x90, 0xbf, 0x88, 0x1e, 0x3b, 0xab, 0xa6, 0x3e, 0xc4, 0x73, 0x47, 0x10, 0x7e, 0x3b,
  0x5e, 0xbc, 0xe3, 0x00, 0x84, 0xff, 0x09, 0xd4, 0xe0, 0x89, 0x0f, 0x5b, 0x58, 0x70, 0x4f, 0xfb,
  0x65, 0xd8, 0x5c, 0x53, 0x1b, 0xd3, 0xc8, 0xc6, 0xbf, 0xef, 0x98, 0xb0, 0x50, 0x4f, 0x0f, 0xea,
  0xe5, 0x83, 0x58, 0x8c, 0x28, 0x2c, 0x84, 0x67, 0xcd, 0xd0, 0x9e, 0x47, 0xdb, 0x27, 0x50, 0xca,
  0xf4, 0x63, 0x63, 0xe8, 0x97, 0x7f, 0x1b, 0x4b, 0x0c, 0xc2, 0xc1, 0x21, 0x4c, 0xcc, 0x58, 0xf5,
  0x94, 0x52, 0xa3, 0xf3, 0xd3, 0xe0, 0x68, 0xf4, 0x00, 0x23, 0xf3, 0x5e, 0x0a, 0x7b, 0x93, 0xdd,
  0xab, 0x12, 0xb2, 0x13, 0xe8, 0x84, 0xd7, 0xa7, 0x9f, 0x0f, 0x32, 0x4c, 0x55, 0x1d, 0x04, 0x36,
  0x52, 0xdc, 0x03, 0xf3, 0xf9, 0x4e, 0x42, 0xe9, 0x3d, 0x61, 0xef, 0x7c, 0xb6, 0xb3, 0x93, 0x50,
])

// VPR 比 KGM 多一步：解密后再 XOR 这 17 字节
const MASK_DIFF_VPR = new Uint8Array([
  0x25, 0xdf, 0xe8, 0xa6, 0x75, 0x1e, 0x75, 0x0e,
  0x2f, 0x80, 0xf3, 0x2d, 0xb8, 0xb6, 0xe3, 0x11,
  0x00,
])

// 我们打包的 mask 资产覆盖的最大「加密音频字节数」上限
// = mask 字节数 × 16
const MASK_LARGE_RAW_BYTES = 6 * 1024 * 1024 + 512 * 1024 // 6.5 MB
const MAX_KGM_AUDIO_BYTES = MASK_LARGE_RAW_BYTES * 16 // ~104 MB（覆盖项目整体 100MB 单文件上限）

// 文件内容是 gzip 流，但故意不用 .gz 结尾——避免 dev server / 浏览器在 HTTP 层
// 自作主张地按 Content-Encoding: gzip 自动解压一次，导致我们 DecompressionStream
// 收到的是已解压数据再解压一次而炸。我们要完全掌控解压。
const MASK_ASSET_URL = '/kgm-v2-mask.bin'

// 懒加载缓存
let maskLargePromise: Promise<Uint8Array> | null = null

async function loadMaskLarge(): Promise<Uint8Array> {
  if (maskLargePromise) return maskLargePromise
  maskLargePromise = (async () => {
    const res = await fetch(MASK_ASSET_URL)
    if (!res.ok) {
      throw new DecryptError(
        'DECRYPT_FAILED',
        `加载解密资源失败 (${res.status})`,
      )
    }
    if (!res.body) {
      throw new DecryptError('DECRYPT_FAILED', '浏览器不支持流式响应')
    }
    if (typeof DecompressionStream === 'undefined') {
      throw new DecryptError(
        'DECRYPT_FAILED',
        '当前浏览器不支持 gzip 解压，请使用 Chrome / Edge 等现代浏览器',
      )
    }
    const decompressed = res.body.pipeThrough(new DecompressionStream('gzip'))
    const buf = await new Response(decompressed).arrayBuffer()
    return new Uint8Array(buf)
  })()
  try {
    return await maskLargePromise
  } catch (e) {
    // 失败后清空缓存，下次重试
    maskLargePromise = null
    throw e
  }
}

// ============== 主入口 ==============

export async function decryptKgm(
  file: File,
  onProgress?: ProgressCallback,
): Promise<DecryptResult> {
  // ========== 0. 基础校验 ==========
  if (file.size < 0x400) {
    throw new DecryptError(
      'FILE_TOO_SMALL',
      '文件太小，可能未下载完整或已损坏',
    )
  }

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch (e) {
    throw new DecryptError('UNKNOWN', '读取文件失败', e)
  }
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)

  // ========== 1. 魔数校验 ==========
  let isVpr: boolean
  if (bytesEqual(bytes, KGM_HEADER, 0)) {
    isVpr = false
  } else if (bytesEqual(bytes, VPR_HEADER, 0)) {
    isVpr = true
  } else {
    throw new DecryptError(
      'INVALID_HEADER',
      '这不像是 .kgm / .vpr 文件',
    )
  }
  onProgress?.(0.05)

  // ========== 2. 取 header_len 与 key ==========
  const headerLen = view.getUint32(0x10, true)
  if (headerLen >= bytes.length || headerLen < 0x2c) {
    throw new DecryptError('INVALID_HEADER', '文件头长度异常')
  }
  // 16 字节 key，末尾追加 0 凑 17 字节，便于 i % 17 寻址
  const key = new Uint8Array(17)
  key.set(bytes.subarray(0x1c, 0x2c), 0)
  // key[16] 默认 0
  onProgress?.(0.1)

  // ========== 3. 大表懒加载 ==========
  const audioLen = bytes.length - headerLen
  if (audioLen > MAX_KGM_AUDIO_BYTES) {
    throw new DecryptError(
      'FILE_TOO_LARGE',
      `酷狗格式当前最大支持 ${(MAX_KGM_AUDIO_BYTES / 1024 / 1024) | 0}MB 加密音频`,
    )
  }
  let maskLarge: Uint8Array
  try {
    maskLarge = await loadMaskLarge()
  } catch (e) {
    if (e instanceof DecryptError) throw e
    throw new DecryptError('DECRYPT_FAILED', '加载解密资源失败', e)
  }
  onProgress?.(0.15)

  // ========== 4. 流密码解密 ==========
  // 把加密区拷出来，避免破坏原始 buffer（需要保留 buffer 不被原地改动可能更安全）
  const audio = new Uint8Array(audioLen)
  audio.set(bytes.subarray(headerLen))

  const CHUNK = 256 * 1024
  for (let start = 0; start < audioLen; start += CHUNK) {
    const end = Math.min(start + CHUNK, audioLen)
    for (let i = start; i < end; i++) {
      const med =
        audio[i] ^ key[i % 17] ^ MASK_PREDEF[i % 272] ^ maskLarge[i >> 4]
      let v = med ^ ((med & 0x0f) << 4)
      if (isVpr) v ^= MASK_DIFF_VPR[i % 17]
      audio[i] = v
    }
    onProgress?.(0.15 + (end / audioLen) * 0.8)
    if (end < audioLen) await yieldToEventLoop()
  }

  // ========== 5. 识别格式 ==========
  const format = sniffAudioFormat(audio)
  if (!format) {
    // 99% 是 v4（密钥需要联网获取），剩下是文件损坏
    throw new DecryptError(
      'KGM_V4_UNSUPPORTED',
      '这可能是酷狗新版加密格式（v4），本工具暂不支持。请尝试用酷狗客户端导出 MP3。',
    )
  }

  // ========== 6. 输出 ==========
  const mimeType =
    format === 'mp3' ? 'audio/mpeg' : format === 'flac' ? 'audio/flac' : 'audio/ogg'
  const audioBlob = new Blob([audio], { type: mimeType })

  const baseName = file.name.replace(/\.(kgm|vpr)$/i, '')
  // 酷狗下载的文件名一般是「歌手 - 歌名.kgm」，按首个 ' - ' 拆
  const sepIdx = baseName.indexOf(' - ')
  const meta: AudioMeta =
    sepIdx > 0
      ? {
          musicName: baseName.slice(sepIdx + 3).trim(),
          artist: [[baseName.slice(0, sepIdx).trim(), 0]],
          source: isVpr ? 'vpr' : 'kgm',
        }
      : {
          musicName: baseName,
          source: isVpr ? 'vpr' : 'kgm',
        }
  const suggestedName = sanitizeFilename(`${baseName}.${format}`)

  onProgress?.(1)

  return {
    audio: audioBlob,
    format,
    meta,
    cover: null,
    suggestedName,
  }
}

// ============== 工具函数 ==============

function bytesEqual(buf: Uint8Array, target: Uint8Array, offset: number): boolean {
  if (buf.length < offset + target.length) return false
  for (let i = 0; i < target.length; i++) {
    if (buf[offset + i] !== target[i]) return false
  }
  return true
}

function sniffAudioFormat(bytes: Uint8Array): AudioFormat | null {
  if (bytes.length < 4) return null
  // FLAC: "fLaC"
  if (
    bytes[0] === 0x66 &&
    bytes[1] === 0x4c &&
    bytes[2] === 0x61 &&
    bytes[3] === 0x43
  ) {
    return 'flac'
  }
  // OGG: "OggS"
  if (
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return 'ogg'
  }
  // MP3: ID3 tag
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'mp3'
  }
  // MP3: MPEG sync (0xFF Ex/Fx)
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'mp3'
  }
  return null
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
