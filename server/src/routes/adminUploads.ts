import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { parseUA } from '../lib/ua.js'
import { parseTimeRange } from '../lib/timeRange.js'

const adminUploads = new Hono()
adminUploads.use('*', requireAdmin)

// v0.4.1 合并后的状态枚举（运营后台「状态」列）
// rejected_* 直接来自 upload_reject + reject_reason
// success/failed/abandoned/pending/legacy 通过 file_id 关联下游事件计算
const STATUS_VALUES = [
  'rejected_format', 'rejected_size', 'rejected_queue', 'rejected_large_batch',
  'success', 'failed', 'abandoned', 'pending', 'legacy',
] as const
type StatusValue = typeof STATUS_VALUES[number]

const ListQuery = z.object({
  // 旧参数保留一版做向下兼容（admin 老页面 / 老链接），新参数 status 优先
  type: z.enum(['attempt', 'reject']).optional(),
  reason: z.string().max(64).optional(),
  status: z.enum(STATUS_VALUES).optional(),
  ext: z.string().max(32).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(200).default(10),
})

// pipeline_status 计算用的 CASE 片段，引用 base.file_id / base.event
// 上游：base AS (SELECT * FROM events WHERE <where>)
// upload_reject 行不算 pipeline_status；upload_attempt 行按 file_id 关联下游事件
const PIPELINE_STATUS_SQL = `
  CASE
    WHEN b.event = 'upload_reject' THEN NULL
    WHEN b.file_id IS NULL THEN 'legacy'
    WHEN EXISTS (SELECT 1 FROM events d WHERE d.file_id = b.file_id
                   AND d.event IN ('decrypt_done','transcode_done')) THEN 'success'
    WHEN EXISTS (SELECT 1 FROM events d WHERE d.file_id = b.file_id
                   AND d.event IN ('decrypt_fail','transcode_fail')) THEN 'failed'
    WHEN EXISTS (SELECT 1 FROM events d WHERE d.file_id = b.file_id
                   AND d.event IN ('decrypt_abandon','transcode_abandon')) THEN 'abandoned'
    ELSE 'pending'
  END
`

// 单一 status 参数 → SQL WHERE 片段 + 参数
function statusToWhere(status: StatusValue): { sql: string; params: any[] } {
  switch (status) {
    case 'rejected_format':
      return { sql: "event = 'upload_reject' AND json_extract(props,'$.reject_reason') = ?", params: ['FORMAT_UNSUPPORTED'] }
    case 'rejected_size':
      return { sql: "event = 'upload_reject' AND json_extract(props,'$.reject_reason') = ?", params: ['SIZE_EXCEEDED'] }
    case 'rejected_queue':
      return { sql: "event = 'upload_reject' AND json_extract(props,'$.reject_reason') = ?", params: ['QUEUE_FULL'] }
    case 'rejected_large_batch':
      return { sql: "event = 'upload_reject' AND json_extract(props,'$.reject_reason') = ?", params: ['LARGE_BATCH_DISMISSED'] }
    case 'success':
      return {
        sql: `event = 'upload_attempt' AND file_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM events d WHERE d.file_id = events.file_id
                            AND d.event IN ('decrypt_done','transcode_done'))`,
        params: [],
      }
    case 'failed':
      return {
        sql: `event = 'upload_attempt' AND file_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM events d WHERE d.file_id = events.file_id
                            AND d.event IN ('decrypt_fail','transcode_fail'))
              AND NOT EXISTS (SELECT 1 FROM events d WHERE d.file_id = events.file_id
                                AND d.event IN ('decrypt_done','transcode_done'))`,
        params: [],
      }
    case 'abandoned':
      return {
        sql: `event = 'upload_attempt' AND file_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM events d WHERE d.file_id = events.file_id
                            AND d.event IN ('decrypt_abandon','transcode_abandon'))
              AND NOT EXISTS (SELECT 1 FROM events d WHERE d.file_id = events.file_id
                                AND d.event IN ('decrypt_done','decrypt_fail','transcode_done','transcode_fail'))`,
        params: [],
      }
    case 'pending':
      return {
        sql: `event = 'upload_attempt' AND file_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM events d WHERE d.file_id = events.file_id
                                AND d.event IN ('decrypt_done','decrypt_fail','decrypt_abandon',
                                                'transcode_done','transcode_fail','transcode_abandon'))`,
        params: [],
      }
    case 'legacy':
      return { sql: "event = 'upload_attempt' AND file_id IS NULL", params: [] }
  }
}

const UPLOAD_EVENTS = ['upload_attempt', 'upload_reject']

adminUploads.get('/', (c) => {
  const { from, to } = parseTimeRange(c)
  const parsed = ListQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
  if (!parsed.success) return c.json({ error: 'invalid_query', detail: parsed.error.issues }, 400)
  const { type, reason, status, ext, q, page, size } = parsed.data

  const where: string[] = ['ts >= ?', 'ts <= ?']
  const params: any[] = [from, to]

  // 优先 status；缺省时回退到旧 type / reason 参数（向下兼容旧链接）
  if (status) {
    const { sql, params: sp } = statusToWhere(status)
    where.push(`(${sql})`)
    params.push(...sp)
  } else if (type === 'attempt') {
    where.push("event = 'upload_attempt'")
  } else if (type === 'reject') {
    where.push("event = 'upload_reject'")
    if (reason) { where.push("json_extract(props,'$.reject_reason') = ?"); params.push(reason) }
  } else {
    where.push(`event IN (${UPLOAD_EVENTS.map(() => '?').join(',')})`)
    params.push(...UPLOAD_EVENTS)
    if (reason) { where.push("json_extract(props,'$.reject_reason') = ?"); params.push(reason) }
  }
  if (ext) { where.push("json_extract(props,'$.file_ext') = ?"); params.push(ext) }
  if (q)   { where.push("json_extract(props,'$.file_name') LIKE ?"); params.push(`%${q}%`) }

  const whereSql = `WHERE ${where.join(' AND ')}`

  const total = (db
    .prepare(`SELECT COUNT(*) AS n FROM events ${whereSql}`)
    .get(...params) as { n: number }).n

  const offset = (page - 1) * size
  // base CTE 只取当前分页的行；pipeline_status 通过 EXISTS 子查询计算
  // 每页 ≤ 20 行 × 3 个 EXISTS = ≤60 次索引查询，加 idx_events_file_id 单页 <50ms
  const rawRows = db
    .prepare(
      `WITH b AS (
         SELECT id, ts, visitor_id, event, app_ver, ua, file_id,
                json_extract(props,'$.file_name')     AS file_name,
                json_extract(props,'$.file_ext')      AS file_ext,
                json_extract(props,'$.file_size')     AS file_size,
                json_extract(props,'$.reject_reason') AS reject_reason
         FROM events ${whereSql}
         ORDER BY ts DESC LIMIT ? OFFSET ?
       )
       SELECT b.*, ${PIPELINE_STATUS_SQL} AS pipeline_status FROM b`,
    )
    .all(...params, size, offset) as Array<{
      id: number; ts: number; visitor_id: string; event: string
      app_ver: string | null; ua: string | null; file_id: string | null
      file_name: string | null; file_ext: string | null
      file_size: number | null; reject_reason: string | null
      pipeline_status: 'success' | 'failed' | 'abandoned' | 'pending' | 'legacy' | null
    }>

  const rows = rawRows.map((r) => {
    const dev = parseUA(r.ua)
    // 合并 status：upload_reject → rejected_<reason>；upload_attempt → pipeline_status
    let mergedStatus: StatusValue | null = null
    if (r.event === 'upload_reject') {
      if (r.reject_reason === 'FORMAT_UNSUPPORTED') mergedStatus = 'rejected_format'
      else if (r.reject_reason === 'SIZE_EXCEEDED') mergedStatus = 'rejected_size'
      else if (r.reject_reason === 'QUEUE_FULL')    mergedStatus = 'rejected_queue'
      else if (r.reject_reason === 'LARGE_BATCH_DISMISSED') mergedStatus = 'rejected_large_batch'
    } else if (r.pipeline_status) {
      mergedStatus = r.pipeline_status
    }
    return {
      id: r.id,
      ts: r.ts,
      visitor_id: r.visitor_id,
      event: r.event,
      // 旧字段保留一版（admin 老视图过渡用，下版本可删）
      type: r.event === 'upload_attempt' ? 'attempt' : 'reject',
      reject_reason: r.reject_reason,
      pipeline_status: r.pipeline_status,
      // 新字段：合并后的状态（前端 Tag 直接消费）
      status: mergedStatus,
      file_id: r.file_id,
      file_name: r.file_name,
      file_ext: r.file_ext,
      file_size: r.file_size,
      app_ver: r.app_ver,
      browser: dev.browser,
      os: dev.os,
      device_type: dev.device_type,
    }
  })

  // 拒绝原因聚合（侧栏过滤面板用，旧 admin 视图保留）
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

// 上传日志按日聚合：用于 admin 上传日志页底部「上传趋势」折线图
// 单 SQL 一次拿出每天的 attempt / reject_total / 3 个 reason 拆分；占比由前端算
adminUploads.get('/timeseries', (c) => {
  const { from, to, range } = parseTimeRange(c)
  // 复用 adminStats.ts 里的本地时区桶切片逻辑（避免 UTC 0 点和本地 0 点错位）
  const TZ_OFFSET_MS = -new Date().getTimezoneOffset() * 60_000
  const DAY_BUCKET_SQL = `((ts + ${TZ_OFFSET_MS}) / 86400000) * 86400000 - ${TZ_OFFSET_MS}`

  const rows = db
    .prepare(
      `SELECT ${DAY_BUCKET_SQL} AS day,
              SUM(CASE WHEN event = 'upload_attempt' THEN 1 ELSE 0 END) AS attempt,
              SUM(CASE WHEN event = 'upload_reject' THEN 1 ELSE 0 END) AS reject_total,
              SUM(CASE WHEN event = 'upload_reject' AND json_extract(props,'$.reject_reason') = 'FORMAT_UNSUPPORTED' THEN 1 ELSE 0 END) AS reject_format,
              SUM(CASE WHEN event = 'upload_reject' AND json_extract(props,'$.reject_reason') = 'SIZE_EXCEEDED'       THEN 1 ELSE 0 END) AS reject_size,
              SUM(CASE WHEN event = 'upload_reject' AND json_extract(props,'$.reject_reason') = 'QUEUE_FULL'          THEN 1 ELSE 0 END) AS reject_queue,
              SUM(CASE WHEN event = 'upload_reject' AND json_extract(props,'$.reject_reason') = 'LARGE_BATCH_DISMISSED' THEN 1 ELSE 0 END) AS reject_large_batch
         FROM events
        WHERE ts >= ? AND ts <= ?
          AND event IN ('upload_attempt','upload_reject')
        GROUP BY day ORDER BY day`,
    )
    .all(from, to) as Array<{
      day: number; attempt: number; reject_total: number
      reject_format: number; reject_size: number; reject_queue: number; reject_large_batch: number
    }>

  return c.json({ range, from, to, points: rows })
})

// 按格式 × 时间双维度聚合：admin 上传日志页底部「按格式维度拆解」图消费
// 横轴 = 日（DAY_BUCKET_SQL 切桶）；每天每格式返回 total / success / fail
// 前端按勾选的（格式, 指标）笛卡尔积渲染折线
adminUploads.get('/by-format', (c) => {
  const { from, to, range } = parseTimeRange(c)
  const TZ_OFFSET_MS = -new Date().getTimezoneOffset() * 60_000
  const DAY_BUCKET_SQL = `((ts + ${TZ_OFFSET_MS}) / 86400000) * 86400000 - ${TZ_OFFSET_MS}`

  const rawRows = db
    .prepare(
      `SELECT ${DAY_BUCKET_SQL} AS day,
              json_extract(props,'$.file_ext') AS ext,
              COUNT(*) AS total,
              SUM(CASE WHEN file_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM events d WHERE d.file_id = events.file_id
                  AND d.event IN ('decrypt_done','transcode_done')
              ) THEN 1 ELSE 0 END) AS success,
              SUM(CASE WHEN file_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM events d WHERE d.file_id = events.file_id
                  AND d.event IN ('decrypt_fail','transcode_fail')
              ) THEN 1 ELSE 0 END) AS fail
         FROM events
        WHERE ts >= ? AND ts <= ?
          AND event = 'upload_attempt'
          AND json_extract(props,'$.file_ext') IS NOT NULL
        GROUP BY day, ext
        ORDER BY day ASC`,
    )
    .all(from, to) as Array<{ day: number; ext: string; total: number; success: number; fail: number }>

  // 重塑为 [{ day, ncm: {total,success,fail}, kgm: {...}, ... }]
  // 同日全部格式 total 之和用于前端算「格式占比」（占当日全部上传的比例）
  const byDay = new Map<number, { day: number; per_ext: Record<string, { total: number; success: number; fail: number }> }>()
  for (const r of rawRows) {
    if (!byDay.has(r.day)) byDay.set(r.day, { day: r.day, per_ext: {} })
    byDay.get(r.day)!.per_ext[r.ext] = {
      total: r.total ?? 0, success: r.success ?? 0, fail: r.fail ?? 0,
    }
  }
  const exts = Array.from(new Set(rawRows.map((r) => r.ext))).sort()
  const points = Array.from(byDay.values()).sort((a, b) => a.day - b.day)

  return c.json({ range, from, to, exts, points })
})

adminUploads.get('/:id', (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isFinite(id)) return c.json({ error: 'invalid_id' }, 400)
  const row = db
    .prepare(
      `SELECT id, ts, visitor_id, event, app_ver, ua, ip, page, file_id,
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
        file_id: string | null
        file_name: string | null; file_ext: string | null
        file_size: number | null; reject_reason: string | null
      }
    | undefined
  if (!row) return c.json({ error: 'not_found' }, 404)
  const dev = parseUA(row.ua)

  // 该 file_id 的事件 timeline（按 ts 升序），含上传 → 解密 / 转码 → 终态
  // 历史无 file_id 的行 timeline = []，前端文案兜底提示
  let timeline: Array<{ id: number; ts: number; event: string; props: any }> = []
  if (row.file_id) {
    timeline = (db
      .prepare(
        `SELECT id, ts, event, props FROM events
          WHERE file_id = ? ORDER BY ts ASC LIMIT 200`,
      )
      .all(row.file_id) as Array<{ id: number; ts: number; event: string; props: string | null }>)
      .map((e) => ({
        id: e.id,
        ts: e.ts,
        event: e.event,
        props: e.props ? safeJsonParse(e.props) : null,
      }))
  }

  return c.json({
    ...row,
    type: row.event === 'upload_attempt' ? 'attempt' : 'reject',
    browser: dev.browser,
    os: dev.os,
    device_type: dev.device_type,
    timeline,
  })
})

function safeJsonParse(s: string): unknown {
  try { return JSON.parse(s) } catch { return null }
}

export default adminUploads
