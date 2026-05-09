import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

const adminFailures = new Hono()
adminFailures.use('*', requireAdmin)

const ListQuery = z.object({
  stage: z.enum(['decrypt', 'transcode']).optional(),
  code: z.string().max(64).optional(),
  q: z.string().max(200).optional(),
  ext: z.string().max(32).optional(),
  from: z.coerce.number().int().nonnegative().optional(),
  to: z.coerce.number().int().nonnegative().optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(10),
})

adminFailures.get('/', (c) => {
  const parsed = ListQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
  if (!parsed.success) return c.json({ error: 'invalid_query', detail: parsed.error.issues }, 400)
  const { stage, code, q, ext, from, to, page, size } = parsed.data

  const where: string[] = []
  const params: any[] = []
  if (stage) { where.push('stage = ?'); params.push(stage) }
  if (code)  { where.push('error_code = ?'); params.push(code) }
  if (ext)   { where.push('file_ext = ?'); params.push(ext) }
  if (q)     { where.push('file_name LIKE ?'); params.push(`%${q}%`) }
  if (from)  { where.push('ts >= ?'); params.push(from) }
  if (to)    { where.push('ts <= ?'); params.push(to) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  const total = (db
    .prepare(`SELECT COUNT(*) AS n FROM failures ${whereSql}`)
    .get(...params) as { n: number }).n

  const offset = (page - 1) * size
  const rows = db
    .prepare(
      `SELECT id, ts, visitor_id, stage, error_code, error_msg,
              file_name, file_ext, file_size, source, app_ver
         FROM failures ${whereSql}
        ORDER BY ts DESC
        LIMIT ? OFFSET ?`,
    )
    .all(...params, size, offset)

  // 同时返回错误码聚合，便于左侧过滤面板
  const codeAgg = db
    .prepare(
      `SELECT error_code, COUNT(*) AS n FROM failures ${whereSql}
        GROUP BY error_code ORDER BY n DESC`,
    )
    .all(...params)

  return c.json({ total, page, size, rows, code_agg: codeAgg })
})

adminFailures.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid_id' }, 400)
  const row = db.prepare(`SELECT * FROM failures WHERE id = ?`).get(id)
  if (!row) return c.json({ error: 'not_found' }, 404)
  return c.json(row)
})

export default adminFailures
