import { createHash, timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import type { Context, Next } from 'hono'

export const DEFAULT_CLOUDFLARE_ORIGIN_HOST = 'origin.shiyinmp3.com'

type TrustedProxyVariables = {
  trustedProxyClientIp: string
}

type TrustedProxyContext = Context<{
  Variables: TrustedProxyVariables
}>

function normalizeHost(raw: string): string {
  return raw.trim().toLowerCase().replace(/:\d+$/, '')
}

function secureEqual(actual: string, expected: string): boolean {
  const actualHash = createHash('sha256').update(actual).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(actualHash, expectedHash)
}

export function getTrustedProxyClientIp(c: Context): string | null {
  return (c as TrustedProxyContext).get('trustedProxyClientIp') ?? null
}

export async function cloudflareOriginGate(c: Context, next: Next) {
  const expectedHost = normalizeHost(
    process.env.CLOUDFLARE_ORIGIN_HOST ?? DEFAULT_CLOUDFLARE_ORIGIN_HOST,
  )
  const requestHost = normalizeHost(c.req.header('host') ?? new URL(c.req.url).host)

  if (requestHost !== expectedHost) {
    await next()
    return
  }

  c.header('Cache-Control', 'no-store')
  const expectedToken = process.env.CLOUDFLARE_ORIGIN_TOKEN ?? ''
  if (expectedToken.length < 32) {
    return c.json({ error: 'origin_proxy_unavailable' }, 503)
  }

  const suppliedToken = c.req.header('x-musiczh-origin-token') ?? ''
  if (!secureEqual(suppliedToken, expectedToken)) {
    return c.json({ error: 'origin_proxy_unauthorized' }, 403)
  }

  const clientIp = c.req.header('x-musiczh-client-ip')?.trim() ?? ''
  if (!isIP(clientIp)) {
    return c.json({ error: 'invalid_proxy_client_ip' }, 400)
  }

  ;(c as TrustedProxyContext).set('trustedProxyClientIp', clientIp)
  await next()
}
