import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import { MAX_COVER_BYTES } from './cover-policy'
import { fetchRemoteCover, resolveRemoteCoverUrl } from './cover'

const originalFetch = globalThis.fetch
const PNG_MAGIC = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10])

afterEach(() => {
  globalThis.fetch = originalFetch
})

test('按 CDN 分流缩略参数，未知 CDN 不猜参数', () => {
  assert.equal(
    resolveRemoteCoverUrl('http://p4.music.126.net/a/b.jpg?param=1000y1000'),
    'https://p4.music.126.net/a/b.jpg?imageView&thumbnail=500y500',
  )
  assert.equal(
    resolveRemoteCoverUrl('https://imagev2.xmcdn.com/a/b.jpeg'),
    'https://imagev2.xmcdn.com/a/b.jpeg!op_type=3&columns=500&rows=500',
  )
  assert.equal(
    resolveRemoteCoverUrl('https://covers.example.com/a.jpg?width=900'),
    'https://covers.example.com/a.jpg?width=900',
  )
})

test('16 MiB 精确边界允许，图片 magic 优先于错误 Content-Type', async () => {
  const bytes = imageBytes(MAX_COVER_BYTES)
  globalThis.fetch = async () => new Response(ownedBuffer(bytes), {
    status: 200,
    headers: {
      'content-length': String(bytes.length),
      'content-type': 'application/octet-stream',
    },
  })
  const result = await fetchRemoteCover('https://boundary.example.com/exact')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.cover.size, MAX_COVER_BYTES)
    assert.equal(result.cover.type, 'image/png')
  }
})

test('Content-Length 对 16 MiB + 1 byte 预拒绝', async () => {
  globalThis.fetch = async () => new Response(PNG_MAGIC, {
    status: 200,
    headers: { 'content-length': String(MAX_COVER_BYTES + 1) },
  })
  const result = await fetchRemoteCover('https://boundary.example.com/declared-too-large')
  assert.deepEqual(result, { ok: false, errorCode: 'COVER_TOO_LARGE' })
})

test('没有 Content-Length 时流式累计，超过 16 MiB 立即取消', async () => {
  let cancelled = false
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(imageBytes(8 * 1024 * 1024))
      controller.enqueue(new Uint8Array(8 * 1024 * 1024))
      controller.enqueue(Uint8Array.of(1))
    },
    cancel() {
      cancelled = true
    },
  })
  globalThis.fetch = async () => new Response(stream, { status: 200 })
  const result = await fetchRemoteCover('https://boundary.example.com/stream-too-large')
  assert.deepEqual(result, { ok: false, errorCode: 'COVER_TOO_LARGE' })
  assert.equal(cancelled, true)
})

test('同一远程 URL 的进行中请求只发起一次', async () => {
  let calls = 0
  globalThis.fetch = async () => {
    calls++
    await new Promise((resolve) => setTimeout(resolve, 20))
    return new Response(ownedBuffer(imageBytes(12)), { status: 200 })
  }
  const url = 'https://dedupe.example.com/cover.png'
  const [first, second] = await Promise.all([
    fetchRemoteCover(url),
    fetchRemoteCover(url),
  ])
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.equal(calls, 1)
})

test('请求超时返回 COVER_TIMEOUT', async () => {
  globalThis.fetch = (_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  })
  const result = await fetchRemoteCover('https://timeout.example.com/cover', 20)
  assert.deepEqual(result, { ok: false, errorCode: 'COVER_TIMEOUT' })
})

function imageBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size)
  bytes.set(PNG_MAGIC)
  return bytes
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}
