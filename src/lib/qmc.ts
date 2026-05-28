/**
 * QQ 音乐 QMCv2 解密入口
 *
 * 仅支持 PC 旧版（v19.51 及以下，Windows）下载的本地文件——key 嵌在文件尾部。
 * 新版（v20+）改为云端 ekey + 文件尾 'STag' 标记，纯前端无法解密：检测到 STag
 * 抛 QMC_NEW_VERSION_UNSUPPORTED，让 App.tsx 唤起引导面板。
 *
 * 算法移植自 unlock-music（MIT，ipid/unlock-music master 分支）。
 *
 * Footer 解析（参考 unlock-music qmc.ts searchKey）：
 *   末尾 4 字节：
 *     - 'STag' → 新版云端 ekey，无法解密
 *     - 'QTag' → 旧版 PC 带 song_id 的格式：[size-keyEnd...size-8]=keySize(BE) + rawKey + "," + song_id
 *     - 其他 → 末尾 4 字节当作 keySize(LE)：< 0x400 取 raw key 走 map/rc4；≥ 0x400 用 static cipher
 *
 * Cipher 选择：deriveQmcKey 后 length > 300 → RC4，否则 → Map
 */

import {
  DecryptError,
  type AudioMeta,
  type AudioFormat,
  type DecryptResult,
  type ProgressCallback,
} from './types'
import { stripFileExtensions } from './filename'
import {
  type QmcStreamCipher,
  QmcStaticCipher,
  QmcMapCipher,
  QmcRC4Cipher,
} from './qmc/cipher'
import { deriveQmcKey } from './qmc/key'
import { readMetaFromBlob } from './metadata'

const BYTE_COMMA = 0x2c // ','

interface FooterParsed {
  audioSize: number
  cipher: QmcStreamCipher
  songId?: number
}

export async function decryptQmc(
  file: File,
  onProgress?: ProgressCallback,
): Promise<DecryptResult> {
  // ========== 0. 基础校验 ==========
  if (file.size < 16) {
    throw new DecryptError(
      'FILE_TOO_SMALL',
      '文件太小，可能未下载完整或已损坏',
    )
  }

  // sniff 已按 QMC_EXT_REGEX 过滤过文件名；输出格式完全由解密产物的 magic 判定（见步骤 4），
  // 不再依赖 handler-map（移除 v0.6.0 早期的「sniff 失败时 fallback handler.ext」不安全分支）

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch (e) {
    throw new DecryptError('UNKNOWN', '读取文件失败', e)
  }
  const bytes = new Uint8Array(buffer)

  onProgress?.(0.05)

  // ========== 1. 解析 footer，取出 cipher ==========
  let footer: FooterParsed
  try {
    footer = parseFooter(bytes)
  } catch (e) {
    if (e instanceof DecryptError) throw e
    // 把内部错误暴露到 console + errorMessage，方便排查（base64 / TEA padding 等具体故障点）
    // eslint-disable-next-line no-console
    console.error('[QMC] parseFooter failed:', e, '| file:', file.name, 'size:', bytes.length, 'last16:', Array.from(bytes.subarray(-16)).map(b => b.toString(16).padStart(2, '0')).join(' '))
    const inner = e instanceof Error ? e.message : String(e)
    throw new DecryptError(
      'DECRYPT_FAILED',
      `密钥解析失败：${inner}`,
      e,
    )
  }
  onProgress?.(0.1)

  // ========== 2. 拷贝加密音频区（避免破坏原 buffer） ==========
  const audio = new Uint8Array(footer.audioSize)
  audio.set(bytes.subarray(0, footer.audioSize))

  // ========== 3. 分块解密，让出主线程汇报进度 ==========
  const CHUNK = 256 * 1024
  for (let start = 0; start < footer.audioSize; start += CHUNK) {
    const end = Math.min(start + CHUNK, footer.audioSize)
    footer.cipher.decrypt(audio.subarray(start, end), start)
    onProgress?.(0.1 + (end / footer.audioSize) * 0.85)
    if (end < footer.audioSize) await yieldToEventLoop()
  }

  // ========== 4. 识别解密后真实音频格式 ==========
  // 必须靠 magic 验证解密产物真的是合法音频；不能盲信 handler.ext，否则解密失败时会把垃圾字节
  // 当 FLAC 输出（v0.6.0 早期 bug：陈粒-小半.mflac 走 fallback 标为 FLAC，下载下来无效）
  const sniffed = sniffAudioFormat(audio)
  if (!sniffed) {
    // eslint-disable-next-line no-console
    console.error('[QMC] decrypt produced non-audio output | file:', file.name, 'head16:', Array.from(audio.subarray(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '))
    throw new DecryptError(
      'DECRYPT_FAILED',
      '解密失败，文件可能来自新版 QQ 音乐客户端，或是其他平台改后缀的伪装文件',
    )
  }
  const format: AudioFormat = sniffed

  // ========== 5. 输出 ==========
  const mimeType =
    format === 'mp3' ? 'audio/mpeg' : format === 'flac' ? 'audio/flac' : 'audio/ogg'
  const audioBlob = new Blob([audio], { type: mimeType })

  // QMC 文件名通常是「歌手 - 歌名.mflac」格式
  const baseName = stripFileExtensions(file.name)

  // 从解密产物里读原始 ID3v2 / Vorbis Comment（QMC 原文件结构完整保留）
  // 仅暴露给 UI 用，不重写文件本身
  const parsed = await readMetaFromBlob(audioBlob, format)

  const sepIdx = baseName.indexOf(' - ')
  const fileNameTitle = sepIdx > 0 ? baseName.slice(sepIdx + 3).trim() : baseName
  const fileNameArtist = sepIdx > 0 ? baseName.slice(0, sepIdx).trim() : ''
  const meta: AudioMeta = {
    musicName: parsed.title || fileNameTitle,
    artist: parsed.artist
      ? [[parsed.artist, 0]]
      : fileNameArtist
        ? [[fileNameArtist, 0]]
        : undefined,
    album: parsed.album,
    source: 'qmc',
  }
  const suggestedName = sanitizeFilename(`${baseName}.${format}`)

  onProgress?.(1)
  return {
    audio: audioBlob,
    format,
    meta,
    cover: parsed.cover,
    suggestedName,
  }
}

// ============== Footer 解析 ==============

function parseFooter(bytes: Uint8Array): FooterParsed {
  const size = bytes.length

  // 新版 QQ 音乐文件末尾追加「musicex」tail（8 字节 magic = "musicex\0"，前置 size+version 4+4B）。
  // 这类文件密钥已迁移到云端 ekey 接口，本地无法解密——精准错误引导用户用 v19.51 重下。
  // 实测 footer 结构（陈粒-小半.mflac）：[...audio body... ][192B metadata padding][c0 00 00 00][01 00 00 00]["musicex\0"]
  if (size >= 8) {
    const last8 = bytes.subarray(size - 8, size)
    if (
      last8[0] === 0x6d && last8[1] === 0x75 && last8[2] === 0x73 && last8[3] === 0x69 &&
      last8[4] === 0x63 && last8[5] === 0x65 && last8[6] === 0x78 && last8[7] === 0x00
    ) {
      throw new DecryptError(
        'QMC_NEW_VERSION_UNSUPPORTED',
        '这是 QQ 音乐新版生成的文件（密钥在云端），本工具无法解密。请按引导用 v19.51 旧版（Windows）重新下载这首歌',
      )
    }
  }

  const last4 = bytes.subarray(size - 4, size)
  const last4Text = bytesToString(last4)

  if (last4Text === 'STag') {
    throw new DecryptError(
      'QMC_NEW_VERSION_UNSUPPORTED',
      '这是 QQ 音乐新版生成的文件，密钥不在文件本身。请下载 v19.51 旧版（Windows）重新下载这首歌',
    )
  }

  if (last4Text === 'QTag') {
    // QTag 格式：末尾 8-4 字节 = keySize(big-endian)，再往前是 raw key + "," + song_id
    const view = new DataView(bytes.buffer, bytes.byteOffset + size - 8, 4)
    const keySize = view.getUint32(0, false)
    const audioSize = size - keySize - 8
    if (audioSize <= 0 || keySize <= 0) {
      throw new DecryptError('DECRYPT_FAILED', 'QTag 段长度异常')
    }
    const rawKeyArea = bytes.subarray(audioSize, size - 8)
    const keyEnd = indexOfByte(rawKeyArea, BYTE_COMMA)
    if (keyEnd < 0) {
      throw new DecryptError('DECRYPT_FAILED', 'QTag 段缺少分隔符')
    }
    const rawKey = rawKeyArea.subarray(0, keyEnd)
    const cipher = buildCipherFromRawKey(rawKey)

    // 解析 song_id（容错：解析失败不影响主流程）
    let songId: number | undefined
    const idArea = rawKeyArea.subarray(keyEnd + 1)
    const idEnd = indexOfByte(idArea, BYTE_COMMA)
    if (idEnd > 0) {
      const idStr = bytesToString(idArea.subarray(0, idEnd))
      const n = parseInt(idStr, 10)
      if (!Number.isNaN(n)) songId = n
    }
    return { audioSize, cipher, songId }
  }

  // 末尾 4 字节是 little-endian keySize
  const view = new DataView(bytes.buffer, bytes.byteOffset + size - 4, 4)
  const keySize = view.getUint32(0, true)
  if (keySize < 0x400) {
    const audioSize = size - keySize - 4
    if (audioSize <= 0 || keySize <= 0) {
      throw new DecryptError('DECRYPT_FAILED', '密钥段长度异常')
    }
    const rawKey = bytes.subarray(audioSize, size - 4)
    const cipher = buildCipherFromRawKey(rawKey)
    return { audioSize, cipher }
  }

  // keySize ≥ 0x400 → 没有 key footer，用 static cipher（旧 PC 版 qmc0/qmc3/bkcXXX）
  return {
    audioSize: size,
    cipher: new QmcStaticCipher(),
  }
}

function buildCipherFromRawKey(rawKey: Uint8Array): QmcStreamCipher {
  const keyDec = deriveQmcKey(rawKey)
  if (keyDec.length > 300) {
    return new QmcRC4Cipher(keyDec)
  }
  return new QmcMapCipher(keyDec)
}

// ============== 工具 ==============

function bytesToString(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return s
}

function indexOfByte(buf: Uint8Array, b: number): number {
  for (let i = 0; i < buf.length; i++) if (buf[i] === b) return i
  return -1
}

function sniffAudioFormat(bytes: Uint8Array): AudioFormat | null {
  if (bytes.length < 4) return null
  // FLAC: "fLaC"
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return 'flac'
  }
  // OGG: "OggS"
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'ogg'
  }
  // MP3: ID3 tag
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'mp3'
  }
  // MP3: MPEG sync (0xFF Ex/Fx)
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'mp3'
  }
  return null
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
