import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { parseUA } from '../lib/ua.js'
import { parseTimeRange } from '../lib/timeRange.js'

const adminUploads = new Hono()
adminUploads.use('*', requireAdmin)

const ListQuery = z.object({
  type: z.enum(['attempt', 'reject']).optional(),
  reason: z.string().max(64).optional(),
  ext: z.string().max(32).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(10),
})

const UPLOAD_EVENTS = ['upload_attempt', 'upload_reject']

adminUploads.get('/', (c) => {
  const { from, to } = parseTimeRange(c)
  const parsed = ListQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
  if (!parsed.success) return c.json({ error: 'invalid_query', detail: parsed.error.issues }, 400)
  const { type, reason, ext, q, page, size } = parsed.data

  const where: string[] = ['ts >= ?', 'ts <= ?']
  const params: any[] = [from, to]

  if (type === 'attempt') {
    where.push("event = 'upload_attempt'")
  } else if (type === 'reject') {
    where.push("event = 'upload_reject'")
  } else {
    where.push(`event IN (${UPLOAD_EVENTS.map(() => '?').join(',')})`)
    params.push(...UPLOAD_EVENTS)
  }
  if (reason) { where.push("json_extract(props,'$.reject_reason') = ?"); params.push(reason) }
  if (ext)    { where.push("json_extract(props,'$.file_ext') = ?"); params.push(ext) }
  if (q)      { where.push("json_extract(props,'$.file_name') LIKE ?"); params.push(`%${q}%`) }

  const whereSql = `WHERE ${where.join(' AND ')}`

  const total = (db
    .prepare(`SELECT COUNT(*) AS n FROM events ${whereSql}`)
    .get(...params) as { n: number }).n

  const offset = (page - 1) * size
  const rawRows = db
    .prepare(
      `SELECT id, ts, visitor_id, event, app_ver, ua,
              json_extract(props,'$.file_name')     AS file_name,
              json_extract(props,'$.file_ext')      AS file_ext,
              json_extract(props,'$.file_size')     AS file_size,
              json_extract(props,'$.reject_reason') AS reject_reason
         FROM events ${whereSql}
        ORDER BY ts DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, size, offset) as Array<{
      id: number; ts: number; visitor_id: string; event: string
      app_ver: string | null; ua: string | null
      file_name: string | null; file_ext: string | null
      file_size: number | null; reject_reason: string | null
    }>

  const rows = rawRows.map((r) => {
    const dev = parseUA(r.ua)
    return {
      id: r.id,
      ts: r.ts,
      visitor_id: r.visitor_id,
      event: r.event,
      type: r.event === 'upload_attempt' ? 'attempt' : 'reject',
      file_name: r.file_name,
      file_ext: r.file_ext,
      file_size: r.file_size,
      reject_reason: r.reject_reason,
      app_ver: r.app_ver,
      browser: dev.browser,
      os: dev.os,
      device_type: dev.device_type,
    }
  })

  // 拒绝原因聚合（侧栏过滤面板用）
  const reasonAgg = db
    .prepare(
      `SELECT json_extract(props,'$.reject_reason') AS reason, COUNT(*) AS n
         FROM events
        WHERE ts >= ? AND ts <= ? AND event = 'upload_reject'
        GROUP BY reason ORDER BY n DESC`,
    )
    .all(from, to) as Array<{ reason: string | null; n: number }>

  return c.json({ total, page, size, rows, reason_agg: reasonAgg })
})

adminUploads.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid_id' }, 400)
  const row = db
    .prepare(
      `SELECT id, ts, visitor_id, event, app_ver, ua, ip, page,
              json_extract(props,'$.file_name')     AS file_name,
              json_extract(props,'$.file_ext')      AS file_ext,
              json_extract(props,'$.file_size')     AS file_size,
              json_extract(props,'$.reject_reason') AS reject_reason
         FROM events WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number; ts: number; visitor_id: string; event: string
        app_ver: string | null; ua: string | null; ip: string | null; page: string | null
        file_name: string | null; file_ext: string | null
        file_size: number | null; reject_reason: string | null
      }
    | undefined
  if (!row) return c.json({ error: 'not_found' }, 404)
  const dev = parseUA(row.ua)
  return c.json({
    ...row,
    type: row.event === 'upload_attempt' ? 'attempt' : 'reject',
    browser: dev.browser,
    os: dev.os,
    device_type: dev.device_type,
  })
})

export default adminUploads
