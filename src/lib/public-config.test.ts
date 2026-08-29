import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fetchHomepageGuidanceVisible,
  fetchPublicConfig,
} from './public-config'

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

test('公开配置解析当前域名公告和可选行动点', async () => {
  const result = await fetchPublicConfig({
    fetchImpl: async () => jsonResponse({
      homepageGuidanceVisible: true,
      homepageAnnouncement: {
        siteHost: 'sleepno.cn',
        message: '维护公告',
        action: { label: '查看详情', href: '/notice' },
        updatedAt: 123,
      },
    }),
  })
  assert.deepEqual(result, {
    homepageGuidanceVisible: true,
    homepageAnnouncement: {
      siteHost: 'sleepno.cn',
      message: '维护公告',
      action: { label: '查看详情', href: '/notice' },
      updatedAt: 123,
    },
  })
})

test('旧 API 缺少公告字段时保持现有指引并隐藏公告', async () => {
  const result = await fetchPublicConfig({
    fetchImpl: async () => jsonResponse({ homepageGuidanceVisible: false }),
  })
  assert.deepEqual(result, {
    homepageGuidanceVisible: false,
    homepageAnnouncement: null,
  })
})

test('公开配置丢弃危险行动点但保留合法纯文本公告', async () => {
  const result = await fetchPublicConfig({
    fetchImpl: async () => jsonResponse({
      homepageGuidanceVisible: true,
      homepageAnnouncement: {
        siteHost: 'shiyinmp3.com',
        message: '安全公告',
        action: { label: '点击', href: 'javascript:alert(1)' },
        updatedAt: 456,
      },
    }),
  })
  assert.deepEqual(result.homepageAnnouncement, {
    siteHost: 'shiyinmp3.com',
    message: '安全公告',
    action: null,
    updatedAt: 456,
  })
})

test('公开配置拒绝会被浏览器归一化为外站的反斜杠路径', async () => {
  const result = await fetchPublicConfig({
    fetchImpl: async () => jsonResponse({
      homepageGuidanceVisible: true,
      homepageAnnouncement: {
        siteHost: 'sleepno.cn',
        message: '安全公告',
        action: { label: '点击', href: '/\\evil.example' },
        updatedAt: 457,
      },
    }),
  })
  assert.equal(result.homepageAnnouncement?.action, null)
})

test('公开配置 404 时回退为显示', async () => {
  const result = await fetchPublicConfig({
    fetchImpl: async () => jsonResponse({ error: 'not_found' }, 404),
  })
  assert.deepEqual(result, {
    homepageGuidanceVisible: true,
    homepageAnnouncement: null,
  })
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
