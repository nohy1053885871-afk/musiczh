import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { createFeatureFlagStore } from './featureFlags.js'

const CREATE_TABLE_SQL = `
  CREATE TABLE feature_flags (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`

test('缺少配置行或历史值非法时默认显示首页指引', () => {
  const database = new Database(':memory:')
  database.exec(CREATE_TABLE_SQL)
  const store = createFeatureFlagStore(database)

  assert.deepEqual(store.getHomepageGuidance(), {
    enabled: true,
    updatedAt: null,
  })

  database
    .prepare('INSERT INTO feature_flags VALUES (?, ?, ?)')
    .run('homepage_guidance_visible', 'invalid', 123)
  assert.deepEqual(store.getHomepageGuidance(), {
    enabled: true,
    updatedAt: 123,
  })
  database.close()
})

test('开关使用原子 upsert 并在数据库重开后保持状态', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'musiczh-feature-flags-'))
  const databasePath = join(tempDir, 'flags.db')

  try {
    let database = new Database(databasePath)
    database.exec(CREATE_TABLE_SQL)
    const firstStore = createFeatureFlagStore(database)
    const saved = firstStore.setHomepageGuidance(false)
    assert.equal(saved.enabled, false)
    assert.equal(typeof saved.updatedAt, 'number')
    database.close()

    database = new Database(databasePath)
    const reopenedStore = createFeatureFlagStore(database)
    assert.equal(reopenedStore.getHomepageGuidance().enabled, false)
    assert.equal(reopenedStore.setHomepageGuidance(true).enabled, true)
    assert.equal(reopenedStore.getHomepageGuidance().enabled, true)
    database.close()
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})
