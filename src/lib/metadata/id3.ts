/**
 * ID3v2 读 + 写
 *
 * 读：仅 ID3v2.3/v2.4，关心 TIT2 / TPE1 / TALB / APIC。容错失败静默。
 * 写：复用 browser-id3-writer（已在依赖里）。
 */

import { ID3Writer } from 'browser-id3-writer'
import type { AudioMeta } from '../types'
import type { ParsedAudioMeta } from './index'

/**
 * 解析 ID3v2 头部，返回所需字段。
 * @param headBytes MP3 文件头部 N 字节切片
 */
export function readId3v2(headBytes: Uint8Array): ParsedAudioMeta {
  const result: ParsedAudioMeta = { cover: null }
  if (headBytes.length < 10) return result
  // magic "ID3"
  if (headBytes[0] !== 0x49 || headBytes[1] !== 0x44 || headBytes[2] !== 0x33) {
    return result
  }
  const major = headBytes[3]
  if (major !== 3 && major !== 4) return result
  const flags = headBytes[5]
  const hasExtHeader = (flags & 0x40) !== 0
  const tagSize = readSyncsafe(headBytes, 6)
  let off = 10
  const tagEnd = Math.min(10 + tagSize, headBytes.length)

  if (hasExtHeader) {
    if (off + 4 > tagEnd) return result
    const extSize =
      major === 4
        ? readSyncsafe(headBytes, off)
        : ((headBytes[off] << 24) |
            (headBytes[off + 1] << 16) |
            (headBytes[off + 2] << 8) |
            headBytes[off + 3]) >>> 0
    off += 4 + extSize
  }

  while (off + 10 <= tagEnd) {
    const id =
      String.fromCharCode(headBytes[off]) +
      String.fromCharCode(headBytes[off + 1]) +
      String.fromCharCode(headBytes[off + 2]) +
      String.fromCharCode(headBytes[off + 3])
    if (id === '\0\0\0\0') break // padding
    const frameSize =
      major === 4
        ? readSyncsafe(headBytes, off + 4)
        : ((headBytes[off + 4] << 24) |
            (headBytes[off + 5] << 16) |
            (headBytes[off + 6] << 8) |
            headBytes[off + 7]) >>> 0
    const frameStart = off + 10
    const frameEnd = frameStart + frameSize
    if (frameEnd > tagEnd) break
    const payload = headBytes.subarray(frameStart, frameEnd)
    try {
      if (id === 'TIT2') {
        const v = decodeTextFrame(payload)
        if (v && !result.title) result.title = v
      } else if (id === 'TPE1') {
        const v = decodeTextFrame(payload)
        if (v && !result.artist) result.artist = v
      } else if (id === 'TALB') {
        const v = decodeTextFrame(payload)
        if (v && !result.album) result.album = v
      } else if (id === 'APIC') {
        const pic = decodeApicFrame(payload)
        if (pic && !result.cover) {
          result.cover = new Blob([pic.data as BlobPart], { type: pic.mime || 'image/jpeg' })
        }
      }
    } catch {
      // 单 frame 出错忽略
    }
    off = frameEnd
  }
  return result
}

/**
 * 给 MP3 写入 ID3v2 标签。
 *
 * 容错原则：text frames（标题/艺术家/专辑）和 APIC（封面）独立 try/catch。
 * APIC 失败时（例如 cover 数据格式不在 browser-id3-writer 白名单里）仅丢封面，
 * 不影响 text frames 与 ID3v2 header 写入——产物至少不是裸 MPEG。
 *
 * 调用方仍可在最外层 try/catch 兜底（防 ArrayBuffer 损坏等极端情况）。
 */
export async function writeId3ToMp3(
  mp3: Blob,
  cover: Blob | null,
  meta: AudioMeta,
): Promise<Blob> {
  const buf = await mp3.arrayBuffer()
  const writer = new ID3Writer(buf)
  if (meta.musicName) writer.setFrame('TIT2', meta.musicName)
  if (meta.artist?.length) {
    writer.setFrame(
      'TPE1',
      meta.artist.map((a) => a[0]),
    )
  }
  if (meta.album) writer.setFrame('TALB', meta.album)
  if (cover) {
    try {
      const coverBuf = await cover.arrayBuffer()
      writer.setFrame('APIC', {
        type: 3,
        data: coverBuf,
        description: 'Cover',
      })
    } catch (e) {
      // browser-id3-writer 的 APIC 校验严格：仅认 JPEG/PNG/GIF/WebP/TIFF/BMP/ICO
      // 实测网易云 NCM 容器偶尔存其他格式封面，会抛 "Unknown picture MIME type"
      // 这里仅丢封面，text frames + ID3 header 仍写入；并把 cover 前 16 字节打 warn 便于排查
      const head = new Uint8Array(
        (await cover.slice(0, 16).arrayBuffer()) as ArrayBuffer,
      )
      const hex = Array.from(head)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ')
      // eslint-disable-next-line no-console
      console.warn(
        `[writeId3ToMp3] APIC 写入失败: ${(e as Error).message} | cover.type=${cover.type} | cover.size=${cover.size} | head16=${hex}`,
      )
    }
  }
  writer.addTag()
  return writer.getBlob()
}

// ============== 内部 ==============

function readSyncsafe(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  )
}

function decodeTextFrame(payload: Uint8Array): string | undefined {
  if (payload.length < 2) return undefined
  const encoding = payload[0]
  // 去掉末尾的 \0 终结符（多语言可能多个）
  let end = payload.length
  while (end > 1 && payload[end - 1] === 0) end--
  const data = payload.subarray(1, end)
  return decodeWithId3Encoding(data, encoding) || undefined
}

function decodeApicFrame(
  payload: Uint8Array,
): { mime: string; data: Uint8Array } | null {
  if (payload.length < 4) return null
  const encoding = payload[0]
  let off = 1
  // MIME (\0-terminated, latin1)
  const mimeEnd = indexOfByte(payload, 0, off)
  if (mimeEnd < 0) return null
  const mime = bytesToAscii(payload.subarray(off, mimeEnd))
  off = mimeEnd + 1
  if (off >= payload.length) return null
  off += 1 // picture type
  // description (\0-terminated; UTF-16 用双 \0)
  const descEnd = findStringTerminator(payload, off, encoding)
  if (descEnd < 0) return null
  off = descEnd
  if (off >= payload.length) return null
  return { mime, data: payload.subarray(off) }
}

function decodeWithId3Encoding(data: Uint8Array, encoding: number): string {
  // 0=ISO-8859-1, 1=UTF-16 (with BOM), 2=UTF-16BE, 3=UTF-8
  if (encoding === 0) return new TextDecoder('latin1').decode(data)
  if (encoding === 3) return new TextDecoder('utf-8', { fatal: false }).decode(data)
  if (encoding === 2) return new TextDecoder('utf-16be', { fatal: false }).decode(data)
  if (encoding === 1) {
    // UTF-16 with BOM
    if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
      return new TextDecoder('utf-16le', { fatal: false }).decode(data.subarray(2))
    }
    if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
      return new TextDecoder('utf-16be', { fatal: false }).decode(data.subarray(2))
    }
    return new TextDecoder('utf-16le', { fatal: false }).decode(data)
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(data)
}

function findStringTerminator(
  payload: Uint8Array,
  start: number,
  encoding: number,
): number {
  if (encoding === 1 || encoding === 2) {
    // UTF-16 双字节 \0 \0
    for (let i = start; i + 1 < payload.length; i += 2) {
      if (payload[i] === 0 && payload[i + 1] === 0) return i + 2
    }
    return -1
  }
  const idx = indexOfByte(payload, 0, start)
  return idx < 0 ? -1 : idx + 1
}

function indexOfByte(buf: Uint8Array, b: number, start: number): number {
  for (let i = start; i < buf.length; i++) if (buf[i] === b) return i
  return -1
}

function bytesToAscii(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}
