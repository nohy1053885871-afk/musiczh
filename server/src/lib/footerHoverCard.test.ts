import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import {
  FooterHoverCardError,
  createFooterHoverCardStore,
  validateFooterHoverImage,
} from './footerHoverCard.js'

const CREATE_TABLES_SQL = `
  CREATE TABLE feature_flags (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE config_assets (
    key TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

function pngWithLargeIdat(payloadBytes: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const chunk = (type: string, data: Buffer) => {
    const result = Buffer.alloc(12 + data.byteLength)
    result.writeUInt32BE(data.byteLength, 0)
    result.write(type, 4, 4, 'ascii')
    data.copy(result, 8)
    return result
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(4096, 0)
  ihdr.writeUInt32BE(8192, 4)
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', Buffer.alloc(payloadBytes)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function jpegWithTrailingMotionData(): Buffer {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x0b,
    0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00,
    0xff, 0xd9,
    0x6d, 0x6f, 0x74, 0x69, 0x6f, 0x6e,
  ])
}

function assertCode(action: () => unknown, code: string) {
  assert.throws(action, (error: unknown) => {
    return error instanceof FooterHoverCardError && error.code === code
  })
}

test('图片按真实字节识别并生成可信元数据', () => {
  const image = validateFooterHoverImage(PNG_1X1, 'image/png')
  assert.equal(image.mimeType, 'image/png')
  assert.equal(image.width, 1)
  assert.equal(image.height, 1)
  assert.equal(image.byteSize, PNG_1X1.byteLength)
  assert.match(image.sha256, /^[a-f0-9]{64}$/)

  const motionJpeg = validateFooterHoverImage(
    jpegWithTrailingMotionData(),
    'image/jpeg',
  )
  assert.equal(motionJpeg.mimeType, 'image/jpeg')
  assert.equal(motionJpeg.width, 3)
  assert.equal(motionJpeg.height, 2)

  const pngWithTrailingData = validateFooterHoverImage(
    Buffer.concat([PNG_1X1, Buffer.from('trailing-metadata')]),
    'image/png',
  )
  assert.equal(pngWithTrailingData.mimeType, 'image/png')
})

test('图片校验拒绝伪造 MIME、损坏内容和超过 20 MiB 的文件', () => {
  assertCode(
    () => validateFooterHoverImage(PNG_1X1, 'image/jpeg'),
    'image_mime_mismatch',
  )
  assertCode(
    () => validateFooterHoverImage(Buffer.from('not-an-image'), 'image/png'),
    'image_invalid',
  )

  const largeDimensions = Buffer.from(PNG_1X1)
  largeDimensions.writeUInt32BE(4096, 16)
  largeDimensions.writeUInt32BE(8192, 20)
  const accepted = validateFooterHoverImage(largeDimensions, 'image/png')
  assert.equal(accepted.width, 4096)
  assert.equal(accepted.height, 8192)

  const overLegacyLimit = validateFooterHoverImage(
    pngWithLargeIdat(2 * 1024 * 1024),
    'image/png',
  )
  assert.ok(overLegacyLimit.byteSize > 1024 * 1024)

  assertCode(
    () => validateFooterHoverImage(Buffer.alloc(20 * 1024 * 1024 + 1), 'image/png'),
    'image_too_large',
  )
})

test('配置与图片原子保存、跨数据库重开持久化并可移除', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'musiczh-footer-hover-'))
  const databasePath = join(tempDir, 'footer-hover.db')

  try {
    let database = new Database(databasePath)
    database.exec(CREATE_TABLES_SQL)
    let store = createFooterHoverCardStore(database)
    assert.deepEqual(store.getAdminConfig(), {
      enabled: false,
      label: '',
      image: null,
      updatedAt: null,
    })

    const image = validateFooterHoverImage(PNG_1X1, 'image/png')
    const saved = store.save({
      enabled: true,
      label: '关注拾音',
      image,
      removeImage: false,
    })
    assert.equal(saved.enabled, true)
    assert.equal(saved.label, '关注拾音')
    assert.equal(saved.image?.sha256, image.sha256)
    assert.equal(store.getPublicConfig()?.label, '关注拾音')
    database.close()

    database = new Database(databasePath)
    store = createFooterHoverCardStore(database)
    assert.equal(store.getAdminConfig().enabled, true)
    assert.deepEqual(store.getImage()?.data, PNG_1X1)

    assertCode(
      () => store.save({
        enabled: true,
        label: '关注拾音',
        removeImage: true,
      }),
      'image_required_when_enabled',
    )
    assert.equal(store.getImage()?.sha256, image.sha256)

    const removed = store.save({
      enabled: false,
      label: '关注拾音',
      removeImage: true,
    })
    assert.equal(removed.enabled, false)
    assert.equal(removed.image, null)
    assert.equal(store.getPublicConfig(), null)
    database.close()
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('启用配置时要求合法短文案和已保存图片', () => {
  const database = new Database(':memory:')
  database.exec(CREATE_TABLES_SQL)
  const store = createFooterHoverCardStore(database)

  assertCode(
    () => store.save({ enabled: true, label: '', removeImage: false }),
    'label_required_when_enabled',
  )
  assertCode(
    () => store.save({ enabled: false, label: '一二三四五六七八九十一', removeImage: false }),
    'label_invalid',
  )
  assertCode(
    () => store.save({ enabled: true, label: '关注拾音', removeImage: false }),
    'image_required_when_enabled',
  )
  const image = validateFooterHoverImage(PNG_1X1, 'image/png')
  assert.equal(store.save({
    enabled: true,
    label: '一二三四五六七八九十',
    image,
    removeImage: false,
  }).label, '一二三四五六七八九十')
  database.close()
})
