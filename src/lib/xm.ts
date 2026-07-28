/**
 * 喜马拉雅 XM v2 解密。
 *
 * 外层 ID3 保存版本、音轨 ID、加密头长度、IV 与原始音频头的 base64 前缀。
 * 音频头经过两层 AES-CBC；解开并拼回文件未加密尾部后，再按真实 magic 判断格式。
 */

import aesjs from 'aes-js'
import { readMetaFromBlob } from './metadata'
import { sniffAudioFormat } from './sniff'
import { stripFileExtensions } from './filename'
import {
  DecryptError,
  type AudioFormat,
  type AudioMeta,
  type DecryptResult,
  type ProgressCallback,
} from './types'
import { readXmHeader } from './xm-id3'

const XM_V2_KEY = new TextEncoder().encode(
  'ximalayaximalayaximalayaximalaya',
)
const XM_INNER_KEY_SEED = '123456781234567812345678'
const OUTPUT_HEAD_BYTES = 64

export async function decryptXm(
  file: File,
  onProgress?: ProgressCallback,
): Promise<DecryptResult> {
  if (file.size < 64) {
    throw new DecryptError(
      'FILE_TOO_SMALL',
      '文件太小，可能未下载完整或已损坏',
    )
  }

  let header
  try {
    header = await readXmHeader(file)
  } catch (error) {
    throw new DecryptError(
      'XM_PARSE_FAILED',
      '无法解析这个喜马拉雅音频，文件可能未下载完整或已损坏',
      error,
    )
  }
  onProgress?.(0.1)

  if (header.version !== '2') {
    throw new DecryptError(
      'XM_VERSION_UNSUPPORTED',
      '此喜马拉雅音频版本暂不支持',
    )
  }

  try {
    const encrypted = new Uint8Array(
      await file
        .slice(header.tagEnd, header.tagEnd + header.encryptedSize)
        .arrayBuffer(),
    )
    const firstIv = aesjs.utils.hex.toBytes(header.ivHex)
    const firstPlain = decryptCbcPkcs7(encrypted, XM_V2_KEY, firstIv)
    const secondEncrypted = decodeBase64(
      new TextDecoder('ascii').decode(firstPlain),
    )
    onProgress?.(0.4)

    const innerKeyText =
      XM_INNER_KEY_SEED.slice(0, 24 - header.trackId.length) +
      header.trackId
    const innerKey = new TextEncoder().encode(innerKeyText)
    const secondPlain = decryptCbcPkcs7(
      secondEncrypted,
      innerKey,
      innerKey.subarray(0, 16),
    )
    const restoredHead = decodeBase64(
      header.headerBase64Prefix +
        new TextDecoder('ascii').decode(secondPlain),
    )
    if (restoredHead.length === 0) throw new Error('还原后的音频头为空')
    onProgress?.(0.7)

    const tailOffset = header.tagEnd + header.encryptedSize
    const rawAudio = new Blob([
      restoredHead as BlobPart,
      file.slice(tailOffset),
    ])
    const headBytes = new Uint8Array(
      await rawAudio.slice(0, OUTPUT_HEAD_BYTES).arrayBuffer(),
    )
    const format = sniffAudioFormat(headBytes)
    if (!format) {
      throw new DecryptError(
        'OUTPUT_NOT_AUDIO',
        '解密产物不是可识别的音频，文件可能已损坏或使用了未知版本',
      )
    }

    const audio = new Blob([rawAudio], { type: mimeFor(format) })
    const embedded = await readEmbeddedMeta(audio, format)
    const baseName = stripFileExtensions(file.name)
    const meta: AudioMeta = {
      musicName: header.title || embedded.title || baseName,
      artist: header.artist
        ? [[header.artist, 0]]
        : embedded.artist
          ? [[embedded.artist, 0]]
          : undefined,
      album: header.album || embedded.album,
      duration: header.duration,
      albumPic: header.coverUrl,
      format,
      source: 'xm',
    }
    const suggestedName = sanitizeFilename(`${baseName}.${format}`)
    onProgress?.(1)

    return {
      audio,
      format,
      meta,
      cover: embedded.cover,
      suggestedName,
    }
  } catch (error) {
    if (error instanceof DecryptError) throw error
    throw new DecryptError(
      'XM_DECRYPT_FAILED',
      '喜马拉雅音频解密失败，文件可能已损坏或加密方式不同',
      error,
    )
  }
}

function decryptCbcPkcs7(
  encrypted: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Uint8Array {
  if (encrypted.length === 0 || encrypted.length % 16 !== 0) {
    throw new Error('AES 密文长度异常')
  }
  const cipher = new aesjs.ModeOfOperation.cbc(key, iv)
  return aesjs.padding.pkcs7.strip(cipher.decrypt(encrypted))
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, '')
  if (
    normalized.length === 0 ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)
  ) {
    throw new Error('base64 数据异常')
  }
  const binary = atob(normalized)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

async function readEmbeddedMeta(audio: Blob, format: AudioFormat) {
  if (format === 'm4a') return { cover: null as Blob | null }
  return readMetaFromBlob(audio, format)
}

function mimeFor(format: AudioFormat): string {
  if (format === 'mp3') return 'audio/mpeg'
  if (format === 'flac') return 'audio/flac'
  if (format === 'ogg') return 'audio/ogg'
  return 'audio/mp4'
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}
