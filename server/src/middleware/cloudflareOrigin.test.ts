import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { Hono } from 'hono'
import { getTrustedClientIp } from '../routes/siteAccessShared.js'
import {
  cloudflareOriginGate,
  DEFAULT_CLOUDFLARE_ORIGIN_HOST,
} from './cloudflareOrigin.js'
import { getClientIp } from './ratelimit.js'

const previousHost = process.env.CLOUDFLARE_ORIGIN_HOST
const previousToken = process.env.CLOUDFLARE_ORIGIN_TOKEN

before(() => {
  process.env.CLOUDFLARE_ORIGIN_HOST = DEFAULT_CLOUDFLARE_ORIGIN_HOST
  process.env.CLOUDFLARE_ORIGIN_TOKEN = 'test-origin-token-at-least-32-characters'
})

after(() => {
  if (previousHost === undefined) delete process.env.CLOUDFLARE_ORIGIN_HOST
  else process.env.CLOUDFLARE_ORIGIN_HOST = previousHost
  if (previousToken === undefined) delete process.env.CLOUDFLARE_ORIGIN_TOKEN
  else process.env.CLOUDFLARE_ORIGIN_TOKEN = previousToken
})

function createApp() {
  const app = new Hono()
  app.use('*', cloudflareOriginGate)
  app.get('/api/echo', (c) => c.json({
    rateLimitIp: getClientIp(c),
    siteAccessIp: getTrustedClientIp(c),
  }))
  return app
}

test('非 Tunnel Host 保持原有请求链路', async () => {
  const response = await createApp().request('https://sleepno.cn/api/echo', {
    headers: { 'X-Real-IP': '192.0.2.10' },
  })
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    rateLimitIp: '192.0.2.10',
    siteAccessIp: '192.0.2.10',
  })
})

test('Tunnel Host 缺少或使用错误 Token 时拒绝', async () => {
  const app = createApp()
  const missing = await app.request(`https://${DEFAULT_CLOUDFLARE_ORIGIN_HOST}/api/echo`)
  assert.equal(missing.status, 403)
  assert.equal(missing.headers.get('cache-control'), 'no-store')

  const wrong = await app.request(`https://${DEFAULT_CLOUDFLARE_ORIGIN_HOST}/api/echo`, {
    headers: {
      'X-Musiczh-Origin-Token': 'wrong',
      'X-Musiczh-Client-IP': '198.51.100.7',
    },
  })
  assert.equal(wrong.status, 403)
})

test('Tunnel Host 未配置合格生产密钥时 fail closed', async () => {
  process.env.CLOUDFLARE_ORIGIN_TOKEN = 'too-short'
  const response = await createApp().request(
    `https://${DEFAULT_CLOUDFLARE_ORIGIN_HOST}/api/echo`,
  )
  assert.equal(response.status, 503)
  process.env.CLOUDFLARE_ORIGIN_TOKEN = 'test-origin-token-at-least-32-characters'
})

test('可信代理 IP 覆盖客户端伪造的转发头', async () => {
  const response = await createApp().request(
    `https://${DEFAULT_CLOUDFLARE_ORIGIN_HOST}/api/echo`,
    {
      headers: {
        'X-Musiczh-Origin-Token': 'test-origin-token-at-least-32-characters',
        'X-Musiczh-Client-IP': '2001:db8::7',
        'X-Forwarded-For': '203.0.113.99',
        'X-Real-IP': '203.0.113.98',
      },
    },
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    rateLimitIp: '2001:db8::7',
    siteAccessIp: '2001:db8::7',
  })
})

test('可信代理必须提供合法客户端 IP', async () => {
  const response = await createApp().request(
    `https://${DEFAULT_CLOUDFLARE_ORIGIN_HOST}/api/echo`,
    {
      headers: {
        'X-Musiczh-Origin-Token': 'test-origin-token-at-least-32-characters',
        'X-Musiczh-Client-IP': 'not-an-ip',
      },
    },
  )
  assert.equal(response.status, 400)
})
