import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { getClientIp } from '../middleware/ratelimit.js'

// 业务字段白名单（与 docs/ANALYTICS_SPEC.md 保持一致）
const ALLOWED_PROPS = new Set([
  'file_name', 'file_ext', 'file_size',
  'error_code', 'error_msg', 'error_stack',
  'count', 'total_size', 'format', 'source',
  'from_format', 'queue_size', 'action', 'status',
  'referrer',
  'reject_reason', 'download_kind',
])

const FailureSchema = z.object({
  stage: z.enum(['decrypt', 'transcode', 'download']),
  error_code: z.string().max(64).optional(),
  error_msg: z.string().max(2000).optional(),
  error_stack: z.string().max(8000).optional(),
  file_name: z.string().max(500).optional(),
  file_ext: z.string().max(32).optional(),
  file_size: z.number().int().nonnegative().optional(),
  source: z.string().max(32).optional(),
})

const EventSchema = z.object({
  event: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, 'event must be snake_case'),
  ts: z.number().int().positive(),
  visitor_id: z.string().min(8).max(64),
  session_id: z.string().min(4).max(64),
  page: z.string().max(256).optional(),
  app_ver: z.string().max(32).optional(),
  props: z.record(z.unknown()).optional(),
  failure: FailureSchema.optional(),
})

const PayloadSchema = z.object({
  events: z.array(EventSchema).min(1).max(100),
})

const insertEvent = db.prepare(`
  INSERT INTO events (ts, event, visitor_id, session_id, page, ua, ip, app_ver, props)
  VALUES (@ts, @event, @visitor_id, @session_id, @page, @ua, @ip, @app_ver, @props)
`)
const insertFailure = db.prepare(`
  INSERT INTO failures (ts, visitor_id, stage, error_code, error_msg, error_stack,
                        file_name, file_ext, file_size, source, ua, ip, app_ver)
  VALUES (@ts, @visitor_id, @stage, @error_code, @error_msg, @error_stack,
          @file_name, @file_ext, @file_size, @source, @ua, @ip, @app_ver)
`)

const insertBatch = db.transaction((rows: { event: any; failure: any }[]) => {
  for (const row of rows) {
    insertEvent.run(row.event)
    if (row.failure) insertFailure.run(row.failure)
  }
})

const trackRouter = new Hono()

trackRouter.post('/', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    // sendBeacon 可能 Content-Type 为 text/plain，再尝试一次
    try {
      const text = await c.req.text()
      body = JSON.parse(text)
    } catch {
      return c.json({ error: 'invalid_json' }, 400)
    }
  }

  const parsed = PayloadSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'invalid_payload', detail: parsed.error.issues }, 400)
  }

  const ua = c.req.header('user-agent') ?? null
  const ip = getClientIp(c)

  const rows = parsed.data.events.map((ev) => {
    // props 白名单过滤
    let props: Record<string, unknown> = {}
    if (ev.props) {
      for (const [k, v] of Object.entries(ev.props)) {
        if (ALLOWED_PROPS.has(k)) props[k] = v
      }
    }
    const event = {
      ts: ev.ts,
      event: ev.event,
      visitor_id: ev.visitor_id,
      session_id: ev.session_id,
      page: ev.page ?? null,
      ua,
      ip,
      app_ver: ev.app_ver ?? null,
      props: Object.keys(props).length ? JSON.stringify(props) : null,
    }
    const failure = ev.failure
      ? {
          ts: ev.ts,
          visitor_id: ev.visitor_id,
          stage: ev.failure.stage,
          error_code: ev.failure.error_code ?? null,
          error_msg: ev.failure.error_msg ?? null,
          error_stack: ev.failure.error_stack ?? null,
          file_name: ev.failure.file_name ?? null,
          file_ext: ev.failure.file_ext ?? null,
          file_size: ev.failure.file_size ?? null,
          source: ev.failure.source ?? null,
          ua,
          ip,
          app_ver: ev.app_ver ?? null,
        }
      : null
    return { event, failure }
  })

  insertBatch(rows)
  return c.json({ ok: true, count: rows.length })
})

export default trackRouter
