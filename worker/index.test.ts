import assert from 'node:assert/strict'
import test from 'node:test'
import { handleRequest, type WorkerEnv } from './index.js'

const ORIGIN_TOKEN = 'worker-test-token-at-least-32-characters'

function createEnv(assetResponse = new Response('asset')): WorkerEnv {
  return {
    ORIGIN_BASE_URL: 'https://origin.shiyinmp3.com',
    ORIGIN_PROXY_TOKEN: ORIGIN_TOKEN,
    ASSETS: { fetch: async () => assetResponse },
  }
}

test('非 API 请求委托静态资产 binding', async () => {
  const response = await handleRequest(
    new Request('https://shiyinmp3.com/admin/'),
    createEnv(new Response('admin asset', { status: 200 })),
  )
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'admin asset')
})

test('API 保留路径、查询、方法、请求体和 Cookie', async () => {
  const requests: Request[] = []
  const incoming = new Request('https://shiyinmp3.com/api/admin/login?source=test', {
    method: 'POST',
    headers: {
      'CF-Connecting-IP': '198.51.100.8',
      'Content-Type': 'application/json',
      Cookie: 'admin_token=old',
    },
    body: JSON.stringify({ username: 'admin', password: 'secret' }),
  })
  const response = await handleRequest(incoming, createEnv(), async (request) => {
    requests.push(request)
    return Response.json({ ok: true }, {
      headers: { 'Set-Cookie': 'admin_token=new; HttpOnly; Secure; SameSite=Strict; Path=/' },
    })
  })

  const proxied = requests[0]
  assert.ok(proxied)
  assert.equal(proxied.url, 'https://origin.shiyinmp3.com/api/admin/login?source=test')
  assert.equal(proxied.method, 'POST')
  assert.equal(proxied.headers.get('cookie'), 'admin_token=old')
  assert.equal(proxied.headers.get('x-musiczh-origin-token'), ORIGIN_TOKEN)
  assert.equal(proxied.headers.get('x-musiczh-client-ip'), '198.51.100.8')
  assert.deepEqual(await proxied.json(), { username: 'admin', password: 'secret' })
  assert.match(response.headers.get('set-cookie') ?? '', /admin_token=new/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('Worker 清除浏览器伪造的源站与转发头', async () => {
  const requests: Request[] = []
  const incoming = new Request('https://shiyinmp3.com/api/config', {
    headers: {
      'CF-Connecting-IP': '203.0.113.7',
      Origin: 'https://evil.example',
      'X-Forwarded-For': '192.0.2.99',
      'X-Real-IP': '192.0.2.98',
      'X-Musiczh-Client-IP': '192.0.2.97',
      'X-Musiczh-Origin-Token': 'forged',
    },
  })
  await handleRequest(incoming, createEnv(), async (request) => {
    requests.push(request)
    return Response.json({ enabled: true })
  })

  const proxied = requests[0]
  assert.ok(proxied)
  assert.equal(proxied.headers.get('origin'), null)
  assert.equal(proxied.headers.get('x-forwarded-for'), null)
  assert.equal(proxied.headers.get('x-real-ip'), null)
  assert.equal(proxied.headers.get('x-musiczh-client-ip'), '203.0.113.7')
  assert.equal(proxied.headers.get('x-musiczh-origin-token'), ORIGIN_TOKEN)
  assert.equal(proxied.headers.get('x-forwarded-host'), 'shiyinmp3.com')
})

test('源站状态码和响应体透传，但强制禁止缓存', async () => {
  const response = await handleRequest(
    new Request('https://shiyinmp3.com/api/admin/me', {
      headers: { 'CF-Connecting-IP': '198.51.100.9' },
    }),
    createEnv(),
    async () => Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'public, max-age=600' } },
    ),
  )
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), { error: 'unauthorized' })
  assert.equal(response.headers.get('cache-control'), 'no-store')
})

test('缺少 Worker Secret 时 fail closed', async () => {
  const env = createEnv()
  env.ORIGIN_PROXY_TOKEN = ''
  const response = await handleRequest(
    new Request('https://shiyinmp3.com/api/health', {
      headers: { 'CF-Connecting-IP': '198.51.100.10' },
    }),
    env,
  )
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { error: 'api_proxy_unavailable' })
})

test('源站异常和超时分别返回 502 与 504', async () => {
  const request = () => new Request('https://shiyinmp3.com/api/health', {
    headers: { 'CF-Connecting-IP': '198.51.100.11' },
  })
  const unavailable = await handleRequest(request(), createEnv(), async () => {
    throw new Error('offline')
  })
  assert.equal(unavailable.status, 502)

  const timeout = await handleRequest(request(), createEnv(), async () => {
    throw new DOMException('timeout', 'TimeoutError')
  })
  assert.equal(timeout.status, 504)
})
