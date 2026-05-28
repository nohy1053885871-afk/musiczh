/**
 * OGG Vorbis comment 读取
 *
 * 真正的 Ogg Vorbis comment 在第 2 个 vorbis header packet 里（packet_type=3）。
 * 我们简化策略：在窗口字节内搜索 \x03 "vorbis" magic（7 字节），命中后按 vorbis-comment
 * 标准布局直接读字段。跨 page 的极端情况静默失败。
 */

import { parsePicturePayload, parseVorbisCommentPayload } from './flac'
import type { ParsedAudioMeta } from './index'

const VORBIS_COMMENT_MAGIC = [0x03, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73] // \x03 + "vorbis"

export function readOggVorbisMeta(headBytes: Uint8Array): ParsedAudioMeta {
  const result: ParsedAudioMeta = { cover: null }
  const idx = findVorbisCommentMagic(headBytes)
  if (idx < 0) return result
  const payload = headBytes.subarray(idx + VORBIS_COMMENT_MAGIC.length)
  const parsed = parseVorbisCommentPayload(payload)
  if (parsed.title) result.title = parsed.title
  if (parsed.artist) result.artist = parsed.artist
  if (parsed.album) result.album = parsed.album
  if (parsed.pictureBase64) {
    const cover = decodePictureBase64(parsed.pictureBase64)
    if (cover) result.cover = cover
  }
  return result
}

function findVorbisCommentMagic(bytes: Uint8Array): number {
  for (let i = 0; i < bytes.length - VORBIS_COMMENT_MAGIC.length; i++) {
    let matched = true
    for (let j = 0; j < VORBIS_COMMENT_MAGIC.length; j++) {
      if (bytes[i + j] !== VORBIS_COMMENT_MAGIC[j]) {
        matched = false
        break
      }
    }
    if (matched) return i
  }
  return -1
}

function decodePictureBase64(b64: string): Blob | null {
  try {
    const binary = atob(b64)
    const buf = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
    const pic = parsePicturePayload(buf)
    if (!pic) return null
    return new Blob([pic.data as BlobPart], { type: pic.mime || 'image/jpeg' })
  } catch {
    return null
  }
}
