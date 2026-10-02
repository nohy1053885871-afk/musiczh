import assert from 'node:assert/strict'
import test from 'node:test'
import Database from 'better-sqlite3'
import { Hono } from 'hono'
import { createFeatureFlagStore } from '../lib/featureFlags.js'
import { createFooterHoverCardStore } from '../lib/footerHoverCard.js'
import { signAdminToken } from '../middleware/auth.js'
import { createAdminFooterHoverCardRouter } from './adminFooterHoverCard.js'
import { createPublicConfigRouter } from './publicConfig.js'

process.env.JWT_SECRET = 'footer-hover-test-secret-at-least-32-chars'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const MOTION_JPEG = Buffer.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x0b,
  0x08, 0x00, 0x02, 0x00, 0x03, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xd9,
  0x6d, 0x6f, 0x74, 0x69, 0x6f, 0x6e,
])

function createTestApp() {
  const database = new Database(':memory:')
  database.exec(`
    CREATE TABLE feature_flags (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE config_assets (
      key TEXT PRIMARY KEY,
      data BLOB NOT NULL,
      mime_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      sha256 TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `)
  const featureStore = createFeatureFlagStore(database)
  const footerStore = createFooterHoverCardStore(database)
  const app = new Hono()
  app.route('/api/config', createPublicConfigRouter(featureStore, footerStore))
  app.route(
    '/api/admin/footer-hover-card',
    createAdminFooterHoverCardRouter(footerStore),
  )
  return { app, database }
}

async function adminCookie(): Promise<string> {
  const token = await signAdminToken({ uid: 1, username: 'admin' })
  return `admin_token=${token}`
}

function saveForm(overrides: {
  enabled?: boolean
  label?: string
  removeImage?: boolean
  image?: Blob
  imageName?: string
} = {}) {
  const form = new FormData()
  form.set('enabled', String(overrides.enabled ?? true))
  form.set('label', overrides.label ?? '关注拾音')
  form.set('removeImage', String(overrides.removeImage ?? false))
  if (overrides.image) {
    form.set('image', overrides.image, overrides.imageName ?? 'footer.png')
  }
  return form
}

test('底部悬浮图管理接口要求登录，公开配置默认关闭', async () => {
  const { app, database } = createTestApp()
  assert.equal((await app.request('/api/admin/footer-hover-card')).status, 401)
  assert.equal((await app.request('/api/admin/footer-hover-card/image')).status, 401)

  const response = await app.request('/api/config')
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.equal((await response.json() as { footerHoverCard: unknown }).footerHoverCard, null)
  assert.equal(
    (await app.request('/api/config/footer-hover-card/image')).status,
    404,
  )
  database.close()
})

test('管理员可原子上传并启用，主站按需读取同一图片', async () => {
  const { app, database } = createTestApp()
  const cookie = await adminCookie()
  const save = await app.request('/api/admin/footer-hover-card', {
    method: 'PUT',
    headers: { Cookie: cookie },
    body: saveForm({
      image: new Blob([PNG_1X1], { type: 'image/png' }),
    }),
  })
  assert.equal(save.status, 200)
  const saved = await save.json() as {
    enabled: boolean
    label: string
    image: { url: string; width: number; height: number; sha256: string }
    updatedAt: number
  }
  assert.equal(saved.enabled, true)
  assert.equal(saved.label, '关注拾音')
  assert.equal(saved.image.width, 1)
  assert.equal(saved.image.height, 1)
  assert.match(saved.image.url, /^\/api\/admin\/footer-hover-card\/image\?v=\d+$/)
  assert.match(saved.image.sha256, /^[a-f0-9]{64}$/)

  const publicConfig = await app.request('/api/config')
  const publicBody = await publicConfig.json() as {
    footerHoverCard: {
      label: string
      imageUrl: string
      imageWidth: number
      imageHeight: number
      updatedAt: number
    }
  }
  assert.equal(publicBody.footerHoverCard.label, '关注拾音')
  assert.equal(publicBody.footerHoverCard.imageWidth, 1)
  assert.equal(publicBody.footerHoverCard.imageHeight, 1)
  assert.match(
    publicBody.footerHoverCard.imageUrl,
    /^\/api\/config\/footer-hover-card\/image\?v=\d+$/,
  )

  for (const path of [
    '/api/admin/footer-hover-card/image',
    '/api/config/footer-hover-card/image',
  ]) {
    const image = await app.request(path, {
      headers: path.includes('/admin/') ? { Cookie: cookie } : undefined,
    })
    assert.equal(image.status, 200)
    assert.equal(image.headers.get('Content-Type'), 'image/png')
    assert.equal(image.headers.get('Cache-Control'), 'no-store')
    assert.equal(image.headers.get('X-Content-Type-Options'), 'nosniff')
    assert.deepEqual(Buffer.from(await image.arrayBuffer()), PNG_1X1)
  }
  database.close()
})

test('接受在 JPEG 结束标记后附加动态照片数据的图片', async () => {
  const { app, database } = createTestApp()
  const cookie = await adminCookie()
  const save = await app.request('/api/admin/footer-hover-card', {
    method: 'PUT',
    headers: { Cookie: cookie },
    body: saveForm({
      image: new Blob([MOTION_JPEG], { type: 'image/jpeg' }),
      imageName: 'motion-photo.jpg',
    }),
  })

  assert.equal(save.status, 200)
  const body = await save.json() as {
    image: {
      mimeType: string
      byteSize: number
      width: number
      height: number
      sha256: string
      updatedAt: number
      url: string
    }
  }
  assert.equal(body.image.mimeType, 'image/jpeg')
  assert.equal(body.image.byteSize, MOTION_JPEG.byteLength)
  assert.equal(body.image.width, 3)
  assert.equal(body.image.height, 2)
  assert.match(body.image.sha256, /^[a-f0-9]{64}$/)
  assert.match(body.image.url, /^\/api\/admin\/footer-hover-card\/image\?v=\d+$/)
  database.close()
})

test('服务端拒绝非法图片、超长文案和启用时删除图片', async () => {
  const { app, database } = createTestApp()
  const cookie = await adminCookie()

  const invalidImage = await app.request('/api/admin/footer-hover-card', {
    method: 'PUT', headers: { Cookie: cookie },
    body: saveForm({ image: new Blob(['not-image'], { type: 'image/png' }) }),
  })
  assert.equal(invalidImage.status, 400)
  assert.deepEqual(await invalidImage.json(), { error: 'image_invalid' })

  const longLabel = await app.request('/api/admin/footer-hover-card', {
    method: 'PUT', headers: { Cookie: cookie },
    body: saveForm({ enabled: false, label: '一二三四五六七八九十一' }),
  })
  assert.equal(longLabel.status, 400)
  assert.deepEqual(await longLabel.json(), { error: 'label_invalid' })

  const initialSave = await app.request('/api/admin/footer-hover-card', {
    method: 'PUT', headers: { Cookie: cookie },
    body: saveForm({ image: new Blob([PNG_1X1], { type: 'image/png' }) }),
  })
  assert.equal(initialSave.status, 200)

  const invalidRemove = await app.request('/api/admin/footer-hover-card', {
    method: 'PUT', headers: { Cookie: cookie },
    body: saveForm({ removeImage: true }),
  })
  assert.equal(invalidRemove.status, 400)
  assert.deepEqual(await invalidRemove.json(), {
    error: 'image_required_when_enabled',
  })

  const stillAvailable = await app.request('/api/config/footer-hover-card/image')
  assert.equal(stillAvailable.status, 200)
  database.close()
})

test('关闭后可移除图片，公开配置与图片立即隐藏', async () => {
  const { app, database } = createTestApp()
  const cookie = await adminCookie()
  await app.request('/api/admin/footer-hover-card', {
    method: 'PUT', headers: { Cookie: cookie },
    body: saveForm({ image: new Blob([PNG_1X1], { type: 'image/png' }) }),
  })

  const remove = await app.request('/api/admin/footer-hover-card', {
    method: 'PUT', headers: { Cookie: cookie },
    body: saveForm({ enabled: false, removeImage: true }),
  })
  assert.equal(remove.status, 200)
  const removed = await remove.json() as { enabled: boolean; image: unknown }
  assert.equal(removed.enabled, false)
  assert.equal(removed.image, null)

  const publicConfig = await app.request('/api/config')
  assert.equal(
    (await publicConfig.json() as { footerHoverCard: unknown }).footerHoverCard,
    null,
  )
  assert.equal(
    (await app.request('/api/config/footer-hover-card/image')).status,
    404,
  )
  database.close()
})
