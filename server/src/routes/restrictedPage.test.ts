import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { Hono } from 'hono'
import {
  createSiteAccessStore,
  type SiteAccessSnapshot,
} from '../lib/siteAccess.js'
import { createSiteAccessAnalyticsStore } from '../lib/siteAccessAnalytics.js'
import { signAdminToken } from '../middleware/auth.js'
import { createAdminSiteAccessRouter } from './adminSiteAccess.js'
import { createPublicRestrictedPageRouter } from './publicRestrictedPage.js'

process.env.JWT_SECRET = 'restricted-page-test-secret-at-least-32-characters'

const CURRENT_IP = '203.0.113.10'
const OTHER_IP = '198.51.100.20'
const CREATE_TABLES_SQL = `
  CREATE TABLE feature_flags (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE site_access_ip_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    address TEXT UNIQUE NOT NULL,
    rule TEXT NOT NULL CHECK (rule IN ('allow', 'deny')),
    note TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE site_access_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts INTEGER NOT NULL,
    event TEXT NOT NULL CHECK (event = 'restricted_page_view'),
    ip TEXT,
    ua TEXT
  );
`

function createTestApp() {
  const database = new Database(':memory:')
  database.exec(CREATE_TABLES_SQL)
  const store = createSiteAccessStore(database)
  const analyticsStore = createSiteAccessAnalyticsStore(database)
  const app = new Hono()
  app.route('/api/admin/site-access', createAdminSiteAccessRouter(store))
  app.route(
    '/api/restricted-page',
    createPublicRestrictedPageRouter(store, analyticsStore),
  )
  return { app, database, store, analyticsStore }
}

async function adminHeaders() {
  const token = await signAdminToken({ uid: 1, username: 'admin' })
  return {
    'Content-Type': 'application/json',
    Cookie: `admin_token=${token}`,
    'X-Real-IP': CURRENT_IP,
  }
}

test('辅助文案默认隐藏、持久化，并要求管理员登录', async () => {
  const { app, database, store } = createTestApp()
  assert.deepEqual(store.getRestrictedPageConfig(), {
    message: null, updatedAt: null,
  })
  const unauthorized = await app.request('/api/admin/site-access/restricted-page', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: null }),
  })
  assert.equal(unauthorized.status, 401)

  const saved = await app.request('/api/admin/site-access/restricted-page', {
    method: 'PUT', headers: await adminHeaders(),
    body: JSON.stringify({ message: '  关注小红书，获取最新地址。  ' }),
  })
  assert.equal(saved.status, 200)
  const savedBody = await saved.json() as SiteAccessSnapshot
  assert.equal(savedBody.restrictedPage.message, '关注小红书，获取最新地址。')

  const reopened = createSiteAccessStore(database)
  assert.equal(
    reopened.getRestrictedPageConfig().message,
    '关注小红书，获取最新地址。',
  )
  database.close()
})

test('管理接口严格校验，公开接口只返回辅助文案', async () => {
  const { app, database } = createTestApp()
  const headers = await adminHeaders()
  const invalidShape = await app.request('/api/admin/site-access/restricted-page', {
    method: 'PUT', headers,
    body: JSON.stringify({ message: '测试', xiaohongshuUrl: 'https://example.com' }),
  })
  assert.equal(invalidShape.status, 400)

  await app.request('/api/admin/site-access/restricted-page', {
    method: 'PUT', headers,
    body: JSON.stringify({ message: '关注小红书，获取最新地址。' }),
  })
  const publicRead = await app.request('/api/restricted-page', {
    headers: { 'X-Real-IP': OTHER_IP, 'User-Agent': 'test-browser' },
  })
  assert.equal(publicRead.status, 200)
  assert.equal(publicRead.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(await publicRead.json(), {
    message: '关注小红书，获取最新地址。',
  })
  database.close()
})

test('曝光进入独立聚合并按 IP 去重', async () => {
  const { app, database, analyticsStore } = createTestApp()
  const from = Date.now() - 1_000
  for (const ip of [OTHER_IP, OTHER_IP, '192.0.2.33']) {
    await app.request('/api/restricted-page', {
      headers: { 'X-Real-IP': ip, 'User-Agent': 'test-browser' },
    })
  }

  assert.deepEqual(analyticsStore.summarize(from, Date.now() + 1_000), {
    views: 3, uniqueIps: 2,
  })
  assert.deepEqual(analyticsStore.summarize(1, 2), {
    views: 0, uniqueIps: 0,
  })
  database.close()
})
