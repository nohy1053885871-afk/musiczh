import { Hono } from 'hono'
import { z } from 'zod'
import db from '../db.js'
import { requireAdmin } from '../middleware/auth.js'
import { parseUA } from '../lib/ua.js'
import { parseTimeRange } from '../lib/timeRange.js'
import { getBrowserCompatStats } from '../lib/browserCompatStats.js'

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
  // v0.4.3 临时观察字段：保留 v0.4.0 之前的旧口径，运营后台并列展示做新旧对比
  // 1-2 月若新口径稳定收敛（即新 ≥ 旧 且偏差平稳），移除本字段 + 对应观察卡片
  const uploadFilesLegacy = cnt(
    `SELECT COALESCE(SUM(CAST(json_extract(props,'$.count') AS INTEGER)), 0) AS n
       FROM events WHERE ts >= ? AND ts <= ? AND event IN ('upload_drop','upload_pick')`,
  )
  // 上传校验拒（格式 / 大小 / 队列上限），每个被拒文件一条
  // v0.4.8 起严格被拒：剔除 LARGE_BATCH_DISMISSED（"主动取消"已独立成态，见下方 dismissedFiles）
  const uploadReject = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ? AND event = 'upload_reject'
         AND COALESCE(json_extract(props,'$.reject_reason'),'') != 'LARGE_BATCH_DISMISSED'`,
  )
  // v0.4.8 「主动取消」= 用户在 ≥50 文件警告弹窗里点「重新选择」/ ESC，前端逐文件补发的 upload_reject
  // 与"被拒"分类语义割裂：主动取消是用户行为（反悔不上传），不是上传校验失败
  const dismissedFiles = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ? AND event = 'upload_reject'
         AND json_extract(props,'$.reject_reason') = 'LARGE_BATCH_DISMISSED'`,
  )
  // 「确认上传数」= 上传总数 − 主动取消（剔除用户反悔后的真实上传件数）
  // 漏斗 file 维度第二层 / 首页同名卡片消费
  const confirmedUploadFiles = uploadFiles - dismissedFiles
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
    // v0.4.8 新增
    dismissed_files: dismissedFiles,
    confirmed_upload_files: confirmedUploadFiles,
    upload_files_legacy: uploadFilesLegacy,
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
  // 上传层口径与 overview 卡片「上传文件总数」严格一致：upload_attempt + upload_reject
  // v0.4.1 起放弃 SUM(upload_drop/pick.count)——drop/pick 是动作事件，部分路径漏埋导致总数偏低
  const fileUpload = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ? AND event IN ('upload_attempt','upload_reject')`,
  )
  // v0.4.8 「主动取消」件数：用户在 ≥50 文件警告弹窗里反悔的文件
  const fileDismissed = cnt(
    `SELECT COUNT(*) AS n FROM events
       WHERE ts >= ? AND ts <= ? AND event = 'upload_reject'
         AND json_extract(props,'$.reject_reason') = 'LARGE_BATCH_DISMISSED'`,
  )
  // v0.4.8 「确认上传」= 上传总数 − 主动取消，作为 file 漏斗第二层
  const fileConfirmed = fileUpload - fileDismissed
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
      // v0.4.8 加层「确认上传」：剔除主动取消后用户真正确认要处理的件数
      // 上传总数 → 确认上传 → 转换成功 → 下载（user 维度漏斗本期不动）
      steps: buildSteps([
        { name: '上传总数', n: fileUpload },
        { name: '确认上传', n: fileConfirmed },
        { name: '转换成功', n: fileDecrypt },
        { name: '下载',     n: fileDownload },
      ]),
    },
  })
})

// 按钮 曝光 / 点击 PV / UV
// 「行动后缀」= _click / _confirm / _close / _dismiss（弹窗的 confirm/close/dismiss 与按钮 click 同视为「点击行为」）
// 「曝光后缀」= _view
// 同 base 下 click_pv 取所有行动后缀的总和（一般同 base 只会出现一种行动后缀，安全求和）
adminStats.get('/buttons', (c) => {
  const { from, to, range } = parseTimeRange(c)

  const rows = db
    .prepare(
      `SELECT event,
              COUNT(*) AS pv,
              COUNT(DISTINCT visitor_id) AS uv
         FROM events
        WHERE ts >= ? AND ts <= ?
          AND (SUBSTR(event, -6)  = '_click'
            OR SUBSTR(event, -5)  = '_view'
            OR SUBSTR(event, -8)  = '_confirm'
            OR SUBSTR(event, -6)  = '_close'
            OR SUBSTR(event, -8)  = '_dismiss')
        GROUP BY event
        ORDER BY pv DESC`,
    )
    .all(from, to) as { event: string; pv: number; uv: number }[]

  // 剥离任何已识别的后缀；带前导下划线，避免类似 'overview' 误剥
  const SUFFIX_RE = /_(click|view|confirm|close|dismiss)$/
  const ACTION_RE = /_(click|confirm|close|dismiss)$/

  const byBase = new Map<
    string,
    { base: string; click_pv: number; click_uv: number; view_pv: number; view_uv: number }
  >()
  for (const r of rows) {
    const isAction = ACTION_RE.test(r.event)
    const base = r.event.replace(SUFFIX_RE, '')
    const slot = byBase.get(base) ?? {
      base, click_pv: 0, click_uv: 0, view_pv: 0, view_uv: 0,
    }
    if (isAction) { slot.click_pv += r.pv; slot.click_uv += r.uv }
    else { slot.view_pv = r.pv; slot.view_uv = r.uv }
    byBase.set(base, slot)
  }

  const buttons = [...byBase.values()].map((b) => ({
    ...b,
    ctr: b.view_pv > 0 ? b.click_pv / b.view_pv : null,
    ctr_uv: b.view_uv > 0 ? b.click_uv / b.view_uv : null,
  })).sort((a, b) => b.click_pv - a.click_pv)

  const browserCompat = getBrowserCompatStats(from, to)

  return c.json({
    range,
    from,
    to,
    buttons,
    browser_compat: browserCompat,
    raw: rows,
  })
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
      // 口径与 overview 卡片「上传过的人 UV」一致：含 drop/pick（v0.3 前）+ attempt/reject（v0.4.1+）
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(DISTINCT visitor_id) AS v
             FROM events WHERE ts >= ? AND ts <= ?
               AND event IN ('upload_drop','upload_pick','upload_attempt','upload_reject')
             GROUP BY day ORDER BY day`
      break
    case 'download_uv':
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(DISTINCT visitor_id) AS v
             FROM events WHERE ts >= ? AND ts <= ?
               AND event IN ('row_download_click','btn_download_all_click','btn_download_zip_click','download_done','download_fail')
             GROUP BY day ORDER BY day`
      break
    case 'upload_files':
      // 口径与 overview 卡片「上传文件总数」一致：upload_attempt + upload_reject
      sql = `SELECT ${DAY_BUCKET_SQL} AS day, COUNT(*) AS v
             FROM events WHERE ts >= ? AND ts <= ?
               AND event IN ('upload_attempt','upload_reject')
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

// 性能分析（v0.6.4）：解密 / 转码耗时聚合，供运营后台「性能分析」tab 消费
// 口径锁定：
//  · 只统计成功事件 decrypt_done / transcode_done 的 *_ms 字段（失败事件虽带 *_ms 但不计入）
//  · 纯 MP3 直传无 done 事件，天然不计入；旧版客户端无 *_ms 字段的行被 IS NOT NULL 过滤
//  · 均值 / 每 MB 一律 ratio-of-sums（Σ耗时 ÷ Σ次数 或 Σ耗时 ÷ Σ MB）
//  · file_size 在 decrypt_done = 原始加密字节、在 transcode_done = 转码输入(解密产物)字节，各为本阶段处理量
//  · #1「转换」均值按处理次数 (Nd+Nt)；其分位数刻意改用「整文件端到端」分布（避免快解密+慢转码双峰混合无意义）
//  · 分位数为近似 floor-rank：空集 / n=1 时 OFFSET 落 0，子查询无行返回 NULL，不会出现负 OFFSET
// ⚠️ 前端对缺失字段须显式显示 '-'，不要 ?? 0，避免后端漏部署被伪装成"零耗时"
adminStats.get('/perf', (c) => {
  const { from, to, range } = parseTimeRange(c)
  const MB = 1048576
  const div = (num: number, den: number) => (den > 0 ? num / den : null)

  const one = (sql: string, ...params: any[]) =>
    db.prepare(sql).get(from, to, ...params) as any

  // 某成功事件某耗时字段：SUM(ms) / SUM(file_size 字节) / COUNT（仅该字段非空行）
  const aggOf = (event: string, msField: string) =>
    one(
      `SELECT COALESCE(SUM(CAST(json_extract(props,'$.${msField}') AS REAL)),0) AS s_ms,
              COALESCE(SUM(CAST(json_extract(props,'$.file_size') AS REAL)),0) AS s_bytes,
              COUNT(*) AS n
         FROM events
        WHERE ts >= ? AND ts <= ? AND event = ?
          AND json_extract(props,'$.${msField}') IS NOT NULL`,
      event,
    ) as { s_ms: number; s_bytes: number; n: number }

  // 单事件单字段的近似 P50 / P95（floor-rank）
  const pctOf = (event: string, msField: string) =>
    one(
      `WITH d AS (
         SELECT CAST(json_extract(props,'$.${msField}') AS REAL) AS v
           FROM events
          WHERE ts >= ? AND ts <= ? AND event = ?
            AND json_extract(props,'$.${msField}') IS NOT NULL)
       SELECT
         (SELECT v FROM d ORDER BY v LIMIT 1 OFFSET (SELECT (COUNT(*)-1)/2 FROM d)) AS p50,
         (SELECT v FROM d ORDER BY v LIMIT 1 OFFSET (SELECT CAST(0.95*(COUNT(*)-1) AS INT) FROM d)) AS p95`,
      event,
    ) as { p50: number | null; p95: number | null }

  const d = aggOf('decrypt_done', 'decrypt_ms')
  const t = aggOf('transcode_done', 'transcode_ms')
  const dp = pctOf('decrypt_done', 'decrypt_ms')
  const tp = pctOf('transcode_done', 'transcode_ms')

  // #1 分位：按 file_id 聚合「该文件 解密+转码 总耗时」后再取分位（端到端体验）
  const e2e = db
    .prepare(
      `WITH per_file AS (
         SELECT SUM(CASE WHEN event='decrypt_done'
                  THEN CAST(json_extract(props,'$.decrypt_ms') AS REAL)
                  WHEN event='transcode_done'
                  THEN CAST(json_extract(props,'$.transcode_ms') AS REAL) END) AS v
           FROM events
          WHERE ts >= ? AND ts <= ?
            AND event IN ('decrypt_done','transcode_done')
            AND file_id IS NOT NULL
          GROUP BY file_id),
       nz AS (SELECT v FROM per_file WHERE v > 0)
       SELECT
         (SELECT v FROM nz ORDER BY v LIMIT 1 OFFSET (SELECT (COUNT(*)-1)/2 FROM nz)) AS p50,
         (SELECT v FROM nz ORDER BY v LIMIT 1 OFFSET (SELECT CAST(0.95*(COUNT(*)-1) AS INT) FROM nz)) AS p95`,
    )
    .get(from, to) as { p50: number | null; p95: number | null }

  const per_file = {
    convert_avg_ms: div(d.s_ms + t.s_ms, d.n + t.n), // 按处理次数
    convert_e2e_p50_ms: e2e.p50,
    convert_e2e_p95_ms: e2e.p95,
    decrypt_avg_ms: div(d.s_ms, d.n),
    decrypt_p50_ms: dp.p50,
    decrypt_p95_ms: dp.p95,
    transcode_avg_ms: div(t.s_ms, t.n),
    transcode_p50_ms: tp.p50,
    transcode_p95_ms: tp.p95,
    decrypt_n: d.n,
    transcode_n: t.n,
  }

  const per_mb = {
    convert_ms_per_mb: div(d.s_ms + t.s_ms, (d.s_bytes + t.s_bytes) / MB),
    decrypt_ms_per_mb: div(d.s_ms, d.s_bytes / MB),
    transcode_ms_per_mb: div(t.s_ms, t.s_bytes / MB),
  }

  // 按来源拆分：decrypt_done.source ∈ ncm/kgm/vpr/qmc；transcode_done.source 为 NULL = 原始 flac/ogg 直传
  const bySourceRows = (event: string, msField: string) =>
    db
      .prepare(
        `SELECT json_extract(props,'$.source') AS source,
                COALESCE(SUM(CAST(json_extract(props,'$.${msField}') AS REAL)),0) AS s_ms,
                COALESCE(SUM(CAST(json_extract(props,'$.file_size') AS REAL)),0) AS s_bytes,
                COUNT(*) AS n
           FROM events
          WHERE ts >= ? AND ts <= ? AND event = ?
            AND json_extract(props,'$.${msField}') IS NOT NULL
          GROUP BY source`,
      )
      .all(from, to, event) as Array<{ source: string | null; s_ms: number; s_bytes: number; n: number }>

  type SourceSlot = {
    source: string | null
    decrypt_ms_per_mb: number | null
    transcode_ms_per_mb: number | null
    decrypt_n: number
    transcode_n: number
  }
  const sourceMap = new Map<string, SourceSlot>()
  const slot = (s: string | null): SourceSlot => {
    const k = s ?? '__raw__'
    let v = sourceMap.get(k)
    if (!v) {
      v = { source: s, decrypt_ms_per_mb: null, transcode_ms_per_mb: null, decrypt_n: 0, transcode_n: 0 }
      sourceMap.set(k, v)
    }
    return v
  }
  for (const r of bySourceRows('decrypt_done', 'decrypt_ms')) {
    const v = slot(r.source)
    v.decrypt_ms_per_mb = div(r.s_ms, r.s_bytes / MB)
    v.decrypt_n = r.n
  }
  for (const r of bySourceRows('transcode_done', 'transcode_ms')) {
    const v = slot(r.source)
    v.transcode_ms_per_mb = div(r.s_ms, r.s_bytes / MB)
    v.transcode_n = r.n
  }
  const by_source = [...sourceMap.values()].sort(
    (a, b) => b.decrypt_n + b.transcode_n - (a.decrypt_n + a.transcode_n),
  )

  return c.json({ range, from, to, per_file, per_mb, by_source })
})

// 性能分析 - 按来源拆分的「每 MB 耗时」按天趋势（v0.6.4）
// 折线图消费：x=天（本地时区桶），每条线 = 一个来源；解密 / 转码各一组
// 每个 (天,来源) 的点 = SUM(ms) / SUM(MB)（ratio-of-sums，与 /perf 口径一致）；该天该来源无样本 → 不出点
adminStats.get('/perf-timeseries', (c) => {
  const { from, to, range } = parseTimeRange(c)
  const MB = 1048576

  const grouped = (event: string, msField: string) =>
    db
      .prepare(
        `SELECT ${DAY_BUCKET_SQL} AS day,
                json_extract(props,'$.source') AS source,
                SUM(CAST(json_extract(props,'$.${msField}') AS REAL)) AS s_ms,
                SUM(CAST(json_extract(props,'$.file_size') AS REAL)) AS s_bytes,
                COUNT(*) AS n
           FROM events
          WHERE ts >= ? AND ts <= ? AND event = ?
            AND json_extract(props,'$.${msField}') IS NOT NULL
          GROUP BY day, source
          ORDER BY day`,
      )
      .all(from, to, event) as Array<{ day: number; source: string | null; s_ms: number; s_bytes: number; n: number }>

  // 转换（解密+转码合并）：同一 (天,来源) 把 decrypt_done.decrypt_ms 与 transcode_done.transcode_ms 一并求和，
  // 字节也合并（解密=原始字节、转码=解密产物字节，各算一份处理量），与 /perf 的「每 MB 转换耗时」同口径
  const groupedConvert = () =>
    db
      .prepare(
        `SELECT ${DAY_BUCKET_SQL} AS day,
                json_extract(props,'$.source') AS source,
                SUM(CASE WHEN event = 'decrypt_done'
                         THEN CAST(json_extract(props,'$.decrypt_ms') AS REAL)
                         ELSE CAST(json_extract(props,'$.transcode_ms') AS REAL) END) AS s_ms,
                SUM(CAST(json_extract(props,'$.file_size') AS REAL)) AS s_bytes,
                COUNT(*) AS n
           FROM events
          WHERE ts >= ? AND ts <= ?
            AND ( (event = 'decrypt_done'   AND json_extract(props,'$.decrypt_ms')   IS NOT NULL)
               OR (event = 'transcode_done' AND json_extract(props,'$.transcode_ms') IS NOT NULL) )
          GROUP BY day, source
          ORDER BY day`,
      )
      .all(from, to) as Array<{ day: number; source: string | null; s_ms: number; s_bytes: number; n: number }>

  const build = (rows: Array<{ day: number; source: string | null; s_ms: number; s_bytes: number; n: number }>) => {
    const sources = new Set<string>()
    const byDay = new Map<number, Record<string, number | null>>()
    for (const r of rows) {
      const key = r.source ?? '__raw__'
      sources.add(key)
      let pt = byDay.get(r.day)
      if (!pt) {
        pt = { day: r.day }
        byDay.set(r.day, pt)
      }
      pt[key] = r.s_bytes > 0 ? r.s_ms / (r.s_bytes / MB) : null
    }
    const points = [...byDay.values()].sort((a, b) => (a.day as number) - (b.day as number))
    return { sources: [...sources], points }
  }

  return c.json({
    range,
    from,
    to,
    convert: build(groupedConvert()),
    decrypt: build(grouped('decrypt_done', 'decrypt_ms')),
    transcode: build(grouped('transcode_done', 'transcode_ms')),
  })
})

export default adminStats
