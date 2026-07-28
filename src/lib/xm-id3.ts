/**
 * 喜马拉雅 XM 外层 ID3v2 标签解析。
 *
 * XM 本体以普通 ID3v2.3 标签开头，所以不能只凭 "ID3" 判成 MP3。
 * sniff 与 decrypt 共用本文件，保证格式识别和实际解密读取同一套字段规则。
 */

const ID3_HEADER_SIZE = 10
const MAX_ID3_TAG_SIZE = 4 * 1024 * 1024

export interface XmHeader {
  tagEnd: number
  version: string
  trackId: string
  encryptedSize: number
  headerBase64Prefix: string
  ivHex: string
  title?: string
  artist?: string
  album?: string
  duration?: number
  coverUrl?: string
}

export async function readXmHeader(file: Blob): Promise<XmHeader> {
  const first = new Uint8Array(
    await file.slice(0, ID3_HEADER_SIZE).arrayBuffer(),
  )
  if (
    first.length < ID3_HEADER_SIZE ||
    first[0] !== 0x49 ||
    first[1] !== 0x44 ||
    first[2] !== 0x33
  ) {
    throw new Error('缺少 ID3v2 文件头')
  }

  const major = first[3]
  if (major !== 3 && major !== 4) {
    throw new Error(`不支持的 ID3v2.${major} 标签`)
  }
  const tagSize = readSyncsafe(first, 6)
  if (
    tagSize <= 0 ||
    tagSize > MAX_ID3_TAG_SIZE ||
    ID3_HEADER_SIZE + tagSize > file.size
  ) {
    throw new Error('ID3 标签长度异常')
  }

  const tagEnd = ID3_HEADER_SIZE + tagSize
  const bytes = new Uint8Array(await file.slice(0, tagEnd).arrayBuffer())
  const frames = parseFrames(bytes, major, tagEnd)
  const version = normalizeText(frames.get('TCOM'))
  const trackId = normalizeText(frames.get('TRCK'))
  const sizeText = normalizeText(frames.get('TSIZ'))
  const headerBase64Prefix = normalizeText(frames.get('TSSE'))
  const ivHex = normalizeText(frames.get('TSRC') || frames.get('TENC'))

  if (!version || !trackId || !sizeText || !headerBase64Prefix || !ivHex) {
    throw new Error('缺少 XM 必要标签')
  }
  if (!/^\d+$/.test(trackId) || trackId.length >= 24) {
    throw new Error('XM 音轨 ID 异常')
  }
  const encryptedSize = Number(sizeText)
  if (
    !Number.isSafeInteger(encryptedSize) ||
    encryptedSize <= 0 ||
    encryptedSize % 16 !== 0 ||
    tagEnd + encryptedSize > file.size
  ) {
    throw new Error('XM 加密头长度异常')
  }
  if (!/^[0-9a-f]{32}$/i.test(ivHex)) {
    throw new Error('XM 初始化向量异常')
  }
  if (!isBase64Fragment(headerBase64Prefix)) {
    throw new Error('XM 音频头前缀异常')
  }

  const durationText = normalizeText(frames.get('TLEN'))
  const durationValue = durationText ? Number(durationText) : NaN
  const coverUrl = normalizeCoverUrl(frames.get('COMM'))

  return {
    tagEnd,
    version: version.toLowerCase().replace(/^v/, ''),
    trackId,
    encryptedSize,
    headerBase64Prefix,
    ivHex: ivHex.toLowerCase(),
    title: normalizeText(frames.get('TIT2')) || undefined,
    artist: normalizeText(frames.get('TPE1')) || undefined,
    album: normalizeText(frames.get('TALB')) || undefined,
    duration: Number.isFinite(durationValue) ? durationValue : undefined,
    coverUrl,
  }
}

/** 只用于 ID3→MP3 分流；任何解析异常都表示“不足以证明是 XM”。 */
export async function hasXmSignature(file: Blob): Promise<boolean> {
  try {
    await readXmHeader(file)
    return true
  } catch {
    return false
  }
}

function parseFrames(
  bytes: Uint8Array,
  major: number,
  tagEnd: number,
): Map<string, string> {
  const frames = new Map<string, string>()
  let offset = ID3_HEADER_SIZE
  const hasExtendedHeader = (bytes[5] & 0x40) !== 0
  if (hasExtendedHeader) {
    if (offset + 4 > tagEnd) throw new Error('ID3 扩展头损坏')
    const size =
      major === 4 ? readSyncsafe(bytes, offset) : readUint32BE(bytes, offset)
    offset += major === 4 ? size : 4 + size
  }

  while (offset + 10 <= tagEnd) {
    const id = ascii(bytes.subarray(offset, offset + 4))
    if (id === '\0\0\0\0') break
    if (!/^[A-Z0-9]{4}$/.test(id)) throw new Error('ID3 frame ID 异常')
    const frameSize =
      major === 4
        ? readSyncsafe(bytes, offset + 4)
        : readUint32BE(bytes, offset + 4)
    const payloadStart = offset + 10
    const payloadEnd = payloadStart + frameSize
    if (frameSize < 0 || payloadEnd > tagEnd) {
      throw new Error(`ID3 ${id} frame 长度异常`)
    }
    const payload = bytes.subarray(payloadStart, payloadEnd)
    if (id[0] === 'T') {
      frames.set(id, decodeTextFrame(payload))
    } else if (id === 'COMM') {
      frames.set(id, decodeCommentFrame(payload))
    }
    offset = payloadEnd
  }
  return frames
}

function decodeTextFrame(payload: Uint8Array): string {
  if (payload.length < 2) return ''
  return decodeText(payload.subarray(1), payload[0])
}

function decodeCommentFrame(payload: Uint8Array): string {
  if (payload.length < 5) return ''
  const encoding = payload[0]
  const textStart = findDescriptionEnd(payload, 4, encoding)
  if (textStart >= 0 && textStart < payload.length) {
    const decoded = decodeText(payload.subarray(textStart), encoding)
    if (/(?:https?:)?\/\//i.test(decoded)) return decoded
  }

  // 喜马拉雅部分 XM 的 COMM 不符合 ID3 规范：language 只写 2 字节 "en"，
  // 第 3 字节直接塞入 UTF-16 BOM，导致标准的 3 字节 language 偏移失效。
  // 从 payload 内候选 BOM 重新锚定，只接受能解出 URL 的结果。
  if (encoding === 1 || encoding === 2) {
    for (let i = 1; i + 1 < payload.length; i++) {
      const isBom =
        (payload[i] === 0xff && payload[i + 1] === 0xfe) ||
        (payload[i] === 0xfe && payload[i + 1] === 0xff)
      if (!isBom) continue
      const decoded = decodeText(payload.subarray(i), encoding)
      if (/(?:https?:)?\/\//i.test(decoded)) return decoded
    }
  }
  return ''
}

function findDescriptionEnd(
  payload: Uint8Array,
  start: number,
  encoding: number,
): number {
  if (encoding === 1 || encoding === 2) {
    for (let i = start; i + 1 < payload.length; i += 2) {
      if (payload[i] === 0 && payload[i + 1] === 0) return i + 2
    }
    return -1
  }
  for (let i = start; i < payload.length; i++) {
    if (payload[i] === 0) return i + 1
  }
  return -1
}

function decodeText(data: Uint8Array, encoding: number): string {
  let decoded: string
  if (encoding === 0) {
    decoded = new TextDecoder('latin1').decode(data)
  } else if (encoding === 3) {
    decoded = new TextDecoder('utf-8', { fatal: false }).decode(data)
  } else if (encoding === 2) {
    decoded = new TextDecoder('utf-16be', { fatal: false }).decode(data)
  } else if (data.length >= 2 && data[0] === 0xfe && data[1] === 0xff) {
    decoded = new TextDecoder('utf-16be', { fatal: false }).decode(data.subarray(2))
  } else if (data.length >= 2 && data[0] === 0xff && data[1] === 0xfe) {
    decoded = new TextDecoder('utf-16le', { fatal: false }).decode(data.subarray(2))
  } else {
    decoded = new TextDecoder('utf-16le', { fatal: false }).decode(data)
  }
  return normalizeText(decoded)
}

function normalizeText(value: string | undefined): string {
  return (value || '').replace(/^\uFEFF/, '').replace(/\0+$/g, '').trim()
}

function normalizeCoverUrl(value: string | undefined): string | undefined {
  const text = normalizeText(value)
  const match = text.match(/(?:https?:)?\/\/[^\s\0]+/i)
  if (!match) return undefined
  if (match[0].startsWith('//')) return `https:${match[0]}`
  return match[0].replace(/^http:\/\//i, 'https://')
}

function isBase64Fragment(value: string): boolean {
  return value.length > 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value)
}

function readSyncsafe(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) throw new Error('syncsafe 越界')
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  )
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) throw new Error('uint32 越界')
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  )
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes)
}
