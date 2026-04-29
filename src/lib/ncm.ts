/**
 * NCM 文件解密模块
 *
 * 网易云音乐的 .ncm 文件本质是「加了壳」的 MP3 / FLAC。
 * 文件结构（按字节偏移依次读取）：
 *
 *  1.  [8 字节]   魔数 "CTENFDAM"，用于识别文件类型
 *  2.  [2 字节]   填充，跳过
 *  3.  [4 字节]   RC4 密钥长度（uint32 小端）
 *  4.  [N 字节]   RC4 密钥（先每字节 ^0x64，再 AES-ECB 解密，再去掉前缀 17 字节）
 *  5.  [4 字节]   元数据长度（uint32 小端）
 *  6.  [N 字节]   元数据（每字节 ^0x63 → 去前缀 22 字节 → base64 解码 → AES-ECB 解密 → JSON）
 *  7.  [4 字节]   CRC32 校验码，跳过
 *  8.  [5 字节]   未知填充，跳过
 *  9.  [4 字节]   封面图长度（uint32 小端）
 *  10. [N 字节]   封面图原始字节（通常是 JPEG）
 *  11. [剩余]     音频数据，用 RC4-like 流密码解密
 *
 * 全部解密在浏览器内完成，文件不会上传到任何服务器。
 */

import aesjs from 'aes-js'
import { ID3Writer } from 'browser-id3-writer'

// 两个固定的 AES 密钥（来自网易云客户端，业内公开）
const CORE_KEY = new Uint8Array([
  0x68, 0x7a, 0x48, 0x52, 0x41, 0x6d, 0x73, 0x6f,
  0x35, 0x6b, 0x49, 0x6e, 0x62, 0x61, 0x78, 0x57,
])
const META_KEY = new Uint8Array([
  0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21,
  0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28,
])

// 错误码：与 UI 友好提示一一对应
export type NcmErrorCode =
  | 'INVALID_HEADER' // 不是 NCM 文件
  | 'FILE_TOO_SMALL' // 文件太小
  | 'DECRYPT_FAILED' // 解密过程异常
  | 'UNKNOWN' // 兜底

export class NcmError extends Error {
  code: NcmErrorCode
  cause?: unknown
  constructor(code: NcmErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'NcmError'
    this.code = code
    this.cause = cause
  }
}

// 元数据 JSON 的常见字段
export interface NcmMeta {
  musicName?: string
  artist?: [string, number][]
  album?: string
  format?: string
  duration?: number
  bitrate?: number
  albumPic?: string
}

export interface DecryptResult {
  audio: Blob
  format: 'mp3' | 'flac'
  meta: NcmMeta
  cover: Blob | null
  suggestedName: string
}

// 进度回调，传入 0 ~ 1 的进度值
export type ProgressCallback = (progress: number) => void

/**
 * 主入口。失败时抛出 NcmError。
 * @param file 浏览器 File 对象
 * @param onProgress 进度回调（可选）
 */
export async function decryptNcm(
  file: File,
  onProgress?: ProgressCallback,
): Promise<DecryptResult> {
  // ========== 0. 基础校验 ==========
  if (file.size < 1024) {
    throw new NcmError(
      'FILE_TOO_SMALL',
      '文件太小，可能未下载完整或已损坏',
    )
  }

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch (e) {
    throw new NcmError('UNKNOWN', '读取文件失败', e)
  }
  const view = new DataView(buffer)
  let offset = 0

  // ========== 1. 魔数校验 ==========
  const magic = bytesToString(new Uint8Array(buffer, 0, 8))
  if (magic !== 'CTENFDAM') {
    throw new NcmError('INVALID_HEADER', '这不像是 NCM 文件')
  }
  offset = 10
  onProgress?.(0.05)

  // ========== 2. 解出 RC4 密钥 ==========
  let rc4Key: Uint8Array
  try {
    const keyLen = view.getUint32(offset, true)
    offset += 4
    const keyEncrypted = new Uint8Array(buffer.slice(offset, offset + keyLen))
    offset += keyLen
    for (let i = 0; i < keyEncrypted.length; i++) keyEncrypted[i] ^= 0x64
    const keyDecrypted = aesEcbDecrypt(keyEncrypted, CORE_KEY)
    rc4Key = keyDecrypted.slice(17)
  } catch (e) {
    throw new NcmError(
      'DECRYPT_FAILED',
      '解密失败，文件可能已损坏或加密方式不同',
      e,
    )
  }
  onProgress?.(0.1)

  // ========== 3. 解出元数据 ==========
  const metaLen = view.getUint32(offset, true)
  offset += 4
  let meta: NcmMeta = {}
  if (metaLen > 0) {
    const metaEncrypted = new Uint8Array(buffer.slice(offset, offset + metaLen))
    offset += metaLen
    for (let i = 0; i < metaEncrypted.length; i++) metaEncrypted[i] ^= 0x63
    try {
      const b64Str = bytesToString(metaEncrypted.slice(22))
      const b64Decoded = base64Decode(b64Str)
      const metaJson = aesEcbDecrypt(b64Decoded, META_KEY)
      const jsonStr = new TextDecoder().decode(metaJson)
      const colonIdx = jsonStr.indexOf(':')
      meta = JSON.parse(jsonStr.slice(colonIdx + 1))
    } catch {
      // 元数据失败不影响主流程，吞掉
      meta = {}
    }
  }
  onProgress?.(0.15)

  // ========== 4. 跳过 CRC32 + 5 字节填充 ==========
  offset += 9

  // ========== 5. 提取封面图 ==========
  const coverLen = view.getUint32(offset, true)
  offset += 4
  let cover: Blob | null = null
  if (coverLen > 0) {
    const coverBytes = new Uint8Array(buffer.slice(offset, offset + coverLen))
    cover = new Blob([coverBytes], { type: 'image/jpeg' })
  }
  offset += coverLen
  onProgress?.(0.2)

  // ========== 6. 解密音频数据（RC4 流密码，分块以汇报进度） ==========
  const audioData = new Uint8Array(buffer.slice(offset))
  let keyBox: Uint8Array
  try {
    keyBox = buildKeyBox(rc4Key)
  } catch (e) {
    throw new NcmError('DECRYPT_FAILED', '生成解密密钥失败', e)
  }

  // 切块大小：256KB。每块结束后让出主线程并汇报进度。
  const CHUNK = 256 * 1024
  const total = audioData.length
  for (let start = 0; start < total; start += CHUNK) {
    const end = Math.min(start + CHUNK, total)
    for (let i = start; i < end; i++) {
      const j = (i + 1) & 0xff
      audioData[i] ^=
        keyBox[(keyBox[j] + keyBox[(keyBox[j] + j) & 0xff]) & 0xff]
    }
    // RC4 解密占总进度 20% → 90%，按数据比例线性分配
    const decryptProgress = end / total
    onProgress?.(0.2 + decryptProgress * 0.7)
    // 让出事件循环，让 UI 能更新
    if (end < total) await yieldToEventLoop()
  }

  // ========== 7. 识别格式 ==========
  let format: 'mp3' | 'flac' = 'mp3'
  if (
    audioData[0] === 0x66 &&
    audioData[1] === 0x4c &&
    audioData[2] === 0x61 &&
    audioData[3] === 0x43
  ) {
    format = 'flac'
  } else if (meta.format?.toLowerCase() === 'flac') {
    format = 'flac'
  }

  // ========== 8. 写入 ID3 标签（仅 MP3） ==========
  let audio: Blob = new Blob([audioData], {
    type: format === 'flac' ? 'audio/flac' : 'audio/mpeg',
  })
  if (format === 'mp3') {
    try {
      const writer = new ID3Writer(audioData.buffer)
      if (meta.musicName) writer.setFrame('TIT2', meta.musicName)
      if (meta.artist?.length) {
        writer.setFrame(
          'TPE1',
          meta.artist.map((a) => a[0]),
        )
      }
      if (meta.album) writer.setFrame('TALB', meta.album)
      if (cover) {
        const coverArrayBuffer = await cover.arrayBuffer()
        writer.setFrame('APIC', {
          type: 3,
          data: coverArrayBuffer,
          description: 'Cover',
        })
      }
      writer.addTag()
      audio = writer.getBlob()
    } catch {
      // 标签写入失败不影响主流程
    }
  }
  onProgress?.(1)

  // ========== 9. 推荐文件名 ==========
  const title = meta.musicName || file.name.replace(/\.ncm$/i, '')
  const artists = meta.artist?.map((a) => a[0]).join(', ') || ''
  const suggestedName = artists
    ? sanitizeFilename(`${artists} - ${title}.${format}`)
    : sanitizeFilename(`${title}.${format}`)

  return { audio, format, meta, cover, suggestedName }
}

// ========== 工具函数 ==========

function aesEcbDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const ecb = new aesjs.ModeOfOperation.ecb(key)
  const decrypted = ecb.decrypt(data)
  const padLen = decrypted[decrypted.length - 1]
  if (padLen > 0 && padLen <= 16) {
    return decrypted.slice(0, decrypted.length - padLen)
  }
  return decrypted
}

function buildKeyBox(key: Uint8Array): Uint8Array {
  const box = new Uint8Array(256)
  for (let i = 0; i < 256; i++) box[i] = i
  let lastByte = 0
  let keyOffset = 0
  for (let i = 0; i < 256; i++) {
    const swap = box[i]
    const c = (swap + lastByte + key[keyOffset]) & 0xff
    keyOffset = (keyOffset + 1) % key.length
    box[i] = box[c]
    box[c] = swap
    lastByte = c
  }
  return box
}

function bytesToString(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

function base64Decode(str: string): Uint8Array {
  const binary = atob(str)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}

// 让出主线程一帧，避免长任务阻塞 UI
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
