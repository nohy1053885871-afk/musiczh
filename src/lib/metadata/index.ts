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

import type { AudioFormat, AudioMeta } from '../types'
import { isCoverSizeAllowed } from '../cover-policy'
import { readId3v2FromBlob, writeId3ToMp3 } from './id3'
import { readFlacMetaFromBlob, writeFlacMeta as writeFlacMetaCore } from './flac'
import { readOggVorbisMetaFromBlob } from './ogg'
import { readM4aMeta, writeM4aMeta } from './m4a'
import { sniffImageMime } from '../sniff'

export type ParsedAudioMeta = {
  cover: Blob | null
  title?: string
  artist?: string
  album?: string
}

export async function readMetaFromBlob(
  blob: Blob,
  format: AudioFormat,
): Promise<ParsedAudioMeta> {
  try {
    if (format === 'mp3') {
      return await readId3v2FromBlob(blob)
    }
    if (format === 'flac') {
      return await readFlacMetaFromBlob(blob)
    }
    if (format === 'ogg') {
      return await readOggVorbisMetaFromBlob(blob)
    }
    if (format === 'm4a') {
      return await readM4aMeta(blob)
    }
    return { cover: null }
  } catch {
    return { cover: null }
  }
}

export { writeId3ToMp3, writeM4aMeta }

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
  if (cover && isCoverSizeAllowed(cover.size)) {
    coverBytes = new Uint8Array(await cover.arrayBuffer())
    // 权威 mime 取自封面真实字节（magic），优先于 Blob.type——上游可能传来错误 type，
    // FLAC PICTURE block 声明的 mime 必须与数据一致，否则严格播放器解码失败丢封面。
    coverMime = sniffImageMime(coverBytes) || cover.type || 'image/jpeg'
  }
  const out = writeFlacMetaCore(buf, cover, title, artist, album, coverBytes, coverMime)
  return new Blob([out as BlobPart], { type: 'audio/flac' })
}
