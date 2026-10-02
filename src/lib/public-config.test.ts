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
    qqInstallerUrl: null,
    footerHoverCard: null,
  })
})

test('旧 API 缺少公告字段时保持现有指引并隐藏公告', async () => {
  const result = await fetchPublicConfig({
    fetchImpl: async () => jsonResponse({ homepageGuidanceVisible: false }),
  })
  assert.deepEqual(result, {
    homepageGuidanceVisible: false,
    homepageAnnouncement: null,
    qqInstallerUrl: null,
    footerHoverCard: null,
  })
})

test('公开配置只接受完整 HTTPS QQ 安装包跳转链接', async () => {
  const url = 'https://pan.example.com/s/qq-v19-51'
  const valid = await fetchPublicConfig({
    fetchImpl: async () => jsonResponse({
      homepageGuidanceVisible: true,
      qqInstallerUrl: url,
    }),
  })
  assert.equal(valid.qqInstallerUrl, url)

  for (const qqInstallerUrl of [
    'http://pan.example.com/file',
    '//pan.example.com/file',
    'javascript:alert(1)',
    '/downloads/file.zip',
    123,
  ]) {
    const result = await fetchPublicConfig({
      fetchImpl: async () => jsonResponse({
        homepageGuidanceVisible: true,
        qqInstallerUrl,
      }),
    })
    assert.equal(result.qqInstallerUrl, null)
  }
})

test('公开配置解析完整的底部悬浮图配置', async () => {
  const footerHoverCard = {
    label: '关注拾音',
    imageUrl: '/api/config/footer-hover-card/image?v=123',
    imageWidth: 800,
    imageHeight: 1000,
    updatedAt: 123,
  }
  const result = await fetchPublicConfig({
    fetchImpl: async () => jsonResponse({
      homepageGuidanceVisible: true,
      footerHoverCard,
    }),
  })
  assert.deepEqual(result.footerHoverCard, footerHoverCard)
})

test('公开配置丢弃不完整或危险的底部悬浮图配置', async () => {
  for (const footerHoverCard of [
    { label: '一二三四五六七八九十一', imageUrl: '/api/config/footer-hover-card/image?v=1', imageWidth: 1, imageHeight: 1, updatedAt: 1 },
    { label: '关注拾音', imageUrl: '//evil.example/image.png', imageWidth: 1, imageHeight: 1, updatedAt: 1 },
    { label: '关注拾音', imageUrl: '/api/config/footer-hover-card/image?\\evil', imageWidth: 1, imageHeight: 1, updatedAt: 1 },
    { label: '关注拾音', imageUrl: '/api/config/footer-hover-card/image?v=1', imageWidth: 0, imageHeight: 1, updatedAt: 1 },
  ]) {
    const result = await fetchPublicConfig({
      fetchImpl: async () => jsonResponse({
        homepageGuidanceVisible: true,
        footerHoverCard,
      }),
    })
    assert.equal(result.footerHoverCard, null)
  }
})

test('公开配置接受 10 字文案和任意正整数图片宽高', async () => {
  const footerHoverCard = {
    label: '一二三四五六七八九十',
    imageUrl: '/api/config/footer-hover-card/image?v=999',
    imageWidth: 12000,
    imageHeight: 48000,
    updatedAt: 999,
  }
  const result = await fetchPublicConfig({
    fetchImpl: async () => jsonResponse({
      homepageGuidanceVisible: true,
      footerHoverCard,
    }),
  })
  assert.deepEqual(result.footerHoverCard, footerHoverCard)
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
    qqInstallerUrl: null,
    footerHoverCard: null,
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
