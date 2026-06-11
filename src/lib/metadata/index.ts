/**
 * 音频元数据读 / 写统一门面
 *
 * 用法：
 *   const parsed = await readMetaFromBlob(blob, 'flac')
 *   const tagged = await writeId3ToMp3(mp3Blob, parsed.cover, meta)
 *   const tagged = await writeFlacMeta(flacBlob, parsed.cover, meta)
 *
 * 失败语义：reader 内部捕获后返回空结构；writer 抛错，调用方静默回退。
 */

import type { AudioMeta } from '../types'
import { readId3v2, writeId3ToMp3 } from './id3'
import { readFlacMeta, writeFlacMeta as writeFlacMetaCore } from './flac'
import { readOggVorbisMeta } from './ogg'
import { sniffImageMime } from '../sniff'

export type ParsedAudioMeta = {
  cover: Blob | null
  title?: string
  artist?: string
  album?: string
}

// 读窗口大小：足够覆盖大多数 FLAC PICTURE block + ID3v2 头
const ID3_HEAD_INIT = 10
const FLAC_HEAD_WINDOW = 1024 * 1024 // 1MB
const OGG_HEAD_WINDOW = 512 * 1024 // 512KB

export async function readMetaFromBlob(
  blob: Blob,
  format: 'mp3' | 'flac' | 'ogg',
): Promise<ParsedAudioMeta> {
  try {
    if (format === 'mp3') {
      return await readId3FromBlob(blob)
    }
    if (format === 'flac') {
      const head = await readBlobHead(blob, FLAC_HEAD_WINDOW)
      return readFlacMeta(head)
    }
    // ogg
    const head = await readBlobHead(blob, OGG_HEAD_WINDOW)
    return readOggVorbisMeta(head)
  } catch {
    return { cover: null }
  }
}

async function readId3FromBlob(blob: Blob): Promise<ParsedAudioMeta> {
  const headInit = new Uint8Array(
    await blob.slice(0, ID3_HEAD_INIT).arrayBuffer(),
  )
  if (
    headInit.length < ID3_HEAD_INIT ||
    headInit[0] !== 0x49 ||
    headInit[1] !== 0x44 ||
    headInit[2] !== 0x33
  ) {
    return { cover: null }
  }
  const tagSize =
    ((headInit[6] & 0x7f) << 21) |
    ((headInit[7] & 0x7f) << 14) |
    ((headInit[8] & 0x7f) << 7) |
    (headInit[9] & 0x7f)
  const total = ID3_HEAD_INIT + tagSize
  const headFull = new Uint8Array(await blob.slice(0, total).arrayBuffer())
  return readId3v2(headFull)
}

async function readBlobHead(blob: Blob, maxBytes: number): Promise<Uint8Array> {
  const size = Math.min(blob.size, maxBytes)
  return new Uint8Array(await blob.slice(0, size).arrayBuffer())
}

export { writeId3ToMp3 }

/**
 * FLAC writer 门面：把 Blob 读全后调用核心实现。
 */
export async function writeFlacMeta(
  flac: Blob,
  cover: Blob | null,
  meta: AudioMeta,
): Promise<Blob> {
  const buf = new Uint8Array(await flac.arrayBuffer())
  const title = meta.musicName
  const artist = meta.artist?.length ? meta.artist.map((a) => a[0]).join(', ') : undefined
  const album = meta.album
  let coverBytes: Uint8Array | null = null
  let coverMime = 'image/jpeg'
  if (cover) {
    coverBytes = new Uint8Array(await cover.arrayBuffer())
    // 权威 mime 取自封面真实字节（magic），优先于 Blob.type——上游可能传来错误 type，
    // FLAC PICTURE block 声明的 mime 必须与数据一致，否则严格播放器解码失败丢封面。
    coverMime = sniffImageMime(coverBytes) || cover.type || 'image/jpeg'
  }
  const out = writeFlacMetaCore(buf, cover, title, artist, album, coverBytes, coverMime)
  return new Blob([out as BlobPart], { type: 'audio/flac' })
}
