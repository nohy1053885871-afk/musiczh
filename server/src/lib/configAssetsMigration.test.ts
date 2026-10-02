import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { migrateConfigAssetsLimits } from './configAssetsMigration.js'

const LEGACY_SCHEMA = `
  CREATE TABLE config_assets (
    key TEXT PRIMARY KEY,
    data BLOB NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 1048576),
    width INTEGER NOT NULL CHECK (width > 0 AND width <= 1600),
    height INTEGER NOT NULL CHECK (height > 0 AND height <= 1600),
    sha256 TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  INSERT INTO config_assets
    (key, data, mime_type, byte_size, width, height, sha256, updated_at)
  VALUES ('existing', x'00', 'image/png', 1, 1, 1, 'legacy', 1);
`

test('旧 config_assets 约束原子迁移到 20 MiB 且保留已有图片', () => {
  const database = new Database(':memory:')
  database.exec(LEGACY_SCHEMA)

  migrateConfigAssetsLimits(database)
  migrateConfigAssetsLimits(database)

  const existing = database.prepare(
    'SELECT key, byte_size FROM config_assets WHERE key = ?',
  ).get('existing') as { key: string; byte_size: number }
  assert.deepEqual(existing, { key: 'existing', byte_size: 1 })

  const payload = Buffer.alloc(2 * 1024 * 1024)
  database.prepare(
    `INSERT INTO config_assets
      (key, data, mime_type, byte_size, width, height, sha256, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run('large', payload, 'image/png', payload.byteLength, 4096, 8192, 'large', 2)

  const sql = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'config_assets'",
  ).pluck().get() as string
  assert.match(sql, /byte_size <= 20971520/)
  assert.doesNotMatch(sql, /width <= 1600|height <= 1600/)
  database.close()
})
