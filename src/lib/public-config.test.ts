import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchHomepageGuidanceVisible } from './public-config'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

test('公开配置明确开启或关闭时返回对应状态', async () => {
  for (const enabled of [true, false]) {
    const result = await fetchHomepageGuidanceVisible({
      fetchImpl: async () => jsonResponse({
        homepageGuidanceVisible: enabled,
      }),
    })
    assert.equal(result, enabled)
  }
})

test('公开配置 404 时回退为显示', async () => {
  const result = await fetchHomepageGuidanceVisible({
    fetchImpl: async () => jsonResponse({ error: 'not_found' }, 404),
  })
  assert.equal(result, true)
})

test('公开配置响应非法时回退为显示', async () => {
  for (const body of [
    {},
    { homepageGuidanceVisible: 'false' },
    null,
  ]) {
    const result = await fetchHomepageGuidanceVisible({
      fetchImpl: async () => jsonResponse(body),
    })
    assert.equal(result, true)
  }

  const invalidJson = await fetchHomepageGuidanceVisible({
    fetchImpl: async () => new Response('{', { status: 200 }),
  })
  assert.equal(invalidJson, true)
})

test('公开配置超时时中止请求并回退为显示', async () => {
  let aborted = false
  const result = await fetchHomepageGuidanceVisible({
    timeoutMs: 10,
    fetchImpl: (_input, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            aborted = true
            reject(new Error('aborted'))
          },
          { once: true },
        )
      }),
  })

  assert.equal(aborted, true)
  assert.equal(result, true)
})
