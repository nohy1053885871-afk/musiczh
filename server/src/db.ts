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

// v0.4.1 迁移：从 props 中抽出 file_id 作 VIRTUAL 生成列 + 索引
// ALTER TABLE ADD COLUMN 在已存在时抛 duplicate column，包 try/catch 实现幂等
// 生成列 VIRTUAL 不占存储，按需 json_extract，旧数据自动落 NULL（前端识别为 legacy 显示「-」）
try {
  db.exec(
    "ALTER TABLE events ADD COLUMN file_id TEXT GENERATED ALWAYS AS (json_extract(props,'$.file_id')) VIRTUAL",
  )
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err)
  if (!/duplicate column name/i.test(msg)) throw err
}
db.exec(
  'CREATE INDEX IF NOT EXISTS idx_events_file_id ON events(file_id) WHERE file_id IS NOT NULL',
)

export default db
