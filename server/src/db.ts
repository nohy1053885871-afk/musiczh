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

export default db
