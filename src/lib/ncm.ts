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
import {
  DecryptError,
  type AudioMeta,
  type DecryptResult,
  type ProgressCallback,
} from './types'
import { stripFileExtensions } from './filename'
import { writeId3ToMp3, writeFlacMeta } from './metadata'
import { sniffAudioFormat } from './sniff'

// 两个固定的 AES 密钥（来自网易云客户端，业内公开）
const CORE_KEY = new Uint8Array([
  0x68, 0x7a, 0x48, 0x52, 0x41, 0x6d, 0x73, 0x6f,
  0x35, 0x6b, 0x49, 0x6e, 0x62, 0x61, 0x78, 0x57,
])
const META_KEY = new Uint8Array([
  0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21,
  0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28,
])

/**
 * 主入口。失败时抛出 DecryptError。
 * @param file 浏览器 File 对象
 * @param onProgress 进度回调（可选）
 */
export async function decryptNcm(
  file: File,
  onProgress?: ProgressCallback,
): Promise<DecryptResult> {
  // ========== 0. 基础校验 ==========
  if (file.size < 1024) {
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
  const view = new DataView(buffer)
  let offset = 0

  // ========== 1. 魔数校验 ==========
  const magic = bytesToString(new Uint8Array(buffer, 0, 8))
  if (magic !== 'CTENFDAM') {
    throw new DecryptError('INVALID_HEADER', '这不像是 NCM 文件')
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
    throw new DecryptError(
      'DECRYPT_FAILED',
      '解密失败，文件可能已损坏或加密方式不同',
      e,
    )
  }
  onProgress?.(0.1)

  // ========== 3. 解出元数据 ==========
  const metaLen = view.getUint32(offset, true)
  offset += 4
  let meta: AudioMeta = { source: 'ncm' }
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
      meta = { source: 'ncm', ...JSON.parse(jsonStr.slice(colonIdx + 1)) }
    } catch {
      // 元数据失败不影响主流程，吞掉
      meta = { source: 'ncm' }
    }
  }
  onProgress?.(0.15)

  // ========== 4. 跳过 CRC32(4) + 1 字节间隙 ==========
  offset += 5

  // ========== 5. 提取封面图 ==========
  // 封面区有【两个】u32 长度字段：
  //   imageSpace —— 为封面预留的总空间，音频紧跟在这段之后开始
  //   coverLen   —— 实际内嵌的封面字节数（≤ imageSpace），其余为 padding
  // 新版网易云客户端下载的文件常不再内嵌封面（coverLen=0）但仍预留空间
  // （imageSpace 数 KB），封面只留 meta.albumPic URL。必须按 imageSpace 跳过
  // 整段预留空间才能对齐音频起点——只按 coverLen 跳会让 RC4 keystream 错位、
  // 整段音频变乱码（旧版 imageSpace==coverLen 时歪打正着，才一直没暴露）。
  const imageSpace = view.getUint32(offset, true)
  offset += 4
  const coverLen = view.getUint32(offset, true)
  offset += 4
  const imageRegionStart = offset // 封面 + padding 区起点（= metaEnd+13）
  let cover: Blob | null = null
  if (coverLen > 0) {
    const coverBytes = new Uint8Array(buffer.slice(offset, offset + coverLen))
    // NCM 容器对 cover 字段不带 mime 信息，硬编码 image/jpeg 仅用于 Blob.type，
    // 浏览器 img 标签宽容能渲染各种格式；下游 browser-id3-writer 会按 magic 二次嗅探
    cover = new Blob([coverBytes as BlobPart], { type: 'image/jpeg' })
  }
  onProgress?.(0.2)

  // ========== 6. 定位音频起点（魔数锚定，可自愈未知偏移变体） ==========
  let keyBox: Uint8Array
  try {
    keyBox = buildKeyBox(rc4Key)
  } catch (e) {
    throw new DecryptError('DECRYPT_FAILED', '生成解密密钥失败', e)
  }
  const allBytes = new Uint8Array(buffer)
  // 主偏移 = imageRegionStart + imageSpace（按规范）。若该处解出的头部不是合法音频，
  // 说明遇到未知偏移变体，在有界窗口内用 magic 锚定扫描找回真正起点（详见 resolveAudioStart）。
  const { start: audioStart, recovered: offsetRecovered } = resolveAudioStart(
    allBytes,
    keyBox,
    imageRegionStart + imageSpace,
    imageRegionStart,
  )

  // ========== 7. 解密音频数据（RC4 流密码，分块以汇报进度） ==========
  const audioData = allBytes.slice(audioStart)
  const CHUNK = 256 * 1024 // 每块结束后让出主线程并汇报进度
  const total = audioData.length
  for (let start = 0; start < total; start += CHUNK) {
    const end = Math.min(start + CHUNK, total)
    for (let i = start; i < end; i++) {
      audioData[i] ^= ncmKeystreamByte(keyBox, i)
    }
    // RC4 解密占总进度 20% → 90%，按数据比例线性分配
    onProgress?.(0.2 + (end / total) * 0.7)
    if (end < total) await yieldToEventLoop()
  }

  // ========== 8. 识别格式 ==========
  // resolveAudioStart 已保证头部是合法音频 magic；按真实 magic 定格式（不再信 meta.format）。
  const format: 'mp3' | 'flac' = sniffAudioFormat(audioData) === 'flac' ? 'flac' : 'mp3'

  // ========== 9. 写入标签（MP3 用 ID3v2 / FLAC 用 VORBIS_COMMENT + PICTURE） ==========
  let audio: Blob = new Blob([audioData as BlobPart], {
    type: format === 'flac' ? 'audio/flac' : 'audio/mpeg',
  })
  try {
    if (format === 'mp3') {
      audio = await writeId3ToMp3(audio, cover, meta)
    } else if (format === 'flac') {
      audio = await writeFlacMeta(audio, cover, meta)
    }
  } catch {
    // 标签写入失败不影响主流程
  }
  onProgress?.(1)

  // ========== 10. 推荐文件名 ==========
  const title = meta.musicName || stripFileExtensions(file.name)
  const artists = meta.artist?.map((a) => a[0]).join(', ') || ''
  const suggestedName = artists
    ? sanitizeFilename(`${artists} - ${title}.${format}`)
    : sanitizeFilename(`${title}.${format}`)

  return { audio, format, meta, cover, suggestedName, offsetRecovered }
}

// ========== 音频起点定位（魔数锚定自愈） ==========

const NCM_SCAN_WINDOW = 4 * 1024 * 1024 // 自愈扫描窗口上限：足够覆盖 imageSpace 类偏移错位

/** NCM RC4-like 流密码在「距音频起点第 i 字节」处的 keystream 字节 */
function ncmKeystreamByte(keyBox: Uint8Array, i: number): number {
  const j = (i + 1) & 0xff
  return keyBox[(keyBox[j] + keyBox[(keyBox[j] + j) & 0xff]) & 0xff]
}

/** 把 fileOffset 当作音频起点，解出前 count 字节（keystream 下标 0..count-1） */
function decryptHeadAt(
  bytes: Uint8Array,
  keyBox: Uint8Array,
  fileOffset: number,
  count: number,
): Uint8Array {
  const n = Math.max(0, Math.min(count, bytes.length - fileOffset))
  const out = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    out[i] = bytes[fileOffset + i] ^ ncmKeystreamByte(keyBox, i)
  }
  return out
}

/**
 * 校验解出的头部是否真是音频。
 * strict=true（扫描兜底用）额外验一项结构字段，挡住随机字节凑出的假 magic：
 *   FLAC → 紧跟的 STREAMINFO block（type=0、size=34）
 *   MP3  → ID3 的 syncsafe tagSize 四字节各 < 0x80
 * 扫描阶段只认 fLaC / ID3（裸 MPEG sync 太弱、易误判；NCM 的 MP3 必带 ID3）。
 */
function isValidAudioHead(head: Uint8Array, strict: boolean): boolean {
  const fmt = sniffAudioFormat(head)
  if (!fmt) return false
  if (!strict) return true
  if (fmt === 'flac') {
    if (head.length < 8) return false
    const type = head[4] & 0x7f
    const size = (head[5] << 16) | (head[6] << 8) | head[7]
    return type === 0 && size === 34
  }
  if (head[0] === 0x49) {
    // ID3：syncsafe tagSize 各字节高位必为 0
    return (
      head.length >= 10 &&
      head[6] < 0x80 && head[7] < 0x80 && head[8] < 0x80 && head[9] < 0x80
    )
  }
  return false // strict 模式不接受裸 MPEG sync / OggS
}

/**
 * 定位音频真实起点：先试规范主偏移；解出的不是合法音频则在
 * [imageRegionStart, +窗口] 内逐偏移「解 4 字节探 magic、命中再验结构」扫描找回。
 * 全找不到 → 抛 OUTPUT_NOT_AUDIO（绝不把乱码当成功放出）。
 * 成立依据：RC4 keystream 只依赖「距起点下标」，试对起点首字节即解出真 magic。
 */
function resolveAudioStart(
  bytes: Uint8Array,
  keyBox: Uint8Array,
  primaryStart: number,
  imageRegionStart: number,
): { start: number; recovered: boolean } {
  if (
    primaryStart + 4 <= bytes.length &&
    isValidAudioHead(decryptHeadAt(bytes, keyBox, primaryStart, 16), false)
  ) {
    return { start: primaryStart, recovered: false }
  }
  // 自愈扫描：只在主偏移失败时走，常态零开销
  const ks0 = ncmKeystreamByte(keyBox, 0)
  const end = Math.min(imageRegionStart + NCM_SCAN_WINDOW, bytes.length - 4)
  for (let s = imageRegionStart; s <= end; s++) {
    // 廉价预筛：只有 'f'(fLaC) / 'I'(ID3) 才值得整段验，跳过 99% 候选
    const first = bytes[s] ^ ks0
    if (first !== 0x66 && first !== 0x49) continue
    if (isValidAudioHead(decryptHeadAt(bytes, keyBox, s, 16), true)) {
      return { start: s, recovered: true }
    }
  }
  throw new DecryptError(
    'OUTPUT_NOT_AUDIO',
    '解密结果不是有效音频，文件可能已损坏或为暂不支持的加密变体',
  )
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
