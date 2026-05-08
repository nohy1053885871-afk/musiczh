import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'

const RangePresetSchema = z.enum(['today', '7d', '30d', '90d', '365d'])

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// 解析 range：优先 from/to（自定义）；其次 range 预设；默认 30d
function parseTimeRange(c: any): { from: number; to: number; range: string } {
  const fromQ = c.req.query('from')
  const toQ = c.req.query('to')
  if (fromQ || toQ) {
    const from = Number(fromQ ?? 0)
    const to = Number(toQ ?? Date.now())
    if (Number.isFinite(from) && Number.isFinite(to) && from <= to) {
      return { from, to, range: 'custom' }
    }
  }
  const raw = c.req.query('range') ?? '30d'
  const r = RangePresetSchema.safeParse(raw)
  const preset = r.success ? r.data : '30d'
  const now = Date.now()
  let from = now
  if (preset === 'today') from = startOfTodayMs()
  else {
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 365
    from = now - days * 86_400_000
  }
  return { from, to: now, range: preset }
}

const adminStats = new Hono()

adminStats.use('*', requireAdmin)

// 概览：人维度 / 件维度 8+ 个核心指标
adminStats.get('/overview', (c) => {
  const { from, to, range } = parseTimeRange(c)

  const cnt = (sql: string, ...params: any[]) =>
    (db.prepare(sql).get(from, to, ...params) as { n: number }).n

  const pv = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'pageview'")
  const uv = cnt("SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'pageview'")
  const uploadUv = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick')",
  )
  const downloadUv = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event IN ('row_download_click','btn_download_all_click','btn_download_zip_click')",
  )
  const uploadFiles = cnt(
    `SELECT COALESCE(SUM(CAST(json_extract(props,'$.count') AS INTEGER)), 0) AS n
       FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick')`,
  )
  const decryptDone = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_done'")
  const decryptFail = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_fail'")
  const transcodeDone = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'transcode_done'")
  const transcodeFail = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'transcode_fail'")

  return c.json({
    range,
    from,
    to,
    pv,
    uv,
    upload_uv: uploadUv,
    download_uv: downloadUv,
    upload_files: uploadFiles,
    decrypt_done: decryptDone,
    decrypt_fail: decryptFail,
    decrypt_success_rate:
      decryptDone + decryptFail > 0 ? decryptDone / (decryptDone + decryptFail) : null,
    transcode_done: transcodeDone,
    transcode_fail: transcodeFail,
    transcode_success_rate:
      transcodeDone + transcodeFail > 0 ? transcodeDone / (transcodeDone + transcodeFail) : null,
  })
})

// 漏斗：上传(人) → 解密成功(人) → 下载(人)
adminStats.get('/funnel', (c) => {
  const { from, to, range } = parseTimeRange(c)
  const cnt = (sql: string) => (db.prepare(sql).get(from, to) as { n: number }).n

  const uploaded = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick')",
  )
  const decrypted = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_done'",
  )
  const downloaded = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event IN ('row_download_click','btn_download_all_click','btn_download_zip_click')",
  )

  return c.json({
    range,
    from,
    to,
    steps: [
      { name: '上传', uv: uploaded },
      { name: '解密成功', uv: decrypted },
      { name: '下载', uv: downloaded },
    ],
  })
})

// 按钮 曝光 / 点击 PV / UV
adminStats.get('/buttons', (c) => {
  const { from, to, range } = parseTimeRange(c)

  const rows = db
    .prepare(
      `SELECT event,
              COUNT(*) AS pv,
              COUNT(DISTINCT visitor_id) AS uv
         FROM events
        WHERE ts >= ? AND ts <= ?
          AND (SUBSTR(event, -6) = '_click' OR SUBSTR(event, -5) = '_view')
        GROUP BY event
        ORDER BY pv DESC`,
    )
    .all(from, to) as { event: string; pv: number; uv: number }[]

  const byBase = new Map<
    string,
    { base: string; click_pv: number; click_uv: number; view_pv: number; view_uv: number }
  >()
  for (const r of rows) {
    const isClick = r.event.endsWith('_click')
    const base = r.event.replace(/_(click|view)$/, '')
    const slot = byBase.get(base) ?? {
      base, click_pv: 0, click_uv: 0, view_pv: 0, view_uv: 0,
    }
    if (isClick) { slot.click_pv = r.pv; slot.click_uv = r.uv }
    else { slot.view_pv = r.pv; slot.view_uv = r.uv }
    byBase.set(base, slot)
  }

  const buttons = [...byBase.values()].map((b) => ({
    ...b,
    ctr: b.view_pv > 0 ? b.click_pv / b.view_pv : null,
    ctr_uv: b.view_uv > 0 ? b.click_uv / b.view_uv : null,
  })).sort((a, b) => b.click_pv - a.click_pv)

  return c.json({ range, from, to, buttons, raw: rows })
})

// 折线图：8 个核心指标按天聚合，metric 可单选
const MetricSchema = z.enum([
  'pv', 'uv',
  'upload_uv', 'download_uv', 'upload_files',
  'decrypt_done', 'decrypt_fail',
  'transcode_done', 'transcode_fail',
])

adminStats.get('/timeseries', (c) => {
  const { from, to, range } = parseTimeRange(c)
  const metric = MetricSchema.safeParse(c.req.query('metric') ?? 'pv')
  if (!metric.success) return c.json({ error: 'invalid_metric' }, 400)

  let sql: string
  switch (metric.data) {
    case 'pv':
      sql = `SELECT (ts/86400000)*86400000 AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'pageview'
             GROUP BY day ORDER BY day`
      break
    case 'uv':
      sql = `SELECT (ts/86400000)*86400000 AS day, COUNT(DISTINCT visitor_id) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'pageview'
             GROUP BY day ORDER BY day`
      break
    case 'upload_uv':
      sql = `SELECT (ts/86400000)*86400000 AS day, COUNT(DISTINCT visitor_id) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick')
             GROUP BY day ORDER BY day`
      break
    case 'download_uv':
      sql = `SELECT (ts/86400000)*86400000 AS day, COUNT(DISTINCT visitor_id) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event IN ('row_download_click','btn_download_all_click','btn_download_zip_click')
             GROUP BY day ORDER BY day`
      break
    case 'upload_files':
      sql = `SELECT (ts/86400000)*86400000 AS day,
                    COALESCE(SUM(CAST(json_extract(props,'$.count') AS INTEGER)),0) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick')
             GROUP BY day ORDER BY day`
      break
    case 'decrypt_done':
      sql = `SELECT (ts/86400000)*86400000 AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_done'
             GROUP BY day ORDER BY day`
      break
    case 'decrypt_fail':
      sql = `SELECT (ts/86400000)*86400000 AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_fail'
             GROUP BY day ORDER BY day`
      break
    case 'transcode_done':
      sql = `SELECT (ts/86400000)*86400000 AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'transcode_done'
             GROUP BY day ORDER BY day`
      break
    case 'transcode_fail':
      sql = `SELECT (ts/86400000)*86400000 AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'transcode_fail'
             GROUP BY day ORDER BY day`
      break
  }
  const rows = db.prepare(sql!).all(from, to) as { day: number; v: number }[]
  return c.json({ range, from, to, metric: metric.data, points: rows })
})

export default adminStats
