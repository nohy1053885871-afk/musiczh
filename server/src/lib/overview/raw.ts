import type Database from 'better-sqlite3'
import { parseUA } from '../ua.js'
import { buildSteps, combinationsFromVisitors, DAY_BUCKET_SQL } from './shared.js'
import type { BundleRequest, OverviewBundle, OverviewMetric, OverviewStats } from './types.js'

type MainRow = {
  pv: number; uv: number; upload_uv: number; download_uv: number; convert_uv: number
  upload_files: number; upload_files_legacy: number; upload_reject: number; dismissed_files: number
  decrypt_done: number; decrypt_fail: number; transcode_done: number; transcode_fail: number
  raw_transcode_done: number; raw_transcode_fail: number
  decrypt_abandon: number; transcode_abandon: number; legacy_files: number; download_done: number
}

type StateRow = { success: number; failed: number; abandoned: number; pending: number }
type TrendRow = Record<OverviewMetric, number> & { day: number }
type RawStatements = {
  main: Database.Statement; mainMax: Database.Statement
  states: Database.Statement; statesMax: Database.Statement
  trend: Database.Statement; trendMax: Database.Statement
  devices: Database.Statement; devicesMax: Database.Statement
}

const statementCache = new WeakMap<object, RawStatements>()

const UPLOAD_EVENTS = "'upload_drop','upload_pick','upload_attempt','upload_reject'"
const DOWNLOAD_EVENTS = "'row_download_click','btn_download_all_click','btn_download_zip_click','download_done','download_fail'"

function buildMainSql(withMaxId: boolean): string {
  const max = withMaxId ? 'AND id <= ?' : ''
  return `SELECT
    SUM(event = 'pageview') AS pv,
    COUNT(DISTINCT CASE WHEN event = 'pageview' THEN visitor_id END) AS uv,
    COUNT(DISTINCT CASE WHEN event IN (${UPLOAD_EVENTS}) THEN visitor_id END) AS upload_uv,
    COUNT(DISTINCT CASE WHEN event IN (${DOWNLOAD_EVENTS}) THEN visitor_id END) AS download_uv,
    COUNT(DISTINCT CASE WHEN event = 'decrypt_done'
      OR (event = 'transcode_done' AND json_extract(props,'$.source') IS NULL)
      THEN visitor_id END) AS convert_uv,
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
  FROM events WHERE ts >= ? AND ts <= ? ${max}`
}

function buildStateSql(withMaxId: boolean): string {
  const outerMax = withMaxId ? 'AND id <= ?' : ''
  const innerMax = withMaxId ? 'AND d.id <= ?' : ''
  return `WITH uploads AS (
    SELECT id, file_id FROM events
    WHERE ts >= ? AND ts <= ? ${outerMax}
      AND event = 'upload_attempt' AND file_id IS NOT NULL
  ), flags AS (
    SELECT u.id,
      COALESCE(MAX(d.event IN ('decrypt_done','transcode_done')), 0) AS has_done,
      COALESCE(MAX(d.event IN ('decrypt_fail','transcode_fail')), 0) AS has_fail,
      COALESCE(MAX(d.event IN ('decrypt_abandon','transcode_abandon')), 0) AS has_abandon
    FROM uploads u
    LEFT JOIN events d ON d.file_id = u.file_id ${innerMax}
      AND d.event IN ('decrypt_done','transcode_done','decrypt_fail','transcode_fail',
                      'decrypt_abandon','transcode_abandon')
    GROUP BY u.id
  )
  SELECT
    COALESCE(SUM(has_done = 1), 0) AS success,
    COALESCE(SUM(has_done = 0 AND has_fail = 1), 0) AS failed,
    COALESCE(SUM(has_done = 0 AND has_fail = 0 AND has_abandon = 1), 0) AS abandoned,
    COALESCE(SUM(has_done = 0 AND has_fail = 0 AND has_abandon = 0), 0) AS pending
  FROM flags`
}

function buildTrendSql(withMaxId: boolean): string {
  const max = withMaxId ? 'AND id <= ?' : ''
  return `SELECT ${DAY_BUCKET_SQL} AS day,
    SUM(event = 'pageview') AS pv,
    COUNT(DISTINCT CASE WHEN event = 'pageview' THEN visitor_id END) AS uv,
    COUNT(DISTINCT CASE WHEN event IN (${UPLOAD_EVENTS}) THEN visitor_id END) AS upload_uv,
    COUNT(DISTINCT CASE WHEN event IN (${DOWNLOAD_EVENTS}) THEN visitor_id END) AS download_uv,
    SUM(event IN ('upload_attempt','upload_reject')) AS upload_files,
    SUM(event = 'decrypt_done') AS decrypt_done,
    SUM(event = 'decrypt_fail') AS decrypt_fail,
    SUM(event = 'transcode_fail') AS transcode_fail
  FROM events WHERE ts >= ? AND ts <= ? ${max}
  GROUP BY day ORDER BY day`
}

function buildDevicesSql(withMaxId: boolean): string {
  const max = withMaxId ? 'AND id <= ?' : ''
  return `WITH ranked AS (
    SELECT visitor_id, ua,
      ROW_NUMBER() OVER (PARTITION BY visitor_id ORDER BY ts DESC, id DESC) AS rn
    FROM events WHERE ts >= ? AND ts <= ? ${max} AND ua IS NOT NULL
  ) SELECT visitor_id, ua FROM ranked WHERE rn = 1`
}

function n(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

function statementsFor(db: Database.Database): RawStatements {
  const cached = statementCache.get(db)
  if (cached) return cached
  const statements = {
    main: db.prepare(buildMainSql(false)), mainMax: db.prepare(buildMainSql(true)),
    states: db.prepare(buildStateSql(false)), statesMax: db.prepare(buildStateSql(true)),
    trend: db.prepare(buildTrendSql(false)), trendMax: db.prepare(buildTrendSql(true)),
    devices: db.prepare(buildDevicesSql(false)), devicesMax: db.prepare(buildDevicesSql(true)),
  }
  statementCache.set(db, statements)
  return statements
}

function makeOverview(request: BundleRequest, main: MainRow, states: StateRow): OverviewStats {
  const decryptTotal = n(main.decrypt_done) + n(main.decrypt_fail)
  const transcodeTotal = n(main.transcode_done) + n(main.transcode_fail)
  return {
    range: request.range, from: request.from, to: request.to,
    pv: n(main.pv), uv: n(main.uv), upload_uv: n(main.upload_uv), download_uv: n(main.download_uv),
    upload_files: n(main.upload_files), dismissed_files: n(main.dismissed_files),
    confirmed_upload_files: n(main.upload_files) - n(main.dismissed_files),
    upload_files_legacy: n(main.upload_files_legacy),
    decrypt_done: n(main.decrypt_done), decrypt_fail: n(main.decrypt_fail),
    decrypt_success_rate: decryptTotal ? n(main.decrypt_done) / decryptTotal : null,
    transcode_done: n(main.transcode_done), transcode_fail: n(main.transcode_fail),
    transcode_success_rate: transcodeTotal ? n(main.transcode_done) / transcodeTotal : null,
    convert_done: n(main.decrypt_done) + n(main.raw_transcode_done),
    raw_flac_transcode_done: n(main.raw_transcode_done),
    raw_flac_transcode_fail: n(main.raw_transcode_fail),
    upload_reject: n(main.upload_reject), decrypt_abandon: n(main.decrypt_abandon),
    transcode_abandon: n(main.transcode_abandon),
    abandon_total: n(main.decrypt_abandon) + n(main.transcode_abandon),
    pending_files: n(states.pending), legacy_files: n(main.legacy_files),
    success_files: n(states.success), failed_files: n(states.failed), abandoned_files: n(states.abandoned),
  }
}

export function computeRawBundle(db: Database.Database, request: BundleRequest): OverviewBundle {
  const started = performance.now()
  const withMaxId = request.maxEventId != null
  const statements = statementsFor(db)
  const params = withMaxId
    ? [request.from, request.to, request.maxEventId]
    : [request.from, request.to]

  const mainStarted = performance.now()
  const main = (withMaxId ? statements.mainMax : statements.main).get(...params) as MainRow
  const statesParams = withMaxId
    ? [request.from, request.to, request.maxEventId, request.maxEventId]
    : [request.from, request.to]
  const states = (withMaxId ? statements.statesMax : statements.states).get(...statesParams) as StateRow
  const aggregateMs = performance.now() - mainStarted

  const trendStarted = performance.now()
  const trendRows = (withMaxId ? statements.trendMax : statements.trend).all(...params) as TrendRow[]
  const timeseries = Object.fromEntries(
    ['pv', 'uv', 'upload_uv', 'download_uv', 'upload_files', 'decrypt_done', 'decrypt_fail', 'transcode_fail']
      .map((metric) => [metric, trendRows.map((row) => ({ day: row.day, v: n(row[metric as OverviewMetric]) }))]),
  ) as OverviewBundle['timeseries']
  const trendMs = performance.now() - trendStarted

  const deviceStarted = performance.now()
  const deviceRows = (withMaxId ? statements.devicesMax : statements.devices).all(...params) as Array<{ visitor_id: string; ua: string }>
  const combinations = combinationsFromVisitors(deviceRows.map((row) => parseUA(row.ua)))
  const deviceMs = performance.now() - deviceStarted

  const overview = makeOverview(request, main, states)
  const funnel = {
    range: request.range, from: request.from, to: request.to,
    user: { steps: buildSteps([
      { name: '访问', n: overview.uv }, { name: '上传', n: overview.upload_uv },
      { name: '转换成功', n: n(main.convert_uv) }, { name: '下载', n: overview.download_uv },
    ]) },
    file: { steps: buildSteps([
      { name: '上传总数', n: overview.upload_files },
      { name: '确认上传', n: overview.confirmed_upload_files },
      { name: '转换成功', n: overview.convert_done },
      { name: '下载', n: n(main.download_done) },
    ]) },
  }

  console.log(JSON.stringify({
    type: 'overview_bundle_compute', source: 'raw', range: request.range,
    aggregate_ms: Math.round(aggregateMs), trend_ms: Math.round(trendMs),
    devices_ms: Math.round(deviceMs), total_ms: Math.round(performance.now() - started),
  }))
  return {
    range: request.range, from: request.from, to: request.to,
    generated_at: Date.now(), data_source: 'raw', rollup_lag_ms: null,
    overview, funnel, timeseries, devices: { combinations },
  }
}
