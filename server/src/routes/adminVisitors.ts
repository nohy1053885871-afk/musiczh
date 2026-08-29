import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { parseUA } from '../lib/ua.js'
import { parseTimeRange } from '../lib/timeRange.js'
import { classifyChannel } from '../lib/channel.js'

const adminVisitors = new Hono()
adminVisitors.use('*', requireAdmin)

const ListQuery = z.object({
  q: z.string().max(64).optional(),
  browser: z.string().max(64).optional(),
  os: z.string().max(64).optional(),
  device_type: z.string().max(32).optional(),
  channel: z.string().max(32).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(10),
})

type RawRow = {
  visitor_id: string
  first_ts: number
  last_ts: number
  sessions: number
  events: number
  ua: string | null
  ip: string | null
  first_page: string | null
  referrer: string | null
}

adminVisitors.get('/', (c) => {
  const { from, to, range } = parseTimeRange(c)
  const parsed = ListQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
  if (!parsed.success) return c.json({ error: 'invalid_query', detail: parsed.error.issues }, 400)
  const { q, browser, os, device_type, channel, page, size } = parsed.data

  const rawRows = db
    .prepare(
      `WITH agg AS (
         SELECT visitor_id,
                MIN(ts) AS first_ts,
                MAX(ts) AS last_ts,
                COUNT(DISTINCT session_id) AS sessions,
                COUNT(*) AS events
           FROM events
          WHERE ts >= ? AND ts <= ?
          GROUP BY visitor_id
       ),
       last_evt AS (
         SELECT visitor_id, ua, ip,
                ROW_NUMBER() OVER (PARTITION BY visitor_id ORDER BY ts DESC) AS rn
           FROM events
          WHERE ts >= ? AND ts <= ?
       ),
       first_evt AS (
         SELECT visitor_id, page,
                ROW_NUMBER() OVER (PARTITION BY visitor_id ORDER BY ts ASC) AS rn
           FROM events
          WHERE ts >= ? AND ts <= ?
       ),
       first_pv AS (
         SELECT visitor_id, json_extract(props,'$.referrer') AS referrer,
                ROW_NUMBER() OVER (PARTITION BY visitor_id ORDER BY ts ASC) AS rn
           FROM events
          WHERE event = 'pageview' AND ts >= ? AND ts <= ?
       )
       SELECT a.visitor_id, a.first_ts, a.last_ts, a.sessions, a.events,
              l.ua, l.ip, f.page AS first_page, fp.referrer
         FROM agg a
         LEFT JOIN last_evt l  ON l.visitor_id  = a.visitor_id AND l.rn = 1
         LEFT JOIN first_evt f ON f.visitor_id  = a.visitor_id AND f.rn = 1
         LEFT JOIN first_pv fp ON fp.visitor_id = a.visitor_id AND fp.rn = 1
        ORDER BY a.last_ts DESC`,
    )
    .all(from, to, from, to, from, to, from, to) as RawRow[]

  let enriched = rawRows.map((r) => {
    const dev = parseUA(r.ua)
    return {
      visitor_id: r.visitor_id,
      first_ts: r.first_ts,
      last_ts: r.last_ts,
      sessions: r.sessions,
      events: r.events,
      ua: r.ua,
      ip: r.ip,
      first_page: r.first_page,
      referrer: r.referrer,
      browser: dev.browser,
      os: dev.os,
      device_type: dev.device_type,
      channel: classifyChannel(r.referrer),
    }
  })

  if (q) enriched = enriched.filter((r) => r.visitor_id.toLowerCase().includes(q.toLowerCase()))
  if (browser) enriched = enriched.filter((r) => r.browser === browser)
  if (os) enriched = enriched.filter((r) => r.os === os)
  if (device_type) enriched = enriched.filter((r) => r.device_type === device_type)
  if (channel) enriched = enriched.filter((r) => r.channel === channel)

  const total = enriched.length
  const offset = (page - 1) * size
  const rows = enriched.slice(offset, offset + size)

  // 同时返回各维度的 distinct 选项，方便前端 Select 渲染（基于过滤前的全集）
  const distinctOf = (key: 'browser' | 'os' | 'device_type' | 'channel') =>
    [...new Set(rawRows.map((r) => {
      if (key === 'channel') return classifyChannel(r.referrer)
      const d = parseUA(r.ua)
      return d[key]
    }))].sort()

  return c.json({
    range,
    from,
    to,
    total,
    page,
    size,
    rows,
    options: {
      browsers: distinctOf('browser'),
      os: distinctOf('os'),
      device_types: distinctOf('device_type'),
      channels: distinctOf('channel'),
    },
  })
})

adminVisitors.get('/:id', (c) => {
  const visitorId = c.req.param('id')
  if (!visitorId) return c.json({ error: 'invalid_id' }, 400)

  const summary = db
    .prepare(
      `SELECT visitor_id,
              MIN(ts) AS first_ts,
              MAX(ts) AS last_ts,
              COUNT(DISTINCT session_id) AS sessions,
              COUNT(*) AS events
         FROM events
        WHERE visitor_id = ?
        GROUP BY visitor_id`,
    )
    .get(visitorId) as
    | { visitor_id: string; first_ts: number; last_ts: number; sessions: number; events: number }
    | undefined
  if (!summary) return c.json({ error: 'not_found' }, 404)

  const lastEvt = db
    .prepare(`SELECT ua, ip FROM events WHERE visitor_id = ? ORDER BY ts DESC LIMIT 1`)
    .get(visitorId) as { ua: string | null; ip: string | null } | undefined

  const firstEvt = db
    .prepare(`SELECT page FROM events WHERE visitor_id = ? ORDER BY ts ASC LIMIT 1`)
    .get(visitorId) as { page: string | null } | undefined

  const firstPv = db
    .prepare(
      `SELECT json_extract(props,'$.referrer') AS referrer
         FROM events WHERE visitor_id = ? AND event = 'pageview' ORDER BY ts ASC LIMIT 1`,
    )
    .get(visitorId) as { referrer: string | null } | undefined

  const timeline = db
    .prepare(
      `SELECT id, ts, event, page, session_id, app_ver, props
         FROM events
        WHERE visitor_id = ?
        ORDER BY ts DESC
        LIMIT 200`,
    )
    .all(visitorId) as Array<{
      id: number; ts: number; event: string; page: string | null
      session_id: string; app_ver: string | null; props: string | null
    }>

  const dev = parseUA(lastEvt?.ua ?? null)
  return c.json({
    ...summary,
    ua: lastEvt?.ua ?? null,
    ip: lastEvt?.ip ?? null,
    first_page: firstEvt?.page ?? null,
    referrer: firstPv?.referrer ?? null,
    browser: dev.browser,
    os: dev.os,
    device_type: dev.device_type,
    channel: classifyChannel(firstPv?.referrer ?? null),
    timeline: timeline.map((e) => ({
      ...e,
      props: e.props ? JSON.parse(e.props) : null,
    })),
  })
})

export default adminVisitors
