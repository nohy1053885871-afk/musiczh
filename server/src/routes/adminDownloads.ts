import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { parseUA } from '../lib/ua.js'
import { parseTimeRange } from '../lib/timeRange.js'

const adminDownloads = new Hono()
adminDownloads.use('*', requireAdmin)

const ListQuery = z.object({
  type: z.enum(['done', 'fail']).optional(),
  kind: z.enum(['single', 'all_separate', 'zip']).optional(),
  ext: z.string().max(32).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(10),
})

const DOWNLOAD_EVENTS = ['download_done', 'download_fail']

adminDownloads.get('/', (c) => {
  const { from, to } = parseTimeRange(c)
  const parsed = ListQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
  if (!parsed.success) return c.json({ error: 'invalid_query', detail: parsed.error.issues }, 400)
  const { type, kind, ext, q, page, size } = parsed.data

  const where: string[] = ['ts >= ?', 'ts <= ?']
  const params: any[] = [from, to]

  if (type === 'done') {
    where.push("event = 'download_done'")
  } else if (type === 'fail') {
    where.push("event = 'download_fail'")
  } else {
    where.push(`event IN (${DOWNLOAD_EVENTS.map(() => '?').join(',')})`)
    params.push(...DOWNLOAD_EVENTS)
  }
  if (kind) { where.push("json_extract(props,'$.download_kind') = ?"); params.push(kind) }
  if (ext)  { where.push("json_extract(props,'$.file_ext') = ?"); params.push(ext) }
  if (q)    { where.push("json_extract(props,'$.file_name') LIKE ?"); params.push(`%${q}%`) }

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
              json_extract(props,'$.download_kind') AS download_kind,
              json_extract(props,'$.error_code')    AS error_code,
              json_extract(props,'$.error_msg')     AS error_msg
         FROM events ${whereSql}
        ORDER BY ts DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, size, offset) as Array<{
      id: number; ts: number; visitor_id: string; event: string
      app_ver: string | null; ua: string | null
      file_name: string | null; file_ext: string | null
      file_size: number | null; download_kind: string | null
      error_code: string | null; error_msg: string | null
    }>

  const rows = rawRows.map((r) => {
    const dev = parseUA(r.ua)
    return {
      id: r.id,
      ts: r.ts,
      visitor_id: r.visitor_id,
      event: r.event,
      type: r.event === 'download_done' ? 'done' : 'fail',
      download_kind: r.download_kind,
      file_name: r.file_name,
      file_ext: r.file_ext,
      file_size: r.file_size,
      error_code: r.error_code,
      error_msg: r.error_msg,
      app_ver: r.app_ver,
      browser: dev.browser,
      os: dev.os,
      device_type: dev.device_type,
    }
  })

  // 下载方式聚合
  const kindAgg = db
    .prepare(
      `SELECT json_extract(props,'$.download_kind') AS kind, COUNT(*) AS n
         FROM events
        WHERE ts >= ? AND ts <= ? AND event IN ('download_done','download_fail')
        GROUP BY kind ORDER BY n DESC`,
    )
    .all(from, to) as Array<{ kind: string | null; n: number }>

  return c.json({ total, page, size, rows, kind_agg: kindAgg })
})

adminDownloads.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid_id' }, 400)
  const row = db
    .prepare(
      `SELECT id, ts, visitor_id, event, app_ver, ua, ip, page,
              json_extract(props,'$.file_name')     AS file_name,
              json_extract(props,'$.file_ext')      AS file_ext,
              json_extract(props,'$.file_size')     AS file_size,
              json_extract(props,'$.download_kind') AS download_kind,
              json_extract(props,'$.error_code')    AS error_code,
              json_extract(props,'$.error_msg')     AS error_msg
         FROM events WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number; ts: number; visitor_id: string; event: string
        app_ver: string | null; ua: string | null; ip: string | null; page: string | null
        file_name: string | null; file_ext: string | null
        file_size: number | null; download_kind: string | null
        error_code: string | null; error_msg: string | null
      }
    | undefined
  if (!row) return c.json({ error: 'not_found' }, 404)

  // 失败行尝试关联 failures 表取 error_stack
  let error_stack: string | null = null
  if (row.event === 'download_fail') {
    const f = db
      .prepare(
        `SELECT error_stack FROM failures
          WHERE stage = 'download' AND visitor_id = ? AND ts = ?
          LIMIT 1`,
      )
      .get(row.visitor_id, row.ts) as { error_stack: string | null } | undefined
    error_stack = f?.error_stack ?? null
  }

  const dev = parseUA(row.ua)
  return c.json({
    ...row,
    type: row.event === 'download_done' ? 'done' : 'fail',
    error_stack,
    browser: dev.browser,
    os: dev.os,
    device_type: dev.device_type,
  })
})

export default adminDownloads
