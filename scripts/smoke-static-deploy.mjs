import { createHash } from 'node:crypto'

const [baseUrlArg] = process.argv.slice(2)
if (!baseUrlArg) {
  throw new Error('用法: node scripts/smoke-static-deploy.mjs <base-url>')
}

const baseUrl = new URL(
  baseUrlArg.endsWith('/') ? baseUrlArg : `${baseUrlArg}/`,
)
const timeoutMs = 20_000

async function fetchBytes(url, required = true) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  })
  if (!response.ok) {
    if (!required && response.status === 404) return null
    throw new Error(`${url} 返回 HTTP ${response.status}`)
  }
  return new Uint8Array(await response.arrayBuffer())
}

const htmlBytes = await fetchBytes(baseUrl)
const html = new TextDecoder().decode(htmlBytes)
if (!/<html[\s>]/i.test(html) || !/<script[^>]+type=["']module["']/i.test(html)) {
  throw new Error(`${baseUrl} 不是有效的应用 HTML`)
}

const referenced = new Set()
for (const match of html.matchAll(/(?:src|href)=["']([^"'#?]+)["']/gi)) {
  const value = match[1]
  if (
    value.startsWith('data:') ||
    value.startsWith('mailto:') ||
    /^https?:\/\//i.test(value)
  ) {
    continue
  }
  referenced.add(new URL(value, baseUrl))
}
for (const url of referenced) await fetchBytes(url)

const manifestUrl = new URL('.deploy-manifest.json', baseUrl)
const manifestBytes = await fetchBytes(manifestUrl, false)
if (manifestBytes) {
  const manifest = JSON.parse(new TextDecoder().decode(manifestBytes))
  if (!manifest.version || !manifest.commit || !manifest.files) {
    throw new Error('部署清单缺少 version、commit 或 files')
  }
  for (const [name, expected] of Object.entries(manifest.files)) {
    const bytes = await fetchBytes(new URL(name, baseUrl))
    const actual = createHash('sha256').update(bytes).digest('hex')
    if (actual !== expected.sha256 || bytes.length !== expected.bytes) {
      throw new Error(`${name} 的线上资源哈希或大小与部署清单不一致`)
    }
  }
  console.log(
    `[smoke] ${manifest.target} v${manifest.version} ${manifest.commit.slice(0, 12)} · ${Object.keys(manifest.files).length} files OK`,
  )
} else {
  console.log(
    `[smoke] 未找到部署清单；HTML 与 ${referenced.size} 个首屏引用资源可达`,
  )
}
