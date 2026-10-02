import type Database from 'better-sqlite3'

const CREATE_V2_TABLE_SQL = `
  CREATE TABLE config_assets_v2 (
    key         TEXT PRIMARY KEY,
    data        BLOB NOT NULL,
    mime_type   TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    byte_size   INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 20971520),
    width       INTEGER NOT NULL CHECK (width > 0),
    height      INTEGER NOT NULL CHECK (height > 0),
    sha256      TEXT NOT NULL,
    updated_at  INTEGER NOT NULL
  )
`

export function migrateConfigAssetsLimits(database: Database.Database) {
  const row = database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'config_assets'",
  ).get() as { sql: string } | undefined
  if (!row) return

  const compactSql = row.sql.replace(/\s+/g, ' ').toLowerCase()
  const hasLegacyLimits =
    compactSql.includes('byte_size <= 1048576') ||
    compactSql.includes('width <= 1600') ||
    compactSql.includes('height <= 1600')
  if (!hasLegacyLimits) return

  database.transaction(() => {
    database.exec(CREATE_V2_TABLE_SQL)
    database.exec(`
      INSERT INTO config_assets_v2
        (key, data, mime_type, byte_size, width, height, sha256, updated_at)
      SELECT key, data, mime_type, byte_size, width, height, sha256, updated_at
      FROM config_assets;
      DROP TABLE config_assets;
      ALTER TABLE config_assets_v2 RENAME TO config_assets;
    `)
  })()
}
