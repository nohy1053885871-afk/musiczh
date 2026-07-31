/**
 * M4A / MP4 描述性元数据读取。
 *
 * 仅原始 M4A 上传时调用；Mediabunny 与转码解码器共用同一动态 chunk，
 * 不进入首页初始包。读取失败由 metadata/index.ts 统一降级为空元数据。
 */

import { sniffImageMime } from '../sniff'
import type { AudioMeta } from '../types'
import { MAX_COVER_BYTES, isCoverSizeAllowed } from '../cover-policy'
import type { ParsedAudioMeta } from './index'

export async function readM4aMeta(blob: Blob): Promise<ParsedAudioMeta> {
  const { ALL_FORMATS, BlobSource, Input } = await import('mediabunny')
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  })

  try {
    const tags = await input.getMetadataTags()
    const image =
      tags.images?.find((item) => item.kind === 'coverFront') ??
      tags.images?.[0]
    let cover: Blob | null = null
    if (
      image &&
      isCoverSizeAllowed(image.data.length)
    ) {
      const mime = sniffImageMime(image.data.subarray(0, 12))
      if (mime) {
        cover = new Blob([image.data as BlobPart], { type: mime })
      }
    }
    return {
      cover,
      title: tags.title,
      artist: tags.artist,
      album: tags.album,
    }
  } finally {
    input.dispose()
  }
}

/**
 * 给 M4A 写入标题与 covr 封面。
 *
 * Conversion 在输入/输出均为 MP4 且 codec 不变时复制 AAC encoded packets，
 * 不解码、不重新编码。部分 XM 的首包时间戳略小于 0；显式从该时间戳开始，
 * 避免 Conversion 为修剪负时间戳而误入有损转码路径。
 */
export async function writeM4aMeta(
  m4a: Blob,
  cover: Blob,
  meta: AudioMeta,
): Promise<Blob> {
  if (!isCoverSizeAllowed(cover.size)) {
    throw new Error(`M4A 封面超过 ${MAX_COVER_BYTES} 字节上限`)
  }
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    Output,
  } = await import('mediabunny')
  const coverBytes = new Uint8Array(await cover.arrayBuffer())
  const coverMime = sniffImageMime(coverBytes.subarray(0, 12))
  if (!coverMime) throw new Error('M4A 封面不是受支持的图片格式')

  const input = new Input({
    source: new BlobSource(m4a),
    formats: ALL_FORMATS,
  })
  try {
    const audioTrack = await input.getPrimaryAudioTrack()
    if (!audioTrack) throw new Error('M4A 中没有音频轨')
    const firstTimestamp = await audioTrack.getFirstTimestamp()
    const target = new BufferTarget()
    const output = new Output({
      format: new Mp4OutputFormat({
        fastStart: false,
        metadataFormat: 'mdir',
      }),
      target,
    })
    const artist = meta.artist?.map((item) => item[0]).join(', ')
    const conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      trim: { start: firstTimestamp },
      audio: { forceTranscode: false },
      tags: (inputTags) => ({
        ...inputTags,
        title: meta.musicName || inputTags.title,
        artist: artist || inputTags.artist,
        album: meta.album || inputTags.album,
        images: [
          {
            data: coverBytes,
            mimeType: coverMime,
            kind: 'coverFront',
          },
        ],
      }),
      showWarnings: false,
    })
    if (!conversion.isValid) {
      throw new Error('M4A 无损封面重封装不可用')
    }
    await conversion.execute()
    if (!target.buffer) throw new Error('M4A 封面重封装没有输出')
    return new Blob([target.buffer], { type: 'audio/mp4' })
  } finally {
    input.dispose()
  }
}
