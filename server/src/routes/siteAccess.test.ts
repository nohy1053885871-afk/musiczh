import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { Hono } from 'hono'
import {
  createSiteAccessStore,
  normalizeIpAddress,
  SiteAccessError,
  type SiteAccessSnapshot,
} from '../lib/siteAccess.js'
import { signAdminToken } from '../middleware/auth.js'
import { createAdminSiteAccessRouter } from './adminSiteAccess.js'
import { createInternalSiteAccessRouter } from './internalSiteAccess.js'

process.env.JWT_SECRET = 'site-access-test-secret-at-least-32-characters'

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
`

function createTestApp(database = new Database(':memory:')) {
  database.exec(CREATE_TABLES_SQL)
  const store = createSiteAccessStore(database)
  const app = new Hono()
  app.route('/api/admin/site-access', createAdminSiteAccessRouter(store))
  app.route('/internal/site-access-check', createInternalSiteAccessRouter(store))
  return { app, database, store }
}

async function adminHeaders(ip = CURRENT_IP) {
  const token = await signAdminToken({ uid: 1, username: 'admin' })
  return {
    'Content-Type': 'application/json',
    Cookie: `admin_token=${token}`,
    'X-Real-IP': ip,
  }
}

test('规范化精确 IPv4/IPv6 并拒绝非精确地址', () => {
  assert.equal(normalizeIpAddress(' 203.0.113.8 '), '203.0.113.8')
  assert.equal(
    normalizeIpAddress('2001:0db8:0000:0000:0000:0000:0000:0001'),
    '2001:db8::1',
  )
  for (const input of ['203.0.113.0/24', 'example.com', '203.0.113.8:80', 'fe80::1%en0']) {
    assert.throws(
      () => normalizeIpAddress(input),
      (error) => error instanceof SiteAccessError && error.code === 'invalid_ip',
    )
  }
})

test('缺失或非法限制开关默认关闭，规则和模式可跨数据库重开持久化', () => {
  const dir = mkdtempSync(join(tmpdir(), 'musiczh-site-access-'))
  const path = join(dir, 'site-access.db')
  try {
    let database = new Database(path)
    database.exec(CREATE_TABLES_SQL)
    const first = createSiteAccessStore(database)
    assert.equal(first.snapshot(CURRENT_IP).enabled, false)
    database
      .prepare('INSERT INTO feature_flags VALUES (?, ?, ?)')
      .run('site_access_restricted', 'invalid', 123)
    assert.equal(first.snapshot(CURRENT_IP).enabled, false)
    first.ensureCurrentIp(CURRENT_IP)
    first.setMode(true, CURRENT_IP)
    database.close()

    database = new Database(path)
    const reopened = createSiteAccessStore(database)
    const state = reopened.snapshot(CURRENT_IP)
    assert.equal(state.enabled, true)
    assert.equal(state.allowedIps[0]?.address, CURRENT_IP)
    database.close()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('管理接口要求登录，当前 IP 自动加入且不可直接删除', async () => {
  const { app, database } = createTestApp()
  assert.equal((await app.request('/api/admin/site-access')).status, 401)

  const headers = await adminHeaders()
  const first = await app.request('/api/admin/site-access/ip-rules/current', {
    method: 'POST', headers,
  })
  assert.equal(first.status, 200)
  const firstBody = await first.json() as SiteAccessSnapshot
  assert.equal(firstBody.currentIp, CURRENT_IP)
  assert.equal(firstBody.allowedIps.length, 1)

  const again = await app.request('/api/admin/site-access/ip-rules/current', {
    method: 'POST', headers,
  })
  assert.equal((await again.json() as SiteAccessSnapshot).allowedIps.length, 1)

  const id = firstBody.allowedIps[0].id
  const removed = await app.request(`/api/admin/site-access/ip-rules/${id}`, {
    method: 'DELETE', headers,
  })
  assert.equal(removed.status, 409)
  assert.deepEqual(await removed.json(), { error: 'current_ip_protected' })
  database.close()
})

test('规则创建严格校验、地址唯一且备注会归一化', async () => {
  const { app, database } = createTestApp()
  const headers = await adminHeaders()

  const invalid = await app.request('/api/admin/site-access/ip-rules', {
    method: 'POST', headers,
    body: JSON.stringify({ address: '203.0.113.0/24', rule: 'deny' }),
  })
  assert.equal(invalid.status, 400)

  const unexpectedConfirmation = await app.request('/api/admin/site-access/ip-rules', {
    method: 'POST', headers,
    body: JSON.stringify({ address: CURRENT_IP, rule: 'deny', confirmCurrentIp: true }),
  })
  assert.equal(unexpectedConfirmation.status, 400)
  assert.equal(
    (await unexpectedConfirmation.json() as { error: string }).error,
    'invalid_payload',
  )

  const reserved = await app.request('/api/admin/site-access/ip-rules', {
    method: 'POST', headers,
    body: JSON.stringify({ address: '127.0.0.1', rule: 'deny' }),
  })
  assert.equal(reserved.status, 409)
  assert.deepEqual(await reserved.json(), { error: 'reserved_ip' })

  const created = await app.request('/api/admin/site-access/ip-rules', {
    method: 'POST', headers,
    body: JSON.stringify({ address: '2001:0db8::1', rule: 'deny', note: '  测试  ' }),
  })
  assert.equal(created.status, 201)
  const createdBody = await created.json() as SiteAccessSnapshot
  assert.equal(createdBody.blockedIps[0].address, '2001:db8::1')
  assert.equal(createdBody.blockedIps[0].note, '测试')

  const duplicate = await app.request('/api/admin/site-access/ip-rules', {
    method: 'POST', headers,
    body: JSON.stringify({ address: '2001:db8:0:0:0:0:0:1', rule: 'allow' }),
  })
  assert.equal(duplicate.status, 409)
  assert.deepEqual(await duplicate.json(), { error: 'duplicate_ip' })
  database.close()
})

test('当前 IP 拉黑需要确认，恢复后才能开启白名单限制', async () => {
  const { app, database } = createTestApp()
  const headers = await adminHeaders()
  const ensured = await app.request('/api/admin/site-access/ip-rules/current', {
    method: 'POST', headers,
  })
  const currentId = (await ensured.json() as SiteAccessSnapshot).allowedIps[0].id

  const unconfirmed = await app.request(`/api/admin/site-access/ip-rules/${currentId}`, {
    method: 'PATCH', headers, body: JSON.stringify({ rule: 'deny' }),
  })
  assert.equal(unconfirmed.status, 409)

  const blocked = await app.request(`/api/admin/site-access/ip-rules/${currentId}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ rule: 'deny', confirmCurrentIp: true }),
  })
  assert.equal((await blocked.json() as SiteAccessSnapshot).blockedIps[0].address, CURRENT_IP)

  const stayedBlocked = await app.request('/api/admin/site-access/ip-rules/current', {
    method: 'POST', headers,
  })
  assert.equal((await stayedBlocked.json() as SiteAccessSnapshot).blockedIps[0].address, CURRENT_IP)

  const cannotDeleteBlockedCurrent = await app.request(
    `/api/admin/site-access/ip-rules/${currentId}`,
    { method: 'DELETE', headers },
  )
  assert.equal(cannotDeleteBlockedCurrent.status, 409)
  assert.deepEqual(await cannotDeleteBlockedCurrent.json(), { error: 'current_ip_protected' })

  const cannotEnable = await app.request('/api/admin/site-access/mode', {
    method: 'PUT', headers, body: JSON.stringify({ enabled: true }),
  })
  assert.equal(cannotEnable.status, 409)
  assert.deepEqual(await cannotEnable.json(), { error: 'current_ip_not_allowed' })

  await app.request(`/api/admin/site-access/ip-rules/${currentId}`, {
    method: 'PATCH', headers, body: JSON.stringify({ rule: 'allow' }),
  })
  const enabled = await app.request('/api/admin/site-access/mode', {
    method: 'PUT', headers, body: JSON.stringify({ enabled: true }),
  })
  assert.equal(enabled.status, 200)
  assert.equal((await enabled.json() as SiteAccessSnapshot).enabled, true)
  database.close()
})

test('黑名单始终优先，白名单模式只额外拒绝未配置地址', async () => {
  const { app, database } = createTestApp()
  const headers = await adminHeaders()
  await app.request('/api/admin/site-access/ip-rules/current', { method: 'POST', headers })
  await app.request('/api/admin/site-access/ip-rules', {
    method: 'POST', headers,
    body: JSON.stringify({ address: OTHER_IP, rule: 'deny' }),
  })

  const check = (ip: string) => app.request('/internal/site-access-check', {
    headers: { 'X-Real-IP': ip },
  })
  const deniedWhileOpen = await check(OTHER_IP)
  assert.equal(deniedWhileOpen.status, 403)
  assert.equal(deniedWhileOpen.headers.get('Cache-Control'), 'no-store')
  assert.equal((await check('192.0.2.55')).status, 204)
  assert.equal((await app.request('/internal/site-access-check')).status, 403)
  assert.equal((await app.request('/internal/site-access-check', {
    headers: { 'X-Forwarded-For': CURRENT_IP },
  })).status, 403)
  assert.equal((await check('127.0.0.1')).status, 204)

  await app.request('/api/admin/site-access/mode', {
    method: 'PUT', headers, body: JSON.stringify({ enabled: true }),
  })
  assert.equal((await check(CURRENT_IP)).status, 204)
  assert.equal((await check('192.0.2.55')).status, 403)
  assert.equal((await check(OTHER_IP)).status, 403)
  database.close()
})

test('内部判定存储异常时返回 500 供 nginx fail-closed', async () => {
  const { database, store } = createTestApp()
  const app = new Hono()
  app.route('/internal/site-access-check', createInternalSiteAccessRouter({
    ...store,
    isAllowed: () => { throw new Error('database unavailable') },
  }))
  const response = await app.request('/internal/site-access-check', {
    headers: { 'X-Real-IP': CURRENT_IP },
  })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'site_access_unavailable' })
  database.close()
})

test('非当前规则可原子移动、编辑和删除', async () => {
  const { app, database } = createTestApp()
  const headers = await adminHeaders()
  const created = await app.request('/api/admin/site-access/ip-rules', {
    method: 'POST', headers,
    body: JSON.stringify({ address: OTHER_IP, rule: 'allow' }),
  })
  const id = (await created.json() as SiteAccessSnapshot).allowedIps[0].id

  const moved = await app.request(`/api/admin/site-access/ip-rules/${id}`, {
    method: 'PATCH', headers,
    body: JSON.stringify({ rule: 'deny', note: '封禁来源' }),
  })
  const movedBody = await moved.json() as SiteAccessSnapshot
  assert.equal(movedBody.allowedIps.length, 0)
  assert.equal(movedBody.blockedIps[0].note, '封禁来源')

  const removed = await app.request(`/api/admin/site-access/ip-rules/${id}`, {
    method: 'DELETE', headers,
  })
  assert.equal((await removed.json() as SiteAccessSnapshot).blockedIps.length, 0)
  database.close()
})
