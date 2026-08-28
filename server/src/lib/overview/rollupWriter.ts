import type Database from 'better-sqlite3'
import { parseUA } from '../ua.js'
import { dayBucket } from './shared.js'
import type { RollupState } from './types.js'

export type RollupEventRow = {
  id: number
  ts: number
  event: string
  visitor_id: string
  site_host: string | null
  ua: string | null
  props: string | null
  file_id: string | null
}

export type DailyMetrics = {
  day: number
  pv: number
  pv_sleepno_cn: number
  pv_shiyinmp3_com: number
  upload_files: number
  upload_files_legacy: number
  upload_reject: number
  dismissed_files: number
  decrypt_done: number
  decrypt_fail: number
  transcode_done: number
  transcode_fail: number
  raw_transcode_done: number
  raw_transcode_fail: number
  decrypt_abandon: number
  transcode_abandon: number
  legacy_files: number
  download_done: number
}

export type DailyVisitor = {
  day: number
  visitor_id: string
  last_ts: number
  browser: string
  os: string
  device_type: string
  has_ua: number
  has_pageview: number
  has_pageview_sleepno_cn: number
  has_pageview_shiyinmp3_com: number
  has_upload: number
  has_convert: number
  has_download: number
}

type FileUpdate = { file_id: string; upload_ts: number | null; status: string; updated_at: number }
type FileUpload = { upload_event_id: number; file_id: string; upload_ts: number }

const METRIC_COLUMNS = [
  'pv', 'pv_sleepno_cn', 'pv_shiyinmp3_com',
  'upload_files', 'upload_files_legacy', 'upload_reject', 'dismissed_files',
  'decrypt_done', 'decrypt_fail', 'transcode_done', 'transcode_fail',
  'raw_transcode_done', 'raw_transcode_fail', 'decrypt_abandon', 'transcode_abandon',
  'legacy_files', 'download_done',
] as const

const UPLOAD_EVENTS = new Set(['upload_drop', 'upload_pick', 'upload_attempt', 'upload_reject'])
const DOWNLOAD_EVENTS = new Set([
  'row_download_click', 'btn_download_all_click', 'btn_download_zip_click', 'download_done', 'download_fail',
])

function emptyMetrics(day: number): DailyMetrics {
  return {
    day, pv: 0, pv_sleepno_cn: 0, pv_shiyinmp3_com: 0,
    upload_files: 0, upload_files_legacy: 0, upload_reject: 0,
    dismissed_files: 0, decrypt_done: 0, decrypt_fail: 0, transcode_done: 0,
    transcode_fail: 0, raw_transcode_done: 0, raw_transcode_fail: 0,
    decrypt_abandon: 0, transcode_abandon: 0, legacy_files: 0, download_done: 0,
  }
}

function propsOf(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' ? value as Record<string, unknown> : {}
  } catch {
    return {}
  }
}

function statusFor(event: string): string | null {
  if (event === 'upload_attempt') return 'pending'
  if (event === 'decrypt_done' || event === 'transcode_done') return 'success'
  if (event === 'decrypt_fail' || event === 'transcode_fail') return 'failed'
  if (event === 'decrypt_abandon' || event === 'transcode_abandon') return 'abandoned'
  return null
}

function mergeStatus(current: string, incoming: string): string {
  const rank: Record<string, number> = { pending: 0, abandoned: 1, failed: 2, success: 3 }
  return rank[incoming] > rank[current] ? incoming : current
}

export function aggregateRollupRows(rows: RollupEventRow[]) {
  const metrics = new Map<number, DailyMetrics>()
  const visitors = new Map<string, DailyVisitor>()
  const files = new Map<string, FileUpdate>()
  const uploads: FileUpload[] = []

  for (const row of rows) {
    const day = dayBucket(row.ts)
    const props = propsOf(row.props)
    const metric = metrics.get(day) ?? emptyMetrics(day)
    metrics.set(day, metric)

    if (row.event === 'pageview') {
      metric.pv += 1
      if (row.site_host === 'sleepno.cn') metric.pv_sleepno_cn += 1
      if (row.site_host === 'shiyinmp3.com') metric.pv_shiyinmp3_com += 1
    }
    if (row.event === 'upload_attempt' || row.event === 'upload_reject') metric.upload_files += 1
    if (row.event === 'upload_drop' || row.event === 'upload_pick') {
      const count = Number(props.count)
      if (Number.isFinite(count)) metric.upload_files_legacy += Math.trunc(count)
    }
    if (row.event === 'upload_reject') {
      if (props.reject_reason === 'LARGE_BATCH_DISMISSED') metric.dismissed_files += 1
      else metric.upload_reject += 1
    }
    if (row.event === 'decrypt_done') metric.decrypt_done += 1
    if (row.event === 'decrypt_fail') metric.decrypt_fail += 1
    if (row.event === 'transcode_done') {
      metric.transcode_done += 1
      if (props.source == null) metric.raw_transcode_done += 1
    }
    if (row.event === 'transcode_fail') {
      metric.transcode_fail += 1
      if (props.source == null) metric.raw_transcode_fail += 1
    }
    if (row.event === 'decrypt_abandon') metric.decrypt_abandon += 1
    if (row.event === 'transcode_abandon') metric.transcode_abandon += 1
    if (row.event === 'upload_attempt' && row.file_id == null) metric.legacy_files += 1
    if (row.event === 'download_done') metric.download_done += 1

    const visitorKey = `${day}\u0000${row.visitor_id}`
    const parsed = parseUA(row.ua)
    const visitor = visitors.get(visitorKey) ?? {
      day, visitor_id: row.visitor_id, last_ts: row.ua ? row.ts : 0,
      browser: parsed.browser, os: parsed.os, device_type: parsed.device_type,
      has_ua: row.ua ? 1 : 0,
      has_pageview: 0, has_pageview_sleepno_cn: 0, has_pageview_shiyinmp3_com: 0,
      has_upload: 0, has_convert: 0, has_download: 0,
    }
    if (row.ua && row.ts >= visitor.last_ts) {
      visitor.last_ts = row.ts
      visitor.browser = parsed.browser
      visitor.os = parsed.os
      visitor.device_type = parsed.device_type
      visitor.has_ua = 1
    }
    if (row.event === 'pageview') {
      visitor.has_pageview = 1
      if (row.site_host === 'sleepno.cn') visitor.has_pageview_sleepno_cn = 1
      if (row.site_host === 'shiyinmp3.com') visitor.has_pageview_shiyinmp3_com = 1
    }
    if (UPLOAD_EVENTS.has(row.event)) visitor.has_upload = 1
    if (row.event === 'decrypt_done' || (row.event === 'transcode_done' && props.source == null)) {
      visitor.has_convert = 1
    }
    if (DOWNLOAD_EVENTS.has(row.event)) visitor.has_download = 1
    visitors.set(visitorKey, visitor)

    const incomingStatus = statusFor(row.event)
    if (row.file_id && incomingStatus) {
      if (row.event === 'upload_attempt') {
        uploads.push({ upload_event_id: row.id, file_id: row.file_id, upload_ts: row.ts })
      }
      const existing = files.get(row.file_id)
      const uploadTs = row.event === 'upload_attempt' ? row.ts : null
      if (existing) {
        existing.status = mergeStatus(existing.status, incomingStatus)
        if (uploadTs != null) existing.upload_ts = existing.upload_ts ?? uploadTs
        existing.updated_at = Math.max(existing.updated_at, row.ts)
      } else {
        files.set(row.file_id, {
          file_id: row.file_id, upload_ts: uploadTs, status: incomingStatus, updated_at: row.ts,
        })
      }
    }
  }
  return {
    metrics: [...metrics.values()], visitors: [...visitors.values()],
    files: [...files.values()], uploads,
  }
}

export function getRollupState(db: Database.Database): RollupState {
  return db.prepare(
    `SELECT last_event_id, status, last_run_at, last_error
       FROM overview_rollup_state WHERE singleton = 1`,
  ).get() as RollupState
}

export function getMaxEventId(db: Database.Database): number {
  return (db.prepare('SELECT COALESCE(MAX(id), 0) AS n FROM events').get() as { n: number }).n
}

export function processRollupBatch(
  db: Database.Database,
  options: { batchSize?: number; allowBuilding?: boolean; maxEventId?: number } = {},
): { processed: number; lastEventId: number } {
  const batchSize = options.batchSize ?? 10_000
  const state = getRollupState(db)
  if (state.status === 'disabled' || (state.status === 'building' && !options.allowBuilding)) {
    return { processed: 0, lastEventId: state.last_event_id }
  }

  const maxClause = options.maxEventId == null ? '' : 'AND id <= ?'
  const params = options.maxEventId == null
    ? [state.last_event_id, batchSize]
    : [state.last_event_id, options.maxEventId, batchSize]
  const rows = db.prepare(
    `SELECT id, ts, event, visitor_id, site_host, ua, props, file_id
       FROM events WHERE id > ? ${maxClause} ORDER BY id LIMIT ?`,
  ).all(...params) as RollupEventRow[]

  if (!rows.length) {
    db.prepare(
      `UPDATE overview_rollup_state SET last_run_at = ?, last_error = NULL WHERE singleton = 1`,
    ).run(Date.now())
    return { processed: 0, lastEventId: state.last_event_id }
  }

  const aggregated = aggregateRollupRows(rows)
  const metricInsertColumns = ['day', ...METRIC_COLUMNS].join(', ')
  const metricValues = ['@day', ...METRIC_COLUMNS.map((column) => `@${column}`)].join(', ')
  const metricUpdates = METRIC_COLUMNS.map((column) => `${column} = ${column} + excluded.${column}`).join(', ')
  const upsertMetric = db.prepare(
    `INSERT INTO overview_daily_metrics (${metricInsertColumns}) VALUES (${metricValues})
     ON CONFLICT(day) DO UPDATE SET ${metricUpdates}`,
  )
  const upsertVisitor = db.prepare(
    `INSERT INTO overview_daily_visitors
       (day, visitor_id, last_ts, browser, os, device_type, has_ua,
        has_pageview, has_pageview_sleepno_cn, has_pageview_shiyinmp3_com,
        has_upload, has_convert, has_download)
     VALUES (@day, @visitor_id, @last_ts, @browser, @os, @device_type, @has_ua,
             @has_pageview, @has_pageview_sleepno_cn, @has_pageview_shiyinmp3_com,
             @has_upload, @has_convert, @has_download)
     ON CONFLICT(day, visitor_id) DO UPDATE SET
       browser = CASE WHEN excluded.last_ts >= last_ts THEN excluded.browser ELSE browser END,
       os = CASE WHEN excluded.last_ts >= last_ts THEN excluded.os ELSE os END,
       device_type = CASE WHEN excluded.last_ts >= last_ts THEN excluded.device_type ELSE device_type END,
       last_ts = MAX(last_ts, excluded.last_ts),
       has_ua = MAX(has_ua, excluded.has_ua),
       has_pageview = MAX(has_pageview, excluded.has_pageview),
       has_pageview_sleepno_cn = MAX(has_pageview_sleepno_cn, excluded.has_pageview_sleepno_cn),
       has_pageview_shiyinmp3_com = MAX(has_pageview_shiyinmp3_com, excluded.has_pageview_shiyinmp3_com),
       has_upload = MAX(has_upload, excluded.has_upload),
       has_convert = MAX(has_convert, excluded.has_convert),
       has_download = MAX(has_download, excluded.has_download)`,
  )
  const upsertFile = db.prepare(
    `INSERT INTO overview_file_state (file_id, upload_ts, status, updated_at)
     VALUES (@file_id, @upload_ts, @status, @updated_at)
     ON CONFLICT(file_id) DO UPDATE SET
       upload_ts = COALESCE(upload_ts, excluded.upload_ts),
       status = CASE
         WHEN status = 'success' OR excluded.status = 'success' THEN 'success'
         WHEN status = 'failed' OR excluded.status = 'failed' THEN 'failed'
         WHEN status = 'abandoned' OR excluded.status = 'abandoned' THEN 'abandoned'
         ELSE 'pending' END,
       updated_at = MAX(updated_at, excluded.updated_at)`,
  )
  const upsertUpload = db.prepare(
    `INSERT INTO overview_file_upload_state
       (upload_event_id, file_id, upload_ts, status, updated_at)
     SELECT @upload_event_id, @file_id, @upload_ts, status, updated_at
       FROM overview_file_state WHERE file_id = @file_id
     ON CONFLICT(upload_event_id) DO NOTHING`,
  )
  const syncUploadStatus = db.prepare(
    `UPDATE overview_file_upload_state
        SET status = (SELECT status FROM overview_file_state WHERE file_id = @file_id),
            updated_at = MAX(updated_at, @updated_at)
      WHERE file_id = @file_id`,
  )
  const lastEventId = rows[rows.length - 1].id
  const commit = db.transaction(() => {
    for (const metric of aggregated.metrics) upsertMetric.run(metric)
    for (const visitor of aggregated.visitors) upsertVisitor.run(visitor)
    for (const file of aggregated.files) upsertFile.run(file)
    for (const upload of aggregated.uploads) upsertUpload.run(upload)
    for (const file of aggregated.files) syncUploadStatus.run(file)
    db.prepare(
      `UPDATE overview_rollup_state
          SET last_event_id = ?, last_run_at = ?, last_error = NULL
        WHERE singleton = 1`,
    ).run(lastEventId, Date.now())
  })
  try {
    commit()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    db.prepare(
      `UPDATE overview_rollup_state SET last_error = ? WHERE singleton = 1`,
    ).run(message.slice(0, 2000))
    throw error
  }
  return { processed: rows.length, lastEventId }
}

export function resetOverviewRollup(db: Database.Database): void {
  db.transaction(() => {
    db.prepare('DELETE FROM overview_daily_metrics').run()
    db.prepare('DELETE FROM overview_daily_visitors').run()
    db.prepare('DELETE FROM overview_file_upload_state').run()
    db.prepare('DELETE FROM overview_file_state').run()
    db.prepare(
      `UPDATE overview_rollup_state
          SET last_event_id = 0, status = 'building', last_run_at = NULL, last_error = NULL
        WHERE singleton = 1`,
    ).run()
  })()
}

export function setRollupStatus(
  db: Database.Database,
  status: RollupState['status'],
  error: string | null = null,
): void {
  db.prepare(
    `UPDATE overview_rollup_state SET status = ?, last_error = ? WHERE singleton = 1`,
  ).run(status, error)
}
