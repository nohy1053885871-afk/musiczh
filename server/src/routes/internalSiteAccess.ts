import { Hono } from 'hono'
import {
  siteAccessStore,
  type SiteAccessStore,
} from '../lib/siteAccess.js'
import { getTrustedClientIp } from './siteAccessShared.js'

export function createInternalSiteAccessRouter(
  store: SiteAccessStore = siteAccessStore,
) {
  const router = new Hono()
  router.get('/', (c) => {
    c.header('Cache-Control', 'no-store')
    try {
      const allowed = store.isAllowed(getTrustedClientIp(c))
      return allowed ? c.body(null, 204) : c.json({ error: 'access_restricted' }, 403)
    } catch {
      return c.json({ error: 'site_access_unavailable' }, 500)
    }
  })
  return router
}

export default createInternalSiteAccessRouter()
