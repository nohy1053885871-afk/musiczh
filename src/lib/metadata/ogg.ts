/**
 * OGG Vorbis comment 读取
 *
 * 真正的 Ogg Vorbis comment 在第 2 个 vorbis header packet 里（packet_type=3）。
 * Blob 路径按 Ogg page 的 lacing values 组装 packet，支持 comment packet 跨 page。
 * 同步入口保留给小型测试/兼容调用。
 */

import {
  MAX_COVER_BYTES,
  MAX_OGG_COMMENT_BYTES,
  isCoverSizeAllowed,
} from '../cover-policy'
import { sniffImageMime } from '../sniff'
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

/** 按 Ogg page 组装完整 Vorbis comment packet，不设固定搜索窗口。 */
export async function readOggVorbisMetaFromBlob(blob: Blob): Promise<ParsedAudioMeta> {
  let off = 0
  let packetChunks: Uint8Array[] = []
  let packetBytes = 0
  let packetTooLarge = false

  while (off + 27 <= blob.size) {
    const header = await readBlobSlice(blob, off, off + 27)
    if (!isOggPageHeader(header)) break
    const segmentCount = header[26]
    const lacing = await readBlobSlice(blob, off + 27, off + 27 + segmentCount)
    if (lacing.length !== segmentCount) break
    const bodyLength = lacing.reduce((sum, value) => sum + value, 0)
    const bodyStart = off + 27 + segmentCount
    const bodyEnd = bodyStart + bodyLength
    if (bodyEnd > blob.size) break
    const body = await readBlobSlice(blob, bodyStart, bodyEnd)

    let bodyOff = 0
    for (const segmentLength of lacing) {
      const segment = body.subarray(bodyOff, bodyOff + segmentLength)
      bodyOff += segmentLength
      packetBytes += segmentLength
      if (packetBytes <= MAX_OGG_COMMENT_BYTES && !packetTooLarge) {
        packetChunks.push(segment)
      } else {
        packetTooLarge = true
        packetChunks = []
      }

      if (segmentLength < 255) {
        if (!packetTooLarge) {
          const packet = concatChunks(packetChunks, packetBytes)
          if (startsWithVorbisComment(packet)) return parseVorbisCommentPacket(packet)
        }
        packetChunks = []
        packetBytes = 0
        packetTooLarge = false
      }
    }
    off = bodyEnd
  }
  return { cover: null }
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
    const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
    const estimatedBytes = Math.floor((b64.length * 3) / 4) - padding
    if (estimatedBytes > MAX_COVER_BYTES + 64 * 1024) return null
    const binary = atob(b64)
    const buf = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
    const pic = parsePicturePayload(buf)
    if (!pic || !isCoverSizeAllowed(pic.data.length)) return null
    const mime = sniffImageMime(pic.data.subarray(0, 12))
    return mime ? new Blob([pic.data as BlobPart], { type: mime }) : null
  } catch {
    return null
  }
}

function parseVorbisCommentPacket(packet: Uint8Array): ParsedAudioMeta {
  const result: ParsedAudioMeta = { cover: null }
  const parsed = parseVorbisCommentPayload(packet.subarray(VORBIS_COMMENT_MAGIC.length))
  if (parsed.title) result.title = parsed.title
  if (parsed.artist) result.artist = parsed.artist
  if (parsed.album) result.album = parsed.album
  if (parsed.pictureBase64) result.cover = decodePictureBase64(parsed.pictureBase64)
  return result
}

function startsWithVorbisComment(packet: Uint8Array): boolean {
  return VORBIS_COMMENT_MAGIC.every((value, index) => packet[index] === value)
}

function isOggPageHeader(header: Uint8Array): boolean {
  return (
    header.length === 27 &&
    header[0] === 0x4f &&
    header[1] === 0x67 &&
    header[2] === 0x67 &&
    header[3] === 0x53
  )
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total)
  let off = 0
  for (const chunk of chunks) {
    out.set(chunk, off)
    off += chunk.length
  }
  return out
}

async function readBlobSlice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer())
}
