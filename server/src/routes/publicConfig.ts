import { Hono } from 'hono'
import {
  featureFlagStore,
  type FeatureFlagStore,
} from '../lib/featureFlags.js'
import { resolveHomepageAnnouncementSiteHost } from '../lib/siteHost.js'
import { getTrustedProxyClientIp } from '../middleware/cloudflareOrigin.js'

export function createPublicConfigRouter(
  store: FeatureFlagStore = featureFlagStore,
) {
  const router = new Hono()

  router.get('/', (c) => {
    const { enabled } = store.getHomepageGuidance()
    const siteHost = resolveHomepageAnnouncementSiteHost({
      requestHost: c.req.header('host'),
      forwardedHost: c.req.header('x-forwarded-host'),
      trustForwardedHost: getTrustedProxyClientIp(c) !== null,
      allowLocalFallback: process.env.NODE_ENV !== 'production',
    })
    const announcement = siteHost
      ? store.getHomepageAnnouncement(siteHost)
      : null
    c.header('Cache-Control', 'no-store')
    return c.json({
      homepageGuidanceVisible: enabled,
      homepageAnnouncement:
        announcement?.enabled && announcement.updatedAt !== null
          ? {
              siteHost: announcement.siteHost,
              message: announcement.message,
              action:
                announcement.actionLabel && announcement.actionUrl
                  ? {
                      label: announcement.actionLabel,
                      href: announcement.actionUrl,
                    }
                  : null,
              updatedAt: announcement.updatedAt,
            }
          : null,
    })
  })

  return router
}

export default createPublicConfigRouter()
