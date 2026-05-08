import type { Context, Next } from 'hono'

// 每 IP 每分钟请求上限
const WINDOW_MS = 60_000
const MAX_REQ_PER_WINDOW = 120

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

function getClientIp(c: Context): string {
  const xff = c.req.header('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  const xri = c.req.header('x-real-ip')
  if (xri) return xri
  return 'unknown'
}

export async function rateLimit(c: Context, next: Next) {
  const ip = getClientIp(c)
  const now = Date.now()
  let b = buckets.get(ip)
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS }
    buckets.set(ip, b)
  }
  b.count++
  if (b.count > MAX_REQ_PER_WINDOW) {
    return c.json({ error: 'rate_limited' }, 429)
  }
  await next()
}

setInterval(() => {
  const now = Date.now()
  for (const [ip, b] of buckets) if (now > b.resetAt) buckets.delete(ip)
}, WINDOW_MS).unref?.()

export { getClientIp }
