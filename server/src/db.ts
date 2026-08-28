import Database from 'better-sqlite3'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DB_PATH = process.env.DB_PATH ?? resolve(__dirname, '..', 'analytics.db')

const db = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')

const schemaSQL = readFileSync(resolve(__dirname, 'schema.sql'), 'utf8')
db.exec(schemaSQL)

function addColumn(sql: string) {
  try {
    db.exec(sql)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (!/duplicate column name/i.test(msg)) throw err
  }
}

// ALTER TABLE ADD COLUMN 在已存在时抛 duplicate column，统一包裹为幂等迁移。
// file_id 为 VIRTUAL 生成列，不占存储；旧数据自然为 NULL。
addColumn(
  "ALTER TABLE events ADD COLUMN file_id TEXT GENERATED ALWAYS AS (json_extract(props,'$.file_id')) VIRTUAL",
)
addColumn('ALTER TABLE events ADD COLUMN site_host TEXT')
addColumn('ALTER TABLE overview_daily_metrics ADD COLUMN pv_sleepno_cn INTEGER NOT NULL DEFAULT 0')
addColumn('ALTER TABLE overview_daily_metrics ADD COLUMN pv_shiyinmp3_com INTEGER NOT NULL DEFAULT 0')
addColumn('ALTER TABLE overview_daily_visitors ADD COLUMN has_pageview_sleepno_cn INTEGER NOT NULL DEFAULT 0')
addColumn('ALTER TABLE overview_daily_visitors ADD COLUMN has_pageview_shiyinmp3_com INTEGER NOT NULL DEFAULT 0')
db.exec(
  'CREATE INDEX IF NOT EXISTS idx_events_file_id ON events(file_id) WHERE file_id IS NOT NULL',
)

export default db
