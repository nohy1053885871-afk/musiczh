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

test('两个域名的首页公告默认关闭并独立持久化', () => {
  const database = new Database(':memory:')
  database.exec(CREATE_TABLE_SQL)
  const store = createFeatureFlagStore(database)

  assert.deepEqual(
    store.listHomepageAnnouncements().map((item) => ({
      siteHost: item.siteHost,
      enabled: item.enabled,
      message: item.message,
      updatedAt: item.updatedAt,
    })),
    [
      { siteHost: 'sleepno.cn', enabled: false, message: '', updatedAt: null },
      { siteHost: 'shiyinmp3.com', enabled: false, message: '', updatedAt: null },
    ],
  )

  const sleepno = store.setHomepageAnnouncement('sleepno.cn', {
    enabled: true,
    message: '阿里云入口公告',
    actionLabel: '查看详情',
    actionUrl: '/notice',
  })
  assert.equal(sleepno.enabled, true)
  assert.equal(sleepno.actionUrl, '/notice')
  assert.equal(store.getHomepageAnnouncement('shiyinmp3.com').enabled, false)

  const firstUpdatedAt = sleepno.updatedAt as number
  const updated = store.setHomepageAnnouncement('sleepno.cn', {
    enabled: true,
    message: '更新后的公告',
    actionLabel: null,
    actionUrl: null,
  })
  assert.ok((updated.updatedAt as number) > firstUpdatedAt)
  assert.equal(updated.actionLabel, null)
  database.close()
})

test('公告配置 JSON 非法时失败安全为关闭且隐藏危险行动点', () => {
  const database = new Database(':memory:')
  database.exec(CREATE_TABLE_SQL)
  database.prepare('INSERT INTO feature_flags VALUES (?, ?, ?)').run(
    'homepage_announcement_sleepno_cn',
    JSON.stringify({
      enabled: true,
      message: '保留正文',
      actionLabel: '点击',
      actionUrl: 'javascript:alert(1)',
    }),
    123,
  )
  database.prepare('INSERT INTO feature_flags VALUES (?, ?, ?)').run(
    'homepage_announcement_shiyinmp3_com',
    '{',
    456,
  )
  const store = createFeatureFlagStore(database)

  assert.deepEqual(store.getHomepageAnnouncement('sleepno.cn'), {
    siteHost: 'sleepno.cn',
    enabled: true,
    message: '保留正文',
    actionLabel: null,
    actionUrl: null,
    updatedAt: 123,
  })
  assert.deepEqual(store.getHomepageAnnouncement('shiyinmp3.com'), {
    siteHost: 'shiyinmp3.com',
    enabled: false,
    message: '',
    actionLabel: null,
    actionUrl: null,
    updatedAt: 456,
  })
  database.close()
})
