import type { Context } from 'hono'
import { normalizeIpAddress, SiteAccessError } from '../lib/siteAccess.js'

export function getTrustedClientIp(c: Context): string | null {
  const raw = c.req.header('x-real-ip')
  if (!raw) return null
  try {
    return normalizeIpAddress(raw)
  } catch {
    return null
  }
}

export function siteAccessErrorResponse(c: Context, error: unknown) {
  if (!(error instanceof SiteAccessError)) throw error
  const status = error.code === 'rule_not_found' ? 404 :
    error.code === 'invalid_ip' ? 400 : 409
  return c.json({ error: error.code }, status)
}
