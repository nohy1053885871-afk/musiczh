import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_COVER_BYTES } from '../cover-policy'
import { readMetaFromBlob } from './index'

const PNG_MAGIC = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

test('FLAC PICTURE 位于旧 1 MiB 窗口之后仍可读取', async () => {
  const padding = new Uint8Array(1024 * 1024 + 64)
  const cover = imageBytes(4096)
  const flac = new Blob([
    ownedBuffer(Uint8Array.from([0x66, 0x4c, 0x61, 0x43])),
    ownedBuffer(flacBlock(1, padding, false)),
    ownedBuffer(flacBlock(4, vorbisComments(['TITLE=窗口之后']), false)),
    ownedBuffer(flacBlock(6, picturePayload(cover), true)),
    ownedBuffer(Uint8Array.of(0xff, 0xf8, 1, 2, 3, 4)),
  ])
  const parsed = await readMetaFromBlob(flac, 'flac')
  assert.equal(parsed.title, '窗口之后')
  assert.equal(parsed.cover?.size, cover.length)
  assert.equal(parsed.cover?.type, 'image/png')
})

test('OGG comment 跨 page 且超过旧 512 KiB 窗口仍可读取', async () => {
  const cover = imageBytes(600 * 1024)
  const picture = Buffer.from(picturePayload(cover)).toString('base64')
  const comment = concat([
    Uint8Array.from([0x03, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]),
    vorbisComments(['TITLE=跨页封面', `METADATA_BLOCK_PICTURE=${picture}`]),
    Uint8Array.of(1),
  ])
  const identification = Uint8Array.from([
    0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73, 0, 0, 0,
  ])
  const ogg = new Blob(
    makeOggPages([identification, comment]).map(ownedBuffer),
  )
  const parsed = await readMetaFromBlob(ogg, 'ogg')
  assert.equal(parsed.title, '跨页封面')
  assert.equal(parsed.cover?.size, cover.length)
  assert.equal(parsed.cover?.type, 'image/png')
})

test('ID3 APIC 超过 16 MiB 时跳过封面并继续读取后续文字标签', async () => {
  const oversized = imageBytes(MAX_COVER_BYTES + 1)
  const apicPrefix = concat([
    Uint8Array.of(0),
    new TextEncoder().encode('image/png'),
    Uint8Array.of(0, 3, 0),
  ])
  const apicSize = apicPrefix.length + oversized.length
  const title = id3Frame('TIT2', concat([
    Uint8Array.of(3),
    new TextEncoder().encode('封面超限但音频可用'),
  ]))
  const tagSize = 10 + apicSize + title.length
  const blob = new Blob([
    ownedBuffer(concat([
      Uint8Array.from([0x49, 0x44, 0x33, 0x03, 0, 0]),
      syncsafe(tagSize),
      id3FrameHeader('APIC', apicSize),
      apicPrefix,
    ])),
    ownedBuffer(oversized),
    ownedBuffer(title),
    ownedBuffer(Uint8Array.of(0xff, 0xfb, 0x90, 0x64)),
  ])
  const parsed = await readMetaFromBlob(blob, 'mp3')
  assert.equal(parsed.cover, null)
  assert.equal(parsed.title, '封面超限但音频可用')
})

function imageBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(PNG_MAGIC)
  return bytes
}

function flacBlock(type: number, payload: Uint8Array, last: boolean): Uint8Array {
  assert.ok(payload.length <= 0xffffff)
  const header = Uint8Array.of(
    (last ? 0x80 : 0) | type,
    (payload.length >>> 16) & 0xff,
    (payload.length >>> 8) & 0xff,
    payload.length & 0xff,
  )
  return concat([header, payload])
}

function picturePayload(data: Uint8Array): Uint8Array {
  const mime = new TextEncoder().encode('image/png')
  const out = new Uint8Array(4 + 4 + mime.length + 4 + 16 + 4 + data.length)
  const view = new DataView(out.buffer)
  let off = 0
  view.setUint32(off, 3)
  off += 4
  view.setUint32(off, mime.length)
  off += 4
  out.set(mime, off)
  off += mime.length
  view.setUint32(off, 0)
  off += 4 + 16
  view.setUint32(off, data.length)
  off += 4
  out.set(data, off)
  return out
}

function vorbisComments(comments: string[]): Uint8Array {
  const vendor = new TextEncoder().encode('musiczh-test')
  const encoded = comments.map((item) => new TextEncoder().encode(item))
  const size = 4 + vendor.length + 4 + encoded.reduce((sum, item) => sum + 4 + item.length, 0)
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  let off = 0
  view.setUint32(off, vendor.length, true)
  off += 4
  out.set(vendor, off)
  off += vendor.length
  view.setUint32(off, encoded.length, true)
  off += 4
  for (const item of encoded) {
    view.setUint32(off, item.length, true)
    off += 4
    out.set(item, off)
    off += item.length
  }
  return out
}

function makeOggPages(packets: Uint8Array[]): Uint8Array[] {
  const segments: Array<{ length: number; data: Uint8Array }> = []
  for (const packet of packets) {
    let off = 0
    while (packet.length - off >= 255) {
      segments.push({ length: 255, data: packet.subarray(off, off + 255) })
      off += 255
    }
    segments.push({ length: packet.length - off, data: packet.subarray(off) })
  }

  const pages: Uint8Array[] = []
  for (let page = 0, off = 0; off < segments.length; page++) {
    const current = segments.slice(off, off + 255)
    off += current.length
    const header = new Uint8Array(27)
    header.set([0x4f, 0x67, 0x67, 0x53])
    header[5] = page === 0 ? 2 : 0
    header[18] = 1
    header[22] = page & 0xff
    header[26] = current.length
    pages.push(concat([
      header,
      Uint8Array.from(current.map((item) => item.length)),
      ...current.map((item) => item.data),
    ]))
  }
  return pages
}

function id3Frame(id: string, payload: Uint8Array): Uint8Array {
  return concat([id3FrameHeader(id, payload.length), payload])
}

function id3FrameHeader(id: string, size: number): Uint8Array {
  return concat([
    new TextEncoder().encode(id),
    Uint8Array.of(size >>> 24, size >>> 16, size >>> 8, size),
    Uint8Array.of(0, 0),
  ])
}

function syncsafe(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 21) & 0x7f,
    (value >>> 14) & 0x7f,
    (value >>> 7) & 0x7f,
    value & 0x7f,
  )
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let off = 0
  for (const part of parts) {
    out.set(part, off)
    off += part.length
  }
  return out
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}
