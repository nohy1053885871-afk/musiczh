import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

const adminSuccesses = new Hono()
adminSuccesses.use('*', requireAdmin)

const ListQuery = z.object({
  stage: z.enum(['decrypt', 'transcode']).optional(),
  q: z.string().max(200).optional(),
  ext: z.string().max(32).optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(10),
})

const STAGE_TO_EVENT: Record<string, string> = {
  decrypt: 'decrypt_done',
  transcode: 'transcode_done',
}

const SUCCESS_EVENTS = ['decrypt_done', 'transcode_done']

adminSuccesses.get('/', (c) => {
  const parsed = ListQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
  if (!parsed.success) return c.json({ error: 'invalid_query', detail: parsed.error.issues }, 400)
  const { stage, q, ext, from, to, page, size } = parsed.data

  const where: string[] = []
  const params: any[] = []

  if (stage) {
    where.push('event = ?')
    params.push(STAGE_TO_EVENT[stage])
  } else {
    where.push(`event IN (${SUCCESS_EVENTS.map(() => '?').join(',')})`)
    params.push(...SUCCESS_EVENTS)
  }

  if (ext) { where.push("json_extract(props,'$.file_ext') = ?"); params.push(ext) }
  if (q)   { where.push("json_extract(props,'$.file_name') LIKE ?"); params.push(`%${q}%`) }
  if (from) { where.push('ts >= ?'); params.push(from) }
  if (to)   { where.push('ts <= ?'); params.push(to) }

  const whereSql = `WHERE ${where.join(' AND ')}`

  const total = (db
    .prepare(`SELECT COUNT(*) AS n FROM events ${whereSql}`)
    .get(...params) as { n: number }).n

  const offset = (page - 1) * size
  const rawRows = db
    .prepare(
      `SELECT id, ts, visitor_id, event, app_ver,
              json_extract(props,'$.file_name') AS file_name,
              json_extract(props,'$.file_ext')  AS file_ext,
              json_extract(props,'$.file_size') AS file_size,
              json_extract(props,'$.source')    AS source
         FROM events ${whereSql}
        ORDER BY ts DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, size, offset) as Array<{
      id: number; ts: number; visitor_id: string; event: string; app_ver: string | null
      file_name: string | null; file_ext: string | null
      file_size: number | null; source: string | null
    }>

  const rows = rawRows.map((r) => ({
    id: r.id,
    ts: r.ts,
    visitor_id: r.visitor_id,
    stage: r.event === 'transcode_done' ? 'transcode' : 'decrypt',
    file_name: r.file_name,
    file_ext: r.file_ext,
    file_size: r.file_size,
    source: r.source,
    app_ver: r.app_ver,
  }))

  return c.json({ total, page, size, rows })
})

adminSuccesses.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid_id' }, 400)
  const row = db
    .prepare(
      `SELECT id, ts, visitor_id, event, app_ver, ua, ip,
              json_extract(props,'$.file_name') AS file_name,
              json_extract(props,'$.file_ext')  AS file_ext,
              json_extract(props,'$.file_size') AS file_size,
              json_extract(props,'$.source')    AS source
         FROM events WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number; ts: number; visitor_id: string; event: string
        app_ver: string | null; ua: string | null; ip: string | null
        file_name: string | null; file_ext: string | null
        file_size: number | null; source: string | null
      }
    | undefined
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json({
    ...row,
    stage: row.event === 'transcode_done' ? 'transcode' : 'decrypt',
  })
})

export default adminSuccesses
