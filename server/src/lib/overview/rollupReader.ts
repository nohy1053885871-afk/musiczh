import type Database from 'better-sqlite3'
import { parseUA } from '../ua.js'
import { buildSteps, combinationsFromVisitors, DAY_BUCKET_SQL, DAY_MS, dayBucket } from './shared.js'
import {
  type DailyMetrics,
  type DailyVisitor,
} from './rollupWriter.js'
import type { BundleRequest, OverviewBundle, OverviewMetric, OverviewStats } from './types.js'

const METRIC_KEYS: OverviewMetric[] = [
  'pv', 'uv', 'upload_uv', 'download_uv',
  'upload_files', 'decrypt_done', 'decrypt_fail', 'transcode_fail',
]

function splitRange(from: number, to: number) {
  const startDay = dayBucket(from)
  const endDay = dayBucket(to)
  const fullStart = from <= startDay ? startDay : startDay + DAY_MS
  const fullEnd = to >= endDay + DAY_MS - 1 ? endDay + DAY_MS : endDay
  return fullEnd > fullStart
    ? { fullStart, fullEnd }
    : { fullStart: 0, fullEnd: 0 }
}

function boundaryFilter(
  request: BundleRequest,
  fullStart: number,
  fullEnd: number,
): { sql: string; params: number[] } {
  const hasFullDays = fullEnd > fullStart
  const boundary = hasFullDays ? 'AND (ts < ? OR ts >= ?)' : ''
  const max = request.maxEventId == null ? '' : 'AND id <= ?'
  const params = [request.from, request.to]
  if (hasFullDays) params.push(fullStart, fullEnd)
  if (request.maxEventId != null) params.push(request.maxEventId)
  return { sql: `ts >= ? AND ts <= ? ${boundary} ${max}`, params }
}

function rawBoundaryMetrics(
  db: Database.Database,
  request: BundleRequest,
  fullStart: number,
  fullEnd: number,
): DailyMetrics[] {
  const filter = boundaryFilter(request, fullStart, fullEnd)
  return db.prepare(
    `SELECT ${DAY_BUCKET_SQL} AS day,
       SUM(event = 'pageview') AS pv,
       SUM(event IN ('upload_attempt','upload_reject')) AS upload_files,
       COALESCE(SUM(CASE WHEN event IN ('upload_drop','upload_pick')
         THEN CAST(json_extract(props,'$.count') AS INTEGER) ELSE 0 END), 0) AS upload_files_legacy,
       SUM(event = 'upload_reject' AND COALESCE(json_extract(props,'$.reject_reason'),'') != 'LARGE_BATCH_DISMISSED') AS upload_reject,
       SUM(event = 'upload_reject' AND json_extract(props,'$.reject_reason') = 'LARGE_BATCH_DISMISSED') AS dismissed_files,
       SUM(event = 'decrypt_done') AS decrypt_done,
       SUM(event = 'decrypt_fail') AS decrypt_fail,
       SUM(event = 'transcode_done') AS transcode_done,
       SUM(event = 'transcode_fail') AS transcode_fail,
       SUM(event = 'transcode_done' AND json_extract(props,'$.source') IS NULL) AS raw_transcode_done,
       SUM(event = 'transcode_fail' AND json_extract(props,'$.source') IS NULL) AS raw_transcode_fail,
       SUM(event = 'decrypt_abandon') AS decrypt_abandon,
       SUM(event = 'transcode_abandon') AS transcode_abandon,
       SUM(event = 'upload_attempt' AND file_id IS NULL) AS legacy_files,
       SUM(event = 'download_done') AS download_done
     FROM events WHERE ${filter.sql} GROUP BY day`,
  ).all(...filter.params) as DailyMetrics[]
}

function rawBoundaryVisitors(
  db: Database.Database,
  request: BundleRequest,
  fullStart: number,
  fullEnd: number,
): DailyVisitor[] {
  const filter = boundaryFilter(request, fullStart, fullEnd)
  const params = [...filter.params, ...filter.params]
  const rows = db.prepare(
    `WITH activity AS (
       SELECT ${DAY_BUCKET_SQL} AS day, visitor_id,
         MAX(event = 'pageview') AS has_pageview,
         MAX(event IN ('upload_drop','upload_pick','upload_attempt','upload_reject')) AS has_upload,
         MAX(event = 'decrypt_done' OR
             (event = 'transcode_done' AND json_extract(props,'$.source') IS NULL)) AS has_convert,
         MAX(event IN ('row_download_click','btn_download_all_click','btn_download_zip_click',
                       'download_done','download_fail')) AS has_download
       FROM events WHERE ${filter.sql} GROUP BY day, visitor_id
     ), latest_ua AS (
       SELECT ${DAY_BUCKET_SQL} AS day, visitor_id, ts, ua,
         ROW_NUMBER() OVER (PARTITION BY ${DAY_BUCKET_SQL}, visitor_id ORDER BY ts DESC, id DESC) AS rn
       FROM events WHERE ${filter.sql} AND ua IS NOT NULL
     )
     SELECT a.*, COALESCE(l.ts, 0) AS last_ts, l.ua
       FROM activity a
       LEFT JOIN latest_ua l ON l.day = a.day AND l.visitor_id = a.visitor_id AND l.rn = 1`,
  ).all(...params) as Array<Omit<DailyVisitor, 'browser' | 'os' | 'device_type' | 'has_ua'> & { ua: string | null }>
  return rows.map((row) => {
    const device = parseUA(row.ua)
    return { ...row, ...device, has_ua: row.ua ? 1 : 0 }
  })
}

function mergeMetrics(target: DailyMetrics, source: DailyMetrics): void {
  for (const key of Object.keys(target) as Array<keyof DailyMetrics>) {
    if (key !== 'day') (target[key] as number) += source[key] as number
  }
}

function emptyMetrics(day: number): DailyMetrics {
  return {
    day, pv: 0, upload_files: 0, upload_files_legacy: 0, upload_reject: 0,
    dismissed_files: 0, decrypt_done: 0, decrypt_fail: 0, transcode_done: 0,
    transcode_fail: 0, raw_transcode_done: 0, raw_transcode_fail: 0,
    decrypt_abandon: 0, transcode_abandon: 0, legacy_files: 0, download_done: 0,
  }
}

function mergeVisitor(target: DailyVisitor, source: DailyVisitor): void {
  target.has_pageview = Math.max(target.has_pageview, source.has_pageview)
  target.has_upload = Math.max(target.has_upload, source.has_upload)
  target.has_convert = Math.max(target.has_convert, source.has_convert)
  target.has_download = Math.max(target.has_download, source.has_download)
  target.has_ua = Math.max(target.has_ua, source.has_ua)
  if (source.has_ua && source.last_ts >= target.last_ts) {
    target.last_ts = source.last_ts
    target.browser = source.browser
    target.os = source.os
    target.device_type = source.device_type
  }
}

function statsFrom(
  request: BundleRequest,
  totals: DailyMetrics,
  visitors: Map<string, DailyVisitor>,
  states: Record<string, number>,
): OverviewStats {
  let uv = 0; let uploadUv = 0; let downloadUv = 0
  for (const visitor of visitors.values()) {
    uv += visitor.has_pageview
    uploadUv += visitor.has_upload
    downloadUv += visitor.has_download
  }
  const decryptTotal = totals.decrypt_done + totals.decrypt_fail
  const transcodeTotal = totals.transcode_done + totals.transcode_fail
  return {
    range: request.range, from: request.from, to: request.to,
    pv: totals.pv, uv, upload_uv: uploadUv, download_uv: downloadUv,
    upload_files: totals.upload_files, dismissed_files: totals.dismissed_files,
    confirmed_upload_files: totals.upload_files - totals.dismissed_files,
    upload_files_legacy: totals.upload_files_legacy,
    decrypt_done: totals.decrypt_done, decrypt_fail: totals.decrypt_fail,
    decrypt_success_rate: decryptTotal ? totals.decrypt_done / decryptTotal : null,
    transcode_done: totals.transcode_done, transcode_fail: totals.transcode_fail,
    transcode_success_rate: transcodeTotal ? totals.transcode_done / transcodeTotal : null,
    convert_done: totals.decrypt_done + totals.raw_transcode_done,
    raw_flac_transcode_done: totals.raw_transcode_done,
    raw_flac_transcode_fail: totals.raw_transcode_fail,
    upload_reject: totals.upload_reject,
    decrypt_abandon: totals.decrypt_abandon, transcode_abandon: totals.transcode_abandon,
    abandon_total: totals.decrypt_abandon + totals.transcode_abandon,
    pending_files: states.pending ?? 0, legacy_files: totals.legacy_files,
    success_files: states.success ?? 0, failed_files: states.failed ?? 0,
    abandoned_files: states.abandoned ?? 0,
  }
}

export function computeRollupBundle(
  db: Database.Database,
  request: BundleRequest,
  rollupLagMs: number,
): OverviewBundle {
  const started = performance.now()
  const queryStarted = performance.now()
  const { fullStart, fullEnd } = splitRange(request.from, request.to)
  const dayMetrics = new Map<number, DailyMetrics>()
  const dayVisitors: DailyVisitor[] = []

  if (fullEnd > fullStart) {
    const metricRows = db.prepare(
      `SELECT * FROM overview_daily_metrics WHERE day >= ? AND day < ? ORDER BY day`,
    ).all(fullStart, fullEnd) as DailyMetrics[]
    for (const row of metricRows) dayMetrics.set(row.day, { ...row })
    dayVisitors.push(...db.prepare(
      `SELECT * FROM overview_daily_visitors WHERE day >= ? AND day < ?`,
    ).all(fullStart, fullEnd) as DailyVisitor[])
  }

  const boundaryMetrics = rawBoundaryMetrics(db, request, fullStart, fullEnd)
  for (const row of boundaryMetrics) {
    const current = dayMetrics.get(row.day) ?? emptyMetrics(row.day)
    mergeMetrics(current, row)
    dayMetrics.set(row.day, current)
  }
  dayVisitors.push(...rawBoundaryVisitors(db, request, fullStart, fullEnd))

  const visitors = new Map<string, DailyVisitor>()
  for (const row of dayVisitors) {
    const current = visitors.get(row.visitor_id)
    if (current) mergeVisitor(current, row)
    else visitors.set(row.visitor_id, { ...row })
  }

  const totals = emptyMetrics(0)
  for (const row of dayMetrics.values()) mergeMetrics(totals, row)
  const states = Object.fromEntries((db.prepare(
    `SELECT status, COUNT(*) AS n FROM overview_file_upload_state
      WHERE upload_ts >= ? AND upload_ts <= ? GROUP BY status`,
  ).all(request.from, request.to) as Array<{ status: string; n: number }>).map((row) => [row.status, row.n]))
  const queryMs = performance.now() - queryStarted
  const overview = statsFrom(request, totals, visitors, states)

  let convertUv = 0
  for (const visitor of visitors.values()) convertUv += visitor.has_convert
  const funnel = {
    range: request.range, from: request.from, to: request.to,
    user: { steps: buildSteps([
      { name: '访问', n: overview.uv }, { name: '上传', n: overview.upload_uv },
      { name: '转换成功', n: convertUv }, { name: '下载', n: overview.download_uv },
    ]) },
    file: { steps: buildSteps([
      { name: '上传总数', n: overview.upload_files },
      { name: '确认上传', n: overview.confirmed_upload_files },
      { name: '转换成功', n: overview.convert_done },
      { name: '下载', n: totals.download_done },
    ]) },
  }

  const visitorsByDay = new Map<number, { uv: number; upload_uv: number; download_uv: number }>()
  for (const visitor of dayVisitors) {
    const slot = visitorsByDay.get(visitor.day) ?? { uv: 0, upload_uv: 0, download_uv: 0 }
    slot.uv += visitor.has_pageview
    slot.upload_uv += visitor.has_upload
    slot.download_uv += visitor.has_download
    visitorsByDay.set(visitor.day, slot)
  }
  const days = [...new Set([...dayMetrics.keys(), ...visitorsByDay.keys()])].sort((a, b) => a - b)
  const timeseries = Object.fromEntries(METRIC_KEYS.map((metric) => [
    metric,
    days.map((day) => {
      const metricRow = dayMetrics.get(day) ?? emptyMetrics(day)
      const visitorRow = visitorsByDay.get(day) ?? { uv: 0, upload_uv: 0, download_uv: 0 }
      const value = metric === 'uv' || metric === 'upload_uv' || metric === 'download_uv'
        ? visitorRow[metric]
        : metricRow[metric]
      return { day, v: value }
    }),
  ])) as OverviewBundle['timeseries']

  const deviceStarted = performance.now()
  const combinations = combinationsFromVisitors(
    [...visitors.values()].filter((visitor) => visitor.has_ua),
  )
  const deviceMs = performance.now() - deviceStarted
  console.log(JSON.stringify({
    type: 'overview_bundle_compute', source: 'rollup', range: request.range,
    boundary_days: boundaryMetrics.length, visitor_days: dayVisitors.length,
    query_ms: Math.round(queryMs), devices_ms: Math.round(deviceMs),
    total_ms: Math.round(performance.now() - started), rollup_lag_ms: rollupLagMs,
  }))
  return {
    range: request.range, from: request.from, to: request.to,
    generated_at: Date.now(), data_source: 'rollup', rollup_lag_ms: rollupLagMs,
    overview, funnel, timeseries,
    devices: { combinations },
  }
}
