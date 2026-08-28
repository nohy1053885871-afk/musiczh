import { Hono } from 'hono'
import {
  siteAccessStore,
  type SiteAccessStore,
} from '../lib/siteAccess.js'
import {
  RESTRICTED_PAGE_VIEW,
  siteAccessAnalyticsStore,
  type SiteAccessAnalyticsStore,
} from '../lib/siteAccessAnalytics.js'
import { getTrustedClientIp } from './siteAccessShared.js'

export function createPublicRestrictedPageRouter(
  configStore: SiteAccessStore = siteAccessStore,
  analyticsStore: SiteAccessAnalyticsStore = siteAccessAnalyticsStore,
) {
  const router = new Hono()

  router.use('*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    c.header('X-Robots-Tag', 'noindex, nofollow, noarchive')
    await next()
  })

  router.get('/', (c) => {
    analyticsStore.record(
      RESTRICTED_PAGE_VIEW,
      getTrustedClientIp(c),
      c.req.header('user-agent') ?? null,
    )
    const config = configStore.getRestrictedPageConfig()
    return c.json({
      message: config.message,
    })
  })

  return router
}

export default createPublicRestrictedPageRouter()
