import { Hono } from 'hono'
import { z } from 'zod'
import {
  featureFlagStore,
  type FeatureFlagStore,
} from '../lib/featureFlags.js'
import { requireAdmin } from '../middleware/auth.js'

const UpdateHomepageGuidanceSchema = z
  .object({ enabled: z.boolean() })
  .strict()

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

  return router
}

export default createAdminFeatureFlagsRouter()
