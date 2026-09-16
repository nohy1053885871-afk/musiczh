import { Hono } from 'hono'
import {
  isLoopbackIp,
  siteAccessStore,
  type SiteAccessStore,
} from '../lib/siteAccess.js'
import {
  featureFlagStore,
  type FeatureFlagStore,
} from '../lib/featureFlags.js'
import { getTrustedClientIp } from './siteAccessShared.js'

export const LEGACY_DOMAIN_REDIRECT_ORIGIN = 'https://shiyinmp3.com'

const REDIRECT_EXACT_PATHS = new Set([
  '/.deploy-manifest.json',
  '/favicon.svg',
  '/icons.svg',
  '/kgm-v2-mask.bin',
  '/restricted.html',
  '/robots.txt',
])

const REDIRECT_EXEMPT_PREFIXES = [
  '/.well-known',
  '/admin',
  '/api',
  '/assets',
  '/downloads',
  '/libav',
  '/licenses',
] as const

function pathMatchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function shouldRedirectLegacyDomainRequest(
  method: string | undefined,
  originalUri: string | undefined,
): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false
  if (!originalUri?.startsWith('/') || originalUri.startsWith('//')) {
    return false
  }

  let pathname: string
  try {
    pathname = new URL(originalUri, 'https://sleepno.cn').pathname
  } catch {
    return false
  }

  if (REDIRECT_EXACT_PATHS.has(pathname)) return false
  return !REDIRECT_EXEMPT_PREFIXES.some((prefix) =>
    pathMatchesPrefix(pathname, prefix),
  )
}

export function createInternalSiteAccessRouter(
  store: SiteAccessStore = siteAccessStore,
  flags: Pick<FeatureFlagStore, 'getLegacyDomainRedirect'> = featureFlagStore,
) {
  const router = new Hono()
  router.get('/', (c) => {
    c.header('Cache-Control', 'no-store')
    try {
      const clientIp = getTrustedClientIp(c)
      const isLoopback = clientIp !== null && isLoopbackIp(clientIp)
      const shouldRedirect = !isLoopback && shouldRedirectLegacyDomainRequest(
        c.req.header('x-original-method'),
        c.req.header('x-original-uri'),
      )
      if (shouldRedirect && flags.getLegacyDomainRedirect().enabled) {
        return c.redirect(LEGACY_DOMAIN_REDIRECT_ORIGIN, 307)
      }

      const allowed = store.isAllowed(clientIp)
      return allowed ? c.body(null, 204) : c.json({ error: 'access_restricted' }, 403)
    } catch {
      return c.json({ error: 'site_access_unavailable' }, 500)
    }
  })
  return router
}

export default createInternalSiteAccessRouter()
