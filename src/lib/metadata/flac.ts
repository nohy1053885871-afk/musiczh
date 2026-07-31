/**
 * FLAC metadata blocks 读 + 写
 *
 * 文件结构：
 *   "fLaC" (4 bytes)
 *   metadata blocks:
 *     1 byte: bit7 = last-block flag, bits6-0 = block type
 *     3 bytes BE: block size
 *     N bytes: block payload
 *     ...直到 last-block flag = 1
 *   audio frames (剩余)
 *
 * 我们关心 type=4 (VORBIS_COMMENT) 与 type=6 (PICTURE)。
 *
 * VORBIS_COMMENT 内部（little-endian）：
 *   vendor_length (4 LE) + vendor_string (UTF-8)
 *   comment_list_length (4 LE)
 *   N × (comment_length (4 LE) + comment_string (UTF-8, "KEY=value"))
 *
 * PICTURE 内部（big-endian）：
 *   picture_type (4 BE) + mime_length (4 BE) + mime
 *   desc_length (4 BE) + desc
 *   width (4 BE) + height (4 BE) + depth (4 BE) + colors (4 BE)
 *   data_length (4 BE) + data
 */

import { isCoverSizeAllowed } from '../cover-policy'
import { sniffImageMime } from '../sniff'
import type { ParsedAudioMeta } from './index'

const FLAC_MAGIC = [0x66, 0x4c, 0x61, 0x43] // "fLaC"
const BLOCK_VORBIS_COMMENT = 4
const BLOCK_PICTURE = 6

interface FlacBlock {
  isLast: boolean
  type: number
  payload: Uint8Array
}

/**
 * 读 FLAC 头部前 N 字节的 metadata blocks。
 * 失败抛错；调用方自己 catch 走静默回退。
 */
export function readFlacMeta(headBytes: Uint8Array): ParsedAudioMeta {
  const blocks = scanFlacBlocks(headBytes)
  return extractMetaFromBlocks(blocks)
}

/**
 * 按 metadata block 头逐块读取完整 FLAC，不再依赖固定头部窗口。
 * 只把 VORBIS_COMMENT / PICTURE payload 读入内存，其他 block 直接跳过。
 */
export async function readFlacMetaFromBlob(blob: Blob): Promise<ParsedAudioMeta> {
  const magic = await readBlobSlice(blob, 0, 4)
  if (!matchesMagic(magic)) throw new Error('not a FLAC stream')

  const blocks: FlacBlock[] = []
  let off = 4
  while (off + 4 <= blob.size) {
    const header = await readBlobSlice(blob, off, off + 4)
    if (header.length < 4) break
    const isLast = (header[0] & 0x80) !== 0
    const type = header[0] & 0x7f
    const size = (header[1] << 16) | (header[2] << 8) | header[3]
    const payloadStart = off + 4
    const payloadEnd = payloadStart + size
    if (payloadEnd > blob.size) break

    if (type === BLOCK_VORBIS_COMMENT || type === BLOCK_PICTURE) {
      const payload = await readBlobSlice(blob, payloadStart, payloadEnd)
      blocks.push({ isLast, type, payload })
    }
    off = payloadEnd
    if (isLast) break
  }
  return extractMetaFromBlocks(blocks)
}

/**
 * 把 cover + meta 写入 FLAC：剔除原 VORBIS_COMMENT/PICTURE 后注入新的。
 * 入参必须是完整 FLAC 字节流。
 */
export function writeFlacMeta(
  flacBytes: Uint8Array,
  cover: Blob | null,
  title: string | undefined,
  artist: string | undefined,
  album: string | undefined,
  coverBytes: Uint8Array | null,
  coverMime: string,
): Uint8Array {
  // 1. 扫描原 blocks，同时记录扫描结束的字节偏移（= audio frames 起点）
  const { blocks, audioOffset } = scanFlacBlocksWithOffset(flacBytes)

  // 2. 过滤掉旧的 VORBIS_COMMENT 与 PICTURE
  const kept = blocks.filter(
    (b) => b.type !== BLOCK_VORBIS_COMMENT && b.type !== BLOCK_PICTURE,
  )

  // 3. 构造新 blocks
  const newBlocks: FlacBlock[] = [...kept]
  const vc = buildVorbisCommentBlock(title, artist, album)
  if (vc) newBlocks.push({ isLast: false, type: BLOCK_VORBIS_COMMENT, payload: vc })
  if (cover && coverBytes && coverBytes.length > 0) {
    const pic = buildPictureBlock(coverBytes, coverMime)
    if (pic.length > 0xffffff) throw new Error('FLAC PICTURE block is too large')
    newBlocks.push({ isLast: false, type: BLOCK_PICTURE, payload: pic })
  }

  if (newBlocks.length === 0) {
    // 没东西写，原样返回（理论上 STREAMINFO 必在，到不了这里）
    return flacBytes
  }

  // 修正 last-flag：前面全 0，最后一个置 1
  newBlocks.forEach((b, i) => {
    b.isLast = i === newBlocks.length - 1
  })

  // 4. 计算总大小
  const audioFrames = flacBytes.subarray(audioOffset)
  let totalBlocksSize = 0
  for (const b of newBlocks) totalBlocksSize += 4 + b.payload.length
  const total = 4 + totalBlocksSize + audioFrames.length

  // 5. 装配
  const out = new Uint8Array(total)
  out.set(FLAC_MAGIC, 0)
  let off = 4
  for (const b of newBlocks) {
    out[off] = (b.isLast ? 0x80 : 0x00) | (b.type & 0x7f)
    writeUint24BE(out, off + 1, b.payload.length)
    out.set(b.payload, off + 4)
    off += 4 + b.payload.length
  }
  out.set(audioFrames, off)
  return out
}

// ============== 内部实现 ==============

function scanFlacBlocks(bytes: Uint8Array): FlacBlock[] {
  return scanFlacBlocksWithOffset(bytes).blocks
}

function scanFlacBlocksWithOffset(bytes: Uint8Array): {
  blocks: FlacBlock[]
  audioOffset: number
} {
  if (
    bytes.length < 4 ||
    bytes[0] !== FLAC_MAGIC[0] ||
    bytes[1] !== FLAC_MAGIC[1] ||
    bytes[2] !== FLAC_MAGIC[2] ||
    bytes[3] !== FLAC_MAGIC[3]
  ) {
    throw new Error('not a FLAC stream')
  }
  const blocks: FlacBlock[] = []
  let off = 4
  while (off + 4 <= bytes.length) {
    const headerByte = bytes[off]
    const isLast = (headerByte & 0x80) !== 0
    const type = headerByte & 0x7f
    const size = (bytes[off + 1] << 16) | (bytes[off + 2] << 8) | bytes[off + 3]
    const payloadStart = off + 4
    const payloadEnd = payloadStart + size
    if (payloadEnd > bytes.length) {
      // 截断窗口（读路径）—— 不再继续，已扫到的够用
      break
    }
    blocks.push({
      isLast,
      type,
      payload: bytes.subarray(payloadStart, payloadEnd),
    })
    off = payloadEnd
    if (isLast) break
  }
  return { blocks, audioOffset: off }
}

function extractMetaFromBlocks(blocks: FlacBlock[]): ParsedAudioMeta {
  const result: ParsedAudioMeta = { cover: null }
  for (const b of blocks) {
    if (b.type === BLOCK_VORBIS_COMMENT) {
      const parsed = parseVorbisCommentPayload(b.payload)
      if (parsed.title) result.title = parsed.title
      if (parsed.artist) result.artist = parsed.artist
      if (parsed.album) result.album = parsed.album
    } else if (b.type === BLOCK_PICTURE) {
      const pic = parsePicturePayload(b.payload)
      if (pic && isCoverSizeAllowed(pic.data.length)) {
        const mime = sniffImageMime(pic.data.subarray(0, 12))
        if (mime) result.cover = new Blob([pic.data as BlobPart], { type: mime })
      }
    }
  }
  return result
}

/**
 * 解析 VORBIS_COMMENT 二进制（同样也用于 OGG Vorbis comment header 的字段段）。
 * 入参就是 vendor_length 起始的字节数组（不含 OGG packet 的 \x03vorbis magic）。
 */
export function parseVorbisCommentPayload(payload: Uint8Array): {
  title?: string
  artist?: string
  album?: string
  pictureBase64?: string
} {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let off = 0
  if (off + 4 > payload.length) return {}
  const vendorLen = view.getUint32(off, true)
  off += 4
  off += vendorLen // skip vendor
  if (off + 4 > payload.length) return {}
  const listLen = view.getUint32(off, true)
  off += 4
  const out: { title?: string; artist?: string; album?: string; pictureBase64?: string } = {}
  for (let i = 0; i < listLen; i++) {
    if (off + 4 > payload.length) break
    const len = view.getUint32(off, true)
    off += 4
    if (off + len > payload.length) break
    const text = decoder.decode(payload.subarray(off, off + len))
    off += len
    const eq = text.indexOf('=')
    if (eq < 0) continue
    const key = text.slice(0, eq).toUpperCase()
    const value = text.slice(eq + 1)
    if (key === 'TITLE' && !out.title) out.title = value
    else if (key === 'ARTIST' && !out.artist) out.artist = value
    else if (key === 'ALBUM' && !out.album) out.album = value
    else if (key === 'METADATA_BLOCK_PICTURE' && !out.pictureBase64) {
      out.pictureBase64 = value
    }
  }
  return out
}

/**
 * 解析 PICTURE block 的 payload。复用给 OGG 的 base64 decode 后内容。
 */
export function parsePicturePayload(
  payload: Uint8Array,
): { mime: string; data: Uint8Array } | null {
  if (payload.length < 32) return null
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  let off = 0
  off += 4 // picture_type
  const mimeLen = view.getUint32(off, false)
  off += 4
  if (off + mimeLen > payload.length) return null
  const mime = bytesToAscii(payload.subarray(off, off + mimeLen))
  off += mimeLen
  const descLen = view.getUint32(off, false)
  off += 4
  if (off + descLen > payload.length) return null
  off += descLen // skip description
  if (off + 20 > payload.length) return null
  off += 16 // width/height/depth/colors
  if (off + 4 > payload.length) return null
  const dataLen = view.getUint32(off, false)
  off += 4
  if (off + dataLen > payload.length) return null
  return { mime, data: payload.subarray(off, off + dataLen) }
}

async function readBlobSlice(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer())
}

function matchesMagic(bytes: Uint8Array): boolean {
  return FLAC_MAGIC.every((value, index) => bytes[index] === value)
}

function buildVorbisCommentBlock(
  title: string | undefined,
  artist: string | undefined,
  album: string | undefined,
): Uint8Array | null {
  const vendor = encodeUtf8('musiczh')
  const comments: Uint8Array[] = []
  if (title) comments.push(encodeUtf8(`TITLE=${title}`))
  if (artist) comments.push(encodeUtf8(`ARTIST=${artist}`))
  if (album) comments.push(encodeUtf8(`ALBUM=${album}`))
  if (comments.length === 0) return null
  let size = 4 + vendor.length + 4
  for (const c of comments) size += 4 + c.length
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let off = 0
  view.setUint32(off, vendor.length, true)
  off += 4
  out.set(vendor, off)
  off += vendor.length
  view.setUint32(off, comments.length, true)
  off += 4
  for (const c of comments) {
    view.setUint32(off, c.length, true)
    off += 4
    out.set(c, off)
    off += c.length
  }
  return out
}

function buildPictureBlock(coverData: Uint8Array, mime: string): Uint8Array {
  const mimeBytes = encodeUtf8(mime)
  // picture_type(4) + mime_len(4) + mime + desc_len(4) + desc(0) + w(4)+h(4)+depth(4)+colors(4) + data_len(4) + data
  const size = 4 + 4 + mimeBytes.length + 4 + 0 + 16 + 4 + coverData.length
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let off = 0
  view.setUint32(off, 3, false) // picture type = 3 (Cover front)
  off += 4
  view.setUint32(off, mimeBytes.length, false)
  off += 4
  out.set(mimeBytes, off)
  off += mimeBytes.length
  view.setUint32(off, 0, false) // desc length
  off += 4
  // width/height/depth/colors 全填 0（FLAC 规范允许 informational 字段为 0）
  off += 16
  view.setUint32(off, coverData.length, false)
  off += 4
  out.set(coverData, off)
  return out
}

function writeUint24BE(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >> 16) & 0xff
  out[offset + 1] = (value >> 8) & 0xff
  out[offset + 2] = value & 0xff
}

function encodeUtf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

function bytesToAscii(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}
