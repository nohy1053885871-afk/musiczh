import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { parseUA } from '../lib/ua.js'
import { parseTimeRange } from '../lib/timeRange.js'

// 启动时算一次本地时区相对 UTC 的偏移（ms）。
// SQLite 没有时区函数，纯 ts/86400000 切桶按 UTC 0 点切，
// 但 parseTimeRange.startOfTodayMs() 用的是本地时区今日 0 点 → 与 overview 卡片口径错位
// （北京 UTC+8 时，今日的前 8 小时数据被错切到「UTC 昨日」桶，图表与卡片对不上）。
// 在 ts 上 +TZ_OFFSET_MS 再 /86400000 整除，最后再 -TZ_OFFSET_MS 还原回真实 ts，
// 即可让 GROUP BY 桶按「本地时区当日 0 点」对齐。中国不切 DST，启动时算一次足矣。
const TZ_OFFSET_MS = -new Date().getTimezoneOffset() * 60_000

// SQL 片段：把 ts（UTC ms）切到本地时区当日 0 点的 ts
const DAY_BUCKET_SQL = `((ts + ${TZ_OFFSET_MS}) / 86400000) * 86400000 - ${TZ_OFFSET_MS}`

const adminStats = new Hono()

adminStats.use('*', requireAdmin)

// 概览：人维度 / 件维度 8+ 个核心指标
adminStats.get('/overview', (c) => {
  const { from, to, range } = parseTimeRange(c)

  const cnt = (sql: string, ...params: any[]) =>
    (db.prepare(sql).get(from, to, ...params) as { n: number }).n

  const pv = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'pageview'")
  const uv = cnt("SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'pageview'")
  // UV 口径与下方 funnel 一致：上传含被拒（含老 drop/pick + 新 attempt/reject）；下载含失败（含老 click + 新 done/fail）
  const uploadUv = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick','upload_attempt','upload_reject')",
  )
  const downloadUv = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event IN ('row_download_click','btn_download_all_click','btn_download_zip_click','download_done','download_fail')",
  )
  // 「上传文件总数」口径
  // 历史：用 SUM(upload_drop/pick.count)，但 drop/pick 是动作事件，部分路径（剪贴板、API）漏埋导致总数偏低
  // v0.4.1 起改用 file 级事件求和：upload_attempt（进队列）+ upload_reject（被拒），跟卡片 6 段拆解的语义严格自洽
  // upload_attempt + upload_reject 这两个事件 v0.3 起每个文件都发，覆盖 100% 路径
  const uploadFiles = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ? AND event IN ('upload_attempt','upload_reject')`,
  )
  // 上传校验拒（格式 / 大小 / 队列上限），每个被拒文件一条
  const uploadReject = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'upload_reject'")
  const decryptDone = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_done'")
  const decryptFail = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_fail'")
  const transcodeDone = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'transcode_done'")
  const transcodeFail = cnt("SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'transcode_fail'")
  // 「转换成功」= 解密成功（件） + 原始 .flac 直接转码成功（件）
  // 原始 flac 上传时 transcode_done 不带 source；解密产物再转码会带 source=ncm/kgm/vpr
  // 这样同一个文件「先解密再转码」只算一次，避免双计数
  const rawFlacTranscodeDone = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ?
         AND event = 'transcode_done'
         AND json_extract(props,'$.source') IS NULL`,
  )
  // 原 flac 上传转码失败件数（用于「上传文件总数」卡的拆分小字 + tooltip）
  const rawFlacTranscodeFail = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ?
         AND event = 'transcode_fail'
         AND json_extract(props,'$.source') IS NULL`,
  )
  const convertDone = decryptDone + rawFlacTranscodeDone

  // v0.4.1 新增「中止 / 未完成 / 历史」三段，重梳「上传文件总数」卡片拆分小字
  // 中止 = pagehide 时仍在 inflight 的文件（auto-FLAC OOM / 用户关页 / 切后台被杀）
  const decryptAbandon = cnt(
    "SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_abandon'",
  )
  const transcodeAbandon = cnt(
    "SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'transcode_abandon'",
  )
  // 未完成 = upload_attempt 有 file_id 但无任何下游事件（含 done / fail / abandon）
  // 这是埋点 SDK 没兜住的边界 case：JS 主线程异常 / 网络丢包 / pagehide 之外的销毁路径
  const pendingFiles = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ?
         AND event = 'upload_attempt'
         AND file_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM events d WHERE d.file_id = events.file_id
             AND d.event IN ('decrypt_done','decrypt_fail','decrypt_abandon',
                             'transcode_done','transcode_fail','transcode_abandon')
         )`,
  )
  // 历史 = v0.4.1 之前的 upload_attempt 事件，无 file_id 无法关联，单独标识
  const legacyFiles = cnt(
    "SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'upload_attempt' AND file_id IS NULL",
  )

  // 6 段拆解口径（按 file_id 关联 upload_attempt 的下游状态，保证加和 = upload_attempt 总数）
  // success/failed/abandoned/pending/legacy 互斥；加 upload_reject 后 = upload_files
  const successFiles = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ?
         AND event = 'upload_attempt' AND file_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM events d WHERE d.file_id = events.file_id
             AND d.event IN ('decrypt_done','transcode_done')
         )`,
  )
  const failedFiles = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ?
         AND event = 'upload_attempt' AND file_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM events d WHERE d.file_id = events.file_id
             AND d.event IN ('decrypt_fail','transcode_fail')
         )
         AND NOT EXISTS (
           SELECT 1 FROM events d WHERE d.file_id = events.file_id
             AND d.event IN ('decrypt_done','transcode_done')
         )`,
  )
  const abandonedFiles = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ?
         AND event = 'upload_attempt' AND file_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM events d WHERE d.file_id = events.file_id
             AND d.event IN ('decrypt_abandon','transcode_abandon')
         )
         AND NOT EXISTS (
           SELECT 1 FROM events d WHERE d.file_id = events.file_id
             AND d.event IN ('decrypt_done','decrypt_fail','transcode_done','transcode_fail')
         )`,
  )

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
    convert_done: convertDone,
    raw_flac_transcode_done: rawFlacTranscodeDone,
    raw_flac_transcode_fail: rawFlacTranscodeFail,
    upload_reject: uploadReject,
    // v0.4.1 新增字段（admin Overview 卡片拆分小字消费）
    decrypt_abandon: decryptAbandon,
    transcode_abandon: transcodeAbandon,
    abandon_total: decryptAbandon + transcodeAbandon,
    pending_files: pendingFiles,
    legacy_files: legacyFiles,
    // 6 段拆解口径：按 file_id 关联，加和 = upload_attempt 总数；再加 upload_reject = upload_files
    success_files: successFiles,
    failed_files: failedFiles,
    abandoned_files: abandonedFiles,
  })
})

// 漏斗：人维度 4 层（访问→上传→转换→下载） / 件维度 3 层（上传→转换→下载）
// 「上传」层含被拒文件（漏斗的诊断价值就在于看每个环节流失多少）
// 「转换成功」= decrypt_done + 原始 flac 上传 transcode_done（source 为空），避免双计数
// 兼容历史数据：旧事件 upload_drop/upload_pick + *_download_click 也计入对应层
adminStats.get('/funnel', (c) => {
  const { from, to, range } = parseTimeRange(c)
  const cnt = (sql: string) => (db.prepare(sql).get(from, to) as { n: number }).n

  // 人维度（UV）
  const userVisit = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'pageview'",
  )
  const userUpload = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_attempt','upload_reject','upload_drop','upload_pick')",
  )
  // 「转换成功」层口径 = decrypt_done + 原始 flac 上传转码成功（transcode_done 且 source 为空）
  // 同一个文件先解密再转码不会被双计数：解密产物的 transcode_done 带 source=ncm/kgm/vpr，会被排除
  const userDecrypt = cnt(
    `SELECT COUNT(DISTINCT visitor_id) AS n FROM events
       WHERE ts >= ? AND ts <= ?
         AND ( event = 'decrypt_done'
            OR (event = 'transcode_done' AND json_extract(props,'$.source') IS NULL) )`,
  )
  const userDownload = cnt(
    "SELECT COUNT(DISTINCT visitor_id) AS n FROM events WHERE ts >= ? AND ts <= ? AND event IN ('download_done','download_fail','row_download_click','btn_download_all_click','btn_download_zip_click')",
  )

  // 件维度（文件数）
  // 上传层：用 SUM(upload_drop/pick.count) 而不是 COUNT(upload_attempt)，因为前者
  //   1) 含被拒文件（drop/pick 在校验前发，count 是总文件数）
  //   2) 兼容 v0.3 之前没有 upload_attempt 的历史数据
  // 与 overview 卡片「上传文件总数」同一公式，避免对不上
  const fileUpload = cnt(
    `SELECT COALESCE(SUM(CAST(json_extract(props,'$.count') AS INTEGER)), 0) AS n
       FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick')`,
  )
  const fileDecrypt = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ?
         AND ( event = 'decrypt_done'
            OR (event = 'transcode_done' AND json_extract(props,'$.source') IS NULL) )`,
  )
  const fileDownload = cnt(
    "SELECT COUNT(*) AS n FROM events WHERE ts >= ? AND ts <= ? AND event = 'download_done'",
  )

  const buildSteps = (raw: { name: string; n: number }[]) => {
    const first = raw[0]?.n ?? 0
    return raw.map((r, i) => {
      const prev = i === 0 ? r.n : raw[i - 1].n
      return {
        name: r.name,
        n: r.n,
        // 兼容老前端字段（dim=user 时仍是 UV，dim=file 时是文件数）
        uv: r.n,
        pct_of_prev: prev > 0 ? r.n / prev : null,
        pct_of_first: first > 0 ? r.n / first : null,
      }
    })
  }

  return c.json({
    range,
    from,
    to,
    user: {
      steps: buildSteps([
        { name: '访问', n: userVisit },
        { name: '上传', n: userUpload },
        { name: '转换成功', n: userDecrypt },
        { name: '下载', n: userDownload },
      ]),
    },
    file: {
      steps: buildSteps([
        { name: '上传', n: fileUpload },
        { name: '转换成功', n: fileDecrypt },
        { name: '下载', n: fileDownload },
      ]),
    },
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
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'pageview'
             GROUP BY day ORDER BY day`
      break
    case 'uv':
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(DISTINCT visitor_id) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'pageview'
             GROUP BY day ORDER BY day`
      break
    case 'upload_uv':
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(DISTINCT visitor_id) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick')
             GROUP BY day ORDER BY day`
      break
    case 'download_uv':
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(DISTINCT visitor_id) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event IN ('row_download_click','btn_download_all_click','btn_download_zip_click')
             GROUP BY day ORDER BY day`
      break
    case 'upload_files':
      sql = `SELECT ${DAY_BUCKET_SQL} AS day,
                    COALESCE(SUM(CAST(json_extract(props,'$.count') AS INTEGER)),0) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick')
             GROUP BY day ORDER BY day`
      break
    case 'decrypt_done':
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_done'
             GROUP BY day ORDER BY day`
      break
    case 'decrypt_fail':
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'decrypt_fail'
             GROUP BY day ORDER BY day`
      break
    case 'transcode_done':
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'transcode_done'
             GROUP BY day ORDER BY day`
      break
    case 'transcode_fail':
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ? AND event = 'transcode_fail'
             GROUP BY day ORDER BY day`
      break
  }
  const rows = db.prepare(sql!).all(from, to) as { day: number; v: number }[]
  return c.json({ range, from, to, metric: metric.data, points: rows })
})

// 文件格式分布：按 file_ext 聚合解密总数 / 成功 / 失败
adminStats.get('/format-distribution', (c) => {
  const { from, to, range } = parseTimeRange(c)

  const rows = db
    .prepare(
      `SELECT json_extract(props,'$.file_ext') AS ext,
              SUM(CASE WHEN event = 'decrypt_done' THEN 1 ELSE 0 END) AS success,
              SUM(CASE WHEN event = 'decrypt_fail' THEN 1 ELSE 0 END) AS fail
         FROM events
        WHERE ts >= ? AND ts <= ?
          AND event IN ('decrypt_done','decrypt_fail')
          AND json_extract(props,'$.file_ext') IS NOT NULL
        GROUP BY ext
        ORDER BY (success + fail) DESC`,
    )
    .all(from, to) as Array<{ ext: string | null; success: number; fail: number }>

  const result = rows.map((r) => ({
    ext: r.ext,
    success: r.success ?? 0,
    fail: r.fail ?? 0,
    total: (r.success ?? 0) + (r.fail ?? 0),
  }))

  return c.json({ range, from, to, rows: result })
})

// 访问设备环境：按 visitor_id 去重后再分桶
adminStats.get('/devices', (c) => {
  const { from, to, range } = parseTimeRange(c)

  const rows = db
    .prepare(
      `SELECT visitor_id, ua FROM events
        WHERE ts >= ? AND ts <= ?
          AND ua IS NOT NULL
        GROUP BY visitor_id`,
    )
    .all(from, to) as Array<{ visitor_id: string; ua: string }>

  const visitors = rows.map((r) => parseUA(r.ua))

  const browserMap = new Map<string, number>()
  const osMap = new Map<string, number>()
  const deviceMap = new Map<string, number>()
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  for (const v of visitors) {
    inc(browserMap, v.browser)
    inc(osMap, v.os)
    inc(deviceMap, v.device_type)
  }
  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))

  return c.json({
    range,
    from,
    to,
    browsers: sortDesc(browserMap),
    os: sortDesc(osMap),
    device_types: sortDesc(deviceMap),
    visitors,
  })
})

export default adminStats
