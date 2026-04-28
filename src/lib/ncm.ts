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
// CORE_KEY 用于解密 RC4 密钥
const CORE_KEY = new Uint8Array([
  0x68, 0x7a, 0x48, 0x52, 0x41, 0x6d, 0x73, 0x6f,
  0x35, 0x6b, 0x49, 0x6e, 0x62, 0x61, 0x78, 0x57,
])
// META_KEY 用于解密元数据 JSON
const META_KEY = new Uint8Array([
  0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21,
  0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28,
])

// 元数据 JSON 的常见字段
export interface NcmMeta {
  musicName?: string
  artist?: [string, number][] // 形如 [["周杰伦", 6452], ...]
  album?: string
  format?: string // "mp3" 或 "flac"
  duration?: number
  bitrate?: number
  albumPic?: string
}

// 解密结果
export interface DecryptResult {
  audio: Blob // 解密后的音频，可直接下载或播放
  format: 'mp3' | 'flac' // 内部真实格式（自动从音频头识别）
  meta: NcmMeta // 元数据（可能为空）
  cover: Blob | null // 专辑封面（可能为 null）
  suggestedName: string // 推荐的下载文件名，如 "周杰伦 - 晴天.mp3"
}

/**
 * 主入口：传入一个浏览器 File 对象，返回解密结果。
 * 失败时抛出 Error。
 */
export async function decryptNcm(file: File): Promise<DecryptResult> {
  const buffer = await file.arrayBuffer()
  const view = new DataView(buffer)
  let offset = 0

  // ========== 1. 魔数校验 ==========
  const magic = bytesToString(new Uint8Array(buffer, 0, 8))
  if (magic !== 'CTENFDAM') {
    throw new Error('不是有效的 NCM 文件（文件头不匹配）')
  }
  offset = 10 // 8 字节魔数 + 2 字节填充

  // ========== 2. 解出 RC4 密钥 ==========
  const keyLen = view.getUint32(offset, true)
  offset += 4
  const keyEncrypted = new Uint8Array(buffer.slice(offset, offset + keyLen))
  offset += keyLen
  for (let i = 0; i < keyEncrypted.length; i++) keyEncrypted[i] ^= 0x64
  const keyDecrypted = aesEcbDecrypt(keyEncrypted, CORE_KEY)
  // 去掉前缀 "neteasecloudmusic" (17 字节)
  const rc4Key = keyDecrypted.slice(17)

  // ========== 3. 解出元数据 ==========
  const metaLen = view.getUint32(offset, true)
  offset += 4
  let meta: NcmMeta = {}
  if (metaLen > 0) {
    const metaEncrypted = new Uint8Array(buffer.slice(offset, offset + metaLen))
    offset += metaLen
    for (let i = 0; i < metaEncrypted.length; i++) metaEncrypted[i] ^= 0x63
    try {
      // 去掉前缀 "163 key(Don't modify):" (22 字节)
      const b64Str = bytesToString(metaEncrypted.slice(22))
      const b64Decoded = base64Decode(b64Str)
      const metaJson = aesEcbDecrypt(b64Decoded, META_KEY)
      // 解出来形如 "music:{...}"，去掉前缀
      const jsonStr = new TextDecoder().decode(metaJson)
      const colonIdx = jsonStr.indexOf(':')
      meta = JSON.parse(jsonStr.slice(colonIdx + 1))
    } catch {
      // 元数据解析失败不影响音频解密，吞掉
      meta = {}
    }
  }

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

  // ========== 6. 解密音频数据 ==========
  const audioData = new Uint8Array(buffer.slice(offset))
  const keyBox = buildKeyBox(rc4Key)
  for (let i = 0; i < audioData.length; i++) {
    const j = (i + 1) & 0xff
    audioData[i] ^=
      keyBox[(keyBox[j] + keyBox[(keyBox[j] + j) & 0xff]) & 0xff]
  }

  // 从音频头识别真实格式：FLAC 文件以 "fLaC" 开头
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

  // 把元数据和封面写回音频文件内部，让 Apple Music 等播放器能识别
  // 目前只处理 MP3 的 ID3v2 标签；FLAC 标签写入将在后续版本支持
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
          type: 3, // 3 = 封面图（front cover）
          data: coverArrayBuffer,
          description: 'Cover',
        })
      }
      writer.addTag()
      audio = writer.getBlob()
    } catch {
      // 标签写入失败不影响主流程，使用未打标签的原始音频
    }
  }

  // 推荐文件名："艺术家 - 歌曲名.格式"，没有元数据时退回原文件名
  const title = meta.musicName || file.name.replace(/\.ncm$/i, '')
  const artists = meta.artist?.map((a) => a[0]).join(', ') || ''
  const suggestedName = artists
    ? sanitizeFilename(`${artists} - ${title}.${format}`)
    : sanitizeFilename(`${title}.${format}`)

  return { audio, format, meta, cover, suggestedName }
}

// ========== 工具函数 ==========

/** AES-128-ECB 解密，自动去 PKCS7 填充 */
function aesEcbDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  // aes-js 的 ModeOfOperation.ecb 解密块大小必须是 16 的倍数
  const ecb = new aesjs.ModeOfOperation.ecb(key)
  const decrypted = ecb.decrypt(data)
  // 去掉 PKCS7 填充
  const padLen = decrypted[decrypted.length - 1]
  if (padLen > 0 && padLen <= 16) {
    return decrypted.slice(0, decrypted.length - padLen)
  }
  return decrypted
}

/** 构建 RC4-like 解密用的 256 字节 keyBox（KSA 变体） */
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

/** 文件名里去掉非法字符（Windows / Mac 通用安全集） */
function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}
