import { Hono } from 'hono'
import {
  featureFlagStore,
  type FeatureFlagStore,
} from '../lib/featureFlags.js'
import {
  footerHoverCardStore,
  type FooterHoverCardStore,
} from '../lib/footerHoverCard.js'
import { resolveHomepageAnnouncementSiteHost } from '../lib/siteHost.js'
import { getTrustedProxyClientIp } from '../middleware/cloudflareOrigin.js'

export function createPublicConfigRouter(
  store: FeatureFlagStore = featureFlagStore,
  footerStore: FooterHoverCardStore = footerHoverCardStore,
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
    const qqInstallerLink = siteHost
      ? store.getQqInstallerLink(siteHost)
      : null
    const footerHoverCard = footerStore.getPublicConfig()
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
      qqInstallerUrl: qqInstallerLink?.url ?? null,
      footerHoverCard: footerHoverCard
        ? {
            label: footerHoverCard.label,
            imageUrl:
              `/api/config/footer-hover-card/image?v=${footerHoverCard.image.updatedAt}`,
            imageWidth: footerHoverCard.image.width,
            imageHeight: footerHoverCard.image.height,
            updatedAt: footerHoverCard.updatedAt,
          }
        : null,
    })
  })

  router.get('/footer-hover-card/image', (c) => {
    if (!footerStore.getPublicConfig()) {
      return c.json({ error: 'image_not_found' }, 404)
    }
    const image = footerStore.getImage()
    if (!image) return c.json({ error: 'image_not_found' }, 404)
    c.header('Cache-Control', 'no-store')
    c.header('Content-Type', image.mimeType)
    c.header('Content-Length', String(image.byteSize))
    c.header('Content-Disposition', 'inline')
    c.header('X-Content-Type-Options', 'nosniff')
    return c.body(new Uint8Array(image.data).buffer)
  })

  return router
}

export default createPublicConfigRouter()
