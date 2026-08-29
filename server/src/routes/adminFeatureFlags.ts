import { Hono } from 'hono'
import { z } from 'zod'
import {
  featureFlagStore,
  isSafeHomepageAnnouncementUrl,
  type FeatureFlagStore,
} from '../lib/featureFlags.js'
import { isTrackedSiteHost } from '../lib/siteHost.js'
import { requireAdmin } from '../middleware/auth.js'

const UpdateHomepageGuidanceSchema = z
  .object({ enabled: z.boolean() })
  .strict()

const UpdateHomepageAnnouncementSchema = z
  .object({
    enabled: z.boolean(),
    message: z.string().max(300),
    actionLabel: z.string().max(5).nullable(),
    actionUrl: z.string().max(2048).nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const message = value.message.trim()
    const actionLabel = value.actionLabel?.trim() || null
    const actionUrl = value.actionUrl?.trim() || null
    if (value.enabled && !message) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['message'],
        message: 'message_required_when_enabled',
      })
    }
    if ((actionLabel === null) !== (actionUrl === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actionUrl'],
        message: 'action_label_and_url_must_be_paired',
      })
    }
    if (actionUrl && !isSafeHomepageAnnouncementUrl(actionUrl)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actionUrl'],
        message: 'invalid_action_url',
      })
    }
  })
  .transform((value) => ({
    enabled: value.enabled,
    message: value.message.trim(),
    actionLabel: value.actionLabel?.trim() || null,
    actionUrl: value.actionUrl?.trim() || null,
  }))

export function createAdminFeatureFlagsRouter(
  store: FeatureFlagStore = featureFlagStore,
) {
  const router = new Hono()
  router.use('*', requireAdmin)

  router.get('/homepage-guidance', (c) => {
    return c.json(store.getHomepageGuidance())
  })

  router.put('/homepage-guidance', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }

    const parsed = UpdateHomepageGuidanceSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_payload', detail: parsed.error.issues },
        400,
      )
    }

    return c.json(store.setHomepageGuidance(parsed.data.enabled))
  })

  router.get('/homepage-announcements', (c) => {
    return c.json({ announcements: store.listHomepageAnnouncements() })
  })

  router.put('/homepage-announcements/:siteHost', async (c) => {
    const siteHost = c.req.param('siteHost').trim().toLowerCase()
    if (!isTrackedSiteHost(siteHost)) {
      return c.json({ error: 'invalid_site_host' }, 400)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }
    const parsed = UpdateHomepageAnnouncementSchema.safeParse(body)
    if (!parsed.success) {
      return c.json(
        { error: 'invalid_payload', detail: parsed.error.issues },
        400,
      )
    }
    return c.json(store.setHomepageAnnouncement(siteHost, parsed.data))
  })

  return router
}

export default createAdminFeatureFlagsRouter()
