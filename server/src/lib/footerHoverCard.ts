import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import db from '../db.js'

export const FOOTER_HOVER_CONFIG_KEY = 'footer_hover_card'
export const FOOTER_HOVER_ASSET_KEY = 'footer_hover_card_image'
export const FOOTER_HOVER_MAX_BYTES = 20 * 1024 * 1024
export const FOOTER_HOVER_MAX_LABEL_LENGTH = 10

const ACCEPTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export type FooterHoverImageInput = {
  data: Buffer
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  byteSize: number
  width: number
  height: number
  sha256: string
}

export type FooterHoverImageMeta = Omit<FooterHoverImageInput, 'data'> & {
  updatedAt: number
}

export type FooterHoverCardConfig = {
  enabled: boolean
  label: string
  image: FooterHoverImageMeta | null
  updatedAt: number | null
}

export type PublicFooterHoverCard = {
  label: string
  image: FooterHoverImageMeta
  updatedAt: number
}

export type FooterHoverCardSaveInput = {
  enabled: boolean
  label: string
  image?: FooterHoverImageInput
  removeImage: boolean
}

export type FooterHoverCardStore = {
  getAdminConfig: () => FooterHoverCardConfig
  getPublicConfig: () => PublicFooterHoverCard | null
  getImage: () => (FooterHoverImageInput & { updatedAt: number }) | null
  save: (input: FooterHoverCardSaveInput) => FooterHoverCardConfig
}

export class FooterHoverCardError extends Error {
  constructor(public readonly code: string) {
    super(code)
  }
}

type ImageDetails = Pick<FooterHoverImageInput, 'mimeType' | 'width' | 'height'>

function isPngSignature(data: Buffer): boolean {
  return data.length >= 8 && data.subarray(0, 8).equals(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )
}

function parsePng(data: Buffer): ImageDetails | null {
  if (!isPngSignature(data)) return null
  let offset = 8
  let width = 0
  let height = 0
  let sawIhdr = false
  let sawIdat = false
  let sawIend = false

  while (offset + 12 <= data.length) {
    const chunkLength = data.readUInt32BE(offset)
    const type = data.toString('ascii', offset + 4, offset + 8)
    const chunkEnd = offset + 12 + chunkLength
    if (chunkEnd > data.length) return null
    if (!sawIhdr && type !== 'IHDR') return null

    if (type === 'IHDR') {
      if (sawIhdr || chunkLength !== 13) return null
      width = data.readUInt32BE(offset + 8)
      height = data.readUInt32BE(offset + 12)
      sawIhdr = true
    } else if (type === 'IDAT') {
      sawIdat = true
    } else if (type === 'IEND') {
      if (chunkLength !== 0) return null
      sawIend = true
      break
    }
    offset = chunkEnd
  }

  if (!sawIhdr || !sawIdat || !sawIend || width === 0 || height === 0) {
    return null
  }
  return { mimeType: 'image/png', width, height }
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
])

function parseJpeg(data: Buffer): ImageDetails | null {
  if (
    data.length < 12 ||
    data[0] !== 0xff || data[1] !== 0xd8
  ) return null

  let offset = 2
  while (offset + 4 <= data.length - 2) {
    if (data[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (offset < data.length && data[offset] === 0xff) offset += 1
    const marker = data[offset]
    offset += 1
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 2 > data.length) return null
    const segmentLength = data.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > data.length) return null
    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 8) return null
      const height = data.readUInt16BE(offset + 3)
      const width = data.readUInt16BE(offset + 5)
      if (width === 0 || height === 0) return null
      return { mimeType: 'image/jpeg', width, height }
    }
    offset += segmentLength
  }
  return null
}

function parseWebp(data: Buffer): ImageDetails | null {
  if (
    data.length < 30 ||
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.toString('ascii', 8, 12) !== 'WEBP' ||
    data.readUInt32LE(4) + 8 > data.length
  ) return null

  const chunkType = data.toString('ascii', 12, 16)
  const chunkLength = data.readUInt32LE(16)
  if (20 + chunkLength > data.length) return null

  if (chunkType === 'VP8X' && chunkLength >= 10) {
    const width = data.readUIntLE(24, 3) + 1
    const height = data.readUIntLE(27, 3) + 1
    return { mimeType: 'image/webp', width, height }
  }
  if (
    chunkType === 'VP8 ' &&
    chunkLength >= 10 &&
    data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a
  ) {
    const width = data.readUInt16LE(26) & 0x3fff
    const height = data.readUInt16LE(28) & 0x3fff
    return { mimeType: 'image/webp', width, height }
  }
  if (chunkType === 'VP8L' && chunkLength >= 5 && data[20] === 0x2f) {
    const width = 1 + data[21] + ((data[22] & 0x3f) << 8)
    const height = 1 + ((data[22] & 0xc0) >> 6) + (data[23] << 2) + ((data[24] & 0x0f) << 10)
    return { mimeType: 'image/webp', width, height }
  }
  return null
}

function detectImage(data: Buffer): ImageDetails | null {
  return parsePng(data) ?? parseJpeg(data) ?? parseWebp(data)
}

export function validateFooterHoverImage(
  bytes: Uint8Array,
  declaredMimeType: string,
): FooterHoverImageInput {
  if (bytes.byteLength === 0) throw new FooterHoverCardError('image_empty')
  if (bytes.byteLength > FOOTER_HOVER_MAX_BYTES) {
    throw new FooterHoverCardError('image_too_large')
  }

  const data = Buffer.from(bytes)
  const details = detectImage(data)
  if (!details) throw new FooterHoverCardError('image_invalid')

  const normalizedDeclared = declaredMimeType.trim().toLowerCase()
  if (
    normalizedDeclared &&
    (!ACCEPTED_MIME_TYPES.has(normalizedDeclared) ||
      normalizedDeclared !== details.mimeType)
  ) {
    throw new FooterHoverCardError('image_mime_mismatch')
  }
  return {
    data,
    ...details,
    byteSize: data.byteLength,
    sha256: createHash('sha256').update(data).digest('hex'),
  }
}

function countCharacters(value: string): number {
  return Array.from(value).length
}

function normalizeLabel(value: string): string {
  return value.trim()
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 0x1f || codePoint === 0x7f
  })
}

function validLabel(value: string): boolean {
  return (
    value.length > 0 &&
    countCharacters(value) <= FOOTER_HOVER_MAX_LABEL_LENGTH &&
    !hasControlCharacters(value)
  )
}

function parseConfigValue(raw: string | undefined): { enabled: boolean; label: string } {
  if (!raw) return { enabled: false, label: '' }
  try {
    const decoded: unknown = JSON.parse(raw)
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      return { enabled: false, label: '' }
    }
    const value = decoded as Record<string, unknown>
    const label = typeof value.label === 'string' ? normalizeLabel(value.label) : ''
    return {
      enabled: value.enabled === true && validLabel(label),
      label: validLabel(label) ? label : '',
    }
  } catch {
    return { enabled: false, label: '' }
  }
}

export function createFooterHoverCardStore(
  database: Database.Database,
): FooterHoverCardStore {
  const getImage = () => {
    const row = database.prepare(
      `SELECT data, mime_type, byte_size, width, height, sha256, updated_at
       FROM config_assets WHERE key = ?`,
    ).get(FOOTER_HOVER_ASSET_KEY) as {
      data: Buffer
      mime_type: FooterHoverImageInput['mimeType']
      byte_size: number
      width: number
      height: number
      sha256: string
      updated_at: number
    } | undefined
    if (!row) return null
    return {
      data: row.data,
      mimeType: row.mime_type,
      byteSize: row.byte_size,
      width: row.width,
      height: row.height,
      sha256: row.sha256,
      updatedAt: row.updated_at,
    }
  }

  const getAdminConfig = (): FooterHoverCardConfig => {
    const row = database.prepare(
      'SELECT value, updated_at FROM feature_flags WHERE key = ?',
    ).get(FOOTER_HOVER_CONFIG_KEY) as {
      value: string
      updated_at: number
    } | undefined
    const parsed = parseConfigValue(row?.value)
    const image = getImage()
    return {
      enabled: parsed.enabled && image !== null,
      label: parsed.label,
      image: image
        ? {
            mimeType: image.mimeType,
            byteSize: image.byteSize,
            width: image.width,
            height: image.height,
            sha256: image.sha256,
            updatedAt: image.updatedAt,
          }
        : null,
      updatedAt: row?.updated_at ?? null,
    }
  }

  const saveTransaction = database.transaction((input: FooterHoverCardSaveInput) => {
    const label = normalizeLabel(input.label)
    if (label && !validLabel(label)) {
      throw new FooterHoverCardError('label_invalid')
    }
    if (input.enabled && !label) {
      throw new FooterHoverCardError('label_required_when_enabled')
    }
    if (input.image && input.removeImage) {
      throw new FooterHoverCardError('image_and_remove_conflict')
    }

    const previous = getAdminConfig()
    const effectiveImage = input.image ?? (input.removeImage ? null : previous.image)
    if (input.enabled && !effectiveImage) {
      throw new FooterHoverCardError('image_required_when_enabled')
    }

    const latestTimestamp = Math.max(
      previous.updatedAt ?? 0,
      previous.image?.updatedAt ?? 0,
    )
    const updatedAt = Math.max(Date.now(), latestTimestamp + 1)

    if (input.image) {
      database.prepare(
        `INSERT INTO config_assets
           (key, data, mime_type, byte_size, width, height, sha256, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           data = excluded.data,
           mime_type = excluded.mime_type,
           byte_size = excluded.byte_size,
           width = excluded.width,
           height = excluded.height,
           sha256 = excluded.sha256,
           updated_at = excluded.updated_at`,
      ).run(
        FOOTER_HOVER_ASSET_KEY,
        input.image.data,
        input.image.mimeType,
        input.image.byteSize,
        input.image.width,
        input.image.height,
        input.image.sha256,
        updatedAt,
      )
    } else if (input.removeImage) {
      database.prepare('DELETE FROM config_assets WHERE key = ?')
        .run(FOOTER_HOVER_ASSET_KEY)
    }

    database.prepare(
      `INSERT INTO feature_flags (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    ).run(
      FOOTER_HOVER_CONFIG_KEY,
      JSON.stringify({ enabled: input.enabled, label }),
      updatedAt,
    )
  })

  return {
    getAdminConfig,

    getPublicConfig() {
      const config = getAdminConfig()
      if (!config.enabled || !config.image || config.updatedAt === null) return null
      return {
        label: config.label,
        image: config.image,
        updatedAt: config.updatedAt,
      }
    },

    getImage,

    save(input) {
      saveTransaction(input)
      return getAdminConfig()
    },
  }
}

export const footerHoverCardStore = createFooterHoverCardStore(db)
