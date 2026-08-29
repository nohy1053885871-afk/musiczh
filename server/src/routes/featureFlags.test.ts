import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { Hono } from 'hono'
import { createFeatureFlagStore } from '../lib/featureFlags.js'
import { signAdminToken } from '../middleware/auth.js'
import { createAdminFeatureFlagsRouter } from './adminFeatureFlags.js'
import { createPublicConfigRouter } from './publicConfig.js'

process.env.JWT_SECRET = 'feature-flags-test-secret-at-least-32-characters'

function createTestApp() {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE feature_flags (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  const store = createFeatureFlagStore(database)
  const app = new Hono()
  app.route('/api/config', createPublicConfigRouter(store))
  app.route(
    '/api/admin/feature-flags',
    createAdminFeatureFlagsRouter(store),
  )
  return { app, database }
}

async function adminCookie(): Promise<string> {
  const token = await signAdminToken({ uid: 1, username: 'admin' })
  return `admin_token=${token}`
}

test('公开配置只返回允许公开的字段并禁止缓存', async () => {
  const { app, database } = createTestApp()
  const response = await app.request('/api/config')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const body = await response.json()
  assert.deepEqual(body, {
    homepageGuidanceVisible: true,
    homepageAnnouncement: null,
  })
  database.close()
})

test('管理接口要求登录', async () => {
  const { app, database } = createTestApp()
  const response = await app.request(
    '/api/admin/feature-flags/homepage-guidance',
  )
  assert.equal(response.status, 401)
  database.close()
})

test('管理接口拒绝非法 JSON 和非布尔值', async () => {
  const { app, database } = createTestApp()
  const cookie = await adminCookie()
  const baseInit = {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  }

  const invalidJson = await app.request(
    '/api/admin/feature-flags/homepage-guidance',
    { ...baseInit, body: '{' },
  )
  assert.equal(invalidJson.status, 400)

  const invalidValue = await app.request(
    '/api/admin/feature-flags/homepage-guidance',
    { ...baseInit, body: JSON.stringify({ enabled: 'false' }) },
  )
  assert.equal(invalidValue.status, 400)
  database.close()
})

test('管理员可写入并读回首页指引状态', async () => {
  const { app, database } = createTestApp()
  const cookie = await adminCookie()
  const headers = { 'Content-Type': 'application/json', Cookie: cookie }

  const update = await app.request(
    '/api/admin/feature-flags/homepage-guidance',
    { method: 'PUT', headers, body: JSON.stringify({ enabled: false }) },
  )
  assert.equal(update.status, 200)
  const updated = await update.json() as { enabled: boolean; updatedAt: number }
  assert.equal(updated.enabled, false)
  assert.equal(typeof updated.updatedAt, 'number')

  const read = await app.request(
    '/api/admin/feature-flags/homepage-guidance',
    { headers },
  )
  assert.equal(read.status, 200)
  assert.deepEqual(await read.json(), updated)

  const publicRead = await app.request('/api/config')
  assert.deepEqual(await publicRead.json(), {
    homepageGuidanceVisible: false,
    homepageAnnouncement: null,
  })
  database.close()
})

test('管理员可分别保存两个域名公告，公开接口只返回当前 Host 配置', async () => {
  const { app, database } = createTestApp()
  const cookie = await adminCookie()
  const headers = { 'Content-Type': 'application/json', Cookie: cookie }

  const saveSleepno = await app.request(
    '/api/admin/feature-flags/homepage-announcements/sleepno.cn',
    {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        enabled: true,
        message: 'sleepno 独立公告',
        actionLabel: '查看详情',
        actionUrl: '/notice',
      }),
    },
  )
  assert.equal(saveSleepno.status, 200)
  const savedSleepno = await saveSleepno.json() as { updatedAt: number }

  const list = await app.request(
    '/api/admin/feature-flags/homepage-announcements',
    { headers },
  )
  assert.equal(list.status, 200)
  const listBody = await list.json() as {
    announcements: Array<{ siteHost: string; enabled: boolean }>
  }
  assert.deepEqual(
    listBody.announcements.map((item) => [item.siteHost, item.enabled]),
    [['sleepno.cn', true], ['shiyinmp3.com', false]],
  )

  const sleepnoPublic = await app.request('/api/config', {
    headers: { Host: 'sleepno.cn' },
  })
  assert.deepEqual(await sleepnoPublic.json(), {
    homepageGuidanceVisible: true,
    homepageAnnouncement: {
      siteHost: 'sleepno.cn',
      message: 'sleepno 独立公告',
      action: { label: '查看详情', href: '/notice' },
      updatedAt: savedSleepno.updatedAt,
    },
  })

  const cloudflarePublic = await app.request('/api/config', {
    headers: { Host: 'shiyinmp3.com' },
  })
  assert.deepEqual(await cloudflarePublic.json(), {
    homepageGuidanceVisible: true,
    homepageAnnouncement: null,
  })
  database.close()
})

test('公告管理接口拒绝未知域名、空正文、不成对行动点和危险链接', async () => {
  const { app, database } = createTestApp()
  const cookie = await adminCookie()
  const headers = { 'Content-Type': 'application/json', Cookie: cookie }
  const basePath = '/api/admin/feature-flags/homepage-announcements/'

  const unknown = await app.request(`${basePath}unknown.example`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      enabled: false,
      message: '',
      actionLabel: null,
      actionUrl: null,
    }),
  })
  assert.equal(unknown.status, 400)

  for (const body of [
    { enabled: true, message: '  ', actionLabel: null, actionUrl: null },
    { enabled: true, message: '公告', actionLabel: '查看', actionUrl: null },
    {
      enabled: true,
      message: '公告',
      actionLabel: '查看',
      actionUrl: 'javascript:alert(1)',
    },
    {
      enabled: true,
      message: '公告',
      actionLabel: '查看',
      actionUrl: '//evil.example',
    },
    {
      enabled: true,
      message: '公告',
      actionLabel: '查看',
      actionUrl: '/\\evil.example',
    },
  ]) {
    const response = await app.request(`${basePath}sleepno.cn`, {
      method: 'PUT', headers, body: JSON.stringify(body),
    })
    assert.equal(response.status, 400)
  }
  database.close()
})
