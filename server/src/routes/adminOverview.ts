import { Hono } from 'hono'
import { getOverviewBundle } from '../lib/overview/client.js'
import { requireAdmin } from '../middleware/auth.js'
import { parseTimeRange } from '../lib/timeRange.js'

const adminOverview = new Hono()
adminOverview.use('*', requireAdmin)

adminOverview.get('/overview-bundle', async (c) => {
  const { from, to, range } = parseTimeRange(c)
  const refresh = c.req.query('refresh') === '1'
  const fromQuery = c.req.query('from')
  const toQuery = c.req.query('to')
  const cacheKey = fromQuery || toQuery
    ? `custom:${from}:${to}`
    : `preset:${range}`
  try {
    const bundle = await getOverviewBundle(
      { from, to, range },
      { cacheKey, refresh },
    )
    const serializeStarted = performance.now()
    const body = JSON.stringify(bundle)
    console.log(JSON.stringify({
      type: 'overview_bundle_serialize', key: cacheKey,
      serialization_ms: Math.round(performance.now() - serializeStarted),
      response_bytes: Buffer.byteLength(body),
    }))
    return c.body(body, 200, { 'Content-Type': 'application/json; charset=UTF-8' })
  } catch (error) {
    console.error('[overview-bundle] failed', error)
    return c.json({ error: 'overview_bundle_failed' }, 503)
  }
})

export default adminOverview
