import { Hono } from 'hono'
import {
  featureFlagStore,
  type FeatureFlagStore,
} from '../lib/featureFlags.js'

export function createPublicConfigRouter(
  store: FeatureFlagStore = featureFlagStore,
) {
  const router = new Hono()

  router.get('/', (c) => {
    const { enabled } = store.getHomepageGuidance()
    c.header('Cache-Control', 'no-store')
    return c.json({ homepageGuidanceVisible: enabled })
  })

  return router
}

export default createPublicConfigRouter()
