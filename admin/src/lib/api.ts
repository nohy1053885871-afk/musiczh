// 管理后台 API 封装：所有请求自动带 cookie；401 自动抛 UnauthorizedError 由路由捕获

export class UnauthorizedError extends Error {
  constructor() { super('unauthorized') }
}
export class ApiError extends Error {
  status: number
  detail?: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

const BASE = '/api'

async function request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) {
    let detail: unknown = undefined
    try { detail = await res.json() } catch { /* ignore */ }
    throw new ApiError(res.status, `HTTP ${res.status}`, detail)
  }
  return res.json() as Promise<T>
}

function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') q.set(k, String(v))
  })
  return q.toString()
}

export const api = {
  me: () => request<{ uid: number; username: string }>('/admin/me'),
  login: (username: string, password: string) =>
    request<{ ok: true; username: string }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>('/admin/logout', { method: 'POST' }),

  homepageGuidanceFlag: () =>
    request<HomepageGuidanceFlag>(
      '/admin/feature-flags/homepage-guidance',
    ),
  updateHomepageGuidanceFlag: (enabled: boolean) =>
    request<HomepageGuidanceFlag>(
      '/admin/feature-flags/homepage-guidance',
      {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      },
    ),
  siteAccess: () => request<SiteAccessSnapshot>('/admin/site-access'),
  ensureCurrentIpRule: () =>
    request<SiteAccessSnapshot>('/admin/site-access/ip-rules/current', {
      method: 'POST',
    }),
  createIpRule: (input: CreateIpRuleInput) =>
    request<SiteAccessSnapshot>('/admin/site-access/ip-rules', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateIpRule: (id: number, input: UpdateIpRuleInput) =>
    request<SiteAccessSnapshot>(`/admin/site-access/ip-rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteIpRule: (id: number) =>
    request<SiteAccessSnapshot>(`/admin/site-access/ip-rules/${id}`, {
      method: 'DELETE',
    }),
  updateSiteAccessMode: (enabled: boolean) =>
    request<SiteAccessSnapshot>('/admin/site-access/mode', {
      method: 'PUT',
      body: JSON.stringify({ enabled }),
    }),

  overview: (rangeQuery: string) => request<OverviewResp>(`/admin/stats/overview?${rangeQuery}`),
  overviewBundle: (rangeQuery: string, refresh = false, signal?: AbortSignal) =>
    request<OverviewBundleResp>(
      `/admin/stats/overview-bundle?${rangeQuery}${refresh ? '&refresh=1' : ''}`,
      { signal },
    ),
  perf: (rangeQuery: string) => request<PerfResp>(`/admin/stats/perf?${rangeQuery}`),
  perfTimeseries: (rangeQuery: string) => request<PerfTimeseriesResp>(`/admin/stats/perf-timeseries?${rangeQuery}`),
  funnel: (rangeQuery: string) => request<FunnelResp>(`/admin/stats/funnel?${rangeQuery}`),
  buttons: (rangeQuery: string) => request<ButtonsResp>(`/admin/stats/buttons?${rangeQuery}`),
  timeseries: (rangeQuery: string, metric: string) =>
    request<TimeseriesResp>(`/admin/stats/timeseries?${rangeQuery}&metric=${metric}`),
  formatDistribution: (rangeQuery: string) =>
    request<FormatDistributionResp>(`/admin/stats/format-distribution?${rangeQuery}`),
  devices: (rangeQuery: string) =>
    request<DevicesResp>(`/admin/stats/devices?${rangeQuery}`),

  failures: (params: {
    page?: number; size?: number; stage?: string; code?: string;
    q?: string; ext?: string; from?: number; to?: number; range?: string
  }) => request<FailuresResp>(`/admin/failures?${buildQuery(params)}`),
  failureDetail: (id: number) => request<FailureDetail>(`/admin/failures/${id}`),

  successes: (params: {
    page?: number; size?: number; stage?: string;
    q?: string; ext?: string; from?: number; to?: number; range?: string
  }) => request<SuccessesResp>(`/admin/successes?${buildQuery(params)}`),
  successDetail: (id: number) => request<SuccessDetail>(`/admin/successes/${id}`),

  visitors: (params: {
    page?: number; size?: number; q?: string;
    browser?: string; os?: string; device_type?: string; channel?: string;
    from?: number; to?: number; range?: string
  }) => request<VisitorsResp>(`/admin/visitors?${buildQuery(params)}`),
  visitorDetail: (id: string) => request<VisitorDetail>(`/admin/visitors/${encodeURIComponent(id)}`),

  uploads: (params: {
    page?: number; size?: number; type?: 'attempt' | 'reject';
    reason?: string; status?: UploadStatus; ext?: string; q?: string;
    from?: number; to?: number; range?: string
  }) => request<UploadsResp>(`/admin/uploads?${buildQuery(params)}`),
  uploadDetail: (id: number) => request<UploadDetail>(`/admin/uploads/${id}`),
  uploadsTimeseries: (rangeQuery: string) =>
    request<UploadsTimeseriesResp>(`/admin/uploads/timeseries?${rangeQuery}`),
  uploadsByFormat: (rangeQuery: string) =>
    request<UploadsByFormatResp>(`/admin/uploads/by-format?${rangeQuery}`),

  downloads: (params: {
    page?: number; size?: number; type?: 'done' | 'fail';
    kind?: 'single' | 'all_separate' | 'zip';
    ext?: string; q?: string;
    from?: number; to?: number; range?: string
  }) => request<DownloadsResp>(`/admin/downloads?${buildQuery(params)}`),
  downloadDetail: (id: number) => request<DownloadDetail>(`/admin/downloads/${id}`),
}

export type HomepageGuidanceFlag = {
  enabled: boolean
  updatedAt: number | null
}

export type IpRuleKind = 'allow' | 'deny'

export type SiteAccessIpRule = {
  id: number
  address: string
  rule: IpRuleKind
  note: string | null
  createdAt: number
  updatedAt: number
}

export type SiteAccessSnapshot = {
  enabled: boolean
  currentIp: string | null
  updatedAt: number | null
  allowedIps: SiteAccessIpRule[]
  blockedIps: SiteAccessIpRule[]
}

export type CreateIpRuleInput = {
  address: string
  rule: IpRuleKind
  note?: string | null
}

export type UpdateIpRuleInput = {
  rule?: IpRuleKind
  note?: string | null
  confirmCurrentIp?: boolean
}

export type OverviewResp = {
  range: string
  from: number
  to: number
  pv: number
  uv: number
  upload_uv: number
  download_uv: number
  upload_files: number
  // v0.4.8 新增：剔除"主动取消"后的真实上传件数
  // confirmed_upload_files = upload_files - dismissed_files
  // 主动取消 = 用户在 ≥50 文件警告弹窗里点「重新选择」/ ESC 被丢弃的文件（reject_reason=LARGE_BATCH_DISMISSED）
  dismissed_files: number
  confirmed_upload_files: number
  // v0.4.3 临时观察字段：旧口径 SUM(upload_drop/pick.count)，2026-07 评估稳定后移除
  upload_files_legacy: number
  decrypt_done: number
  decrypt_fail: number
  decrypt_success_rate: number | null
  transcode_done: number
  transcode_fail: number
  transcode_success_rate: number | null
  // 「转换成功（件）」= 解密成功 + 原始 .flac / .ogg 直接转码成功；同一文件解密+转码不双计数
  convert_done: number
  // 原始 flac / ogg 上传走转码路径的件数（口径=transcode_done 且 source 为空）。
  // 字段名沿用 raw_flac_*（v0.4.0 定）历史命名，v0.6.1 起 OGG 直传同口径合并进来。
  raw_flac_transcode_done: number
  raw_flac_transcode_fail: number
  // 上传被拒件数（格式不支持 / 超大小 / 队列上限）
  // v0.4.8 起严格被拒：剔除主动取消（LARGE_BATCH_DISMISSED），后者计入 dismissed_files
  upload_reject: number
  // v0.4.1 新增：上传文件总数卡片拆分小字消费的精细字段
  decrypt_abandon: number
  transcode_abandon: number
  abandon_total: number
  pending_files: number
  legacy_files: number
  // 6 段口径（按 file_id 关联 upload_attempt 下游状态，加和 = upload_attempt + upload_reject = upload_files）
  success_files: number
  failed_files: number
  abandoned_files: number
}

// 性能分析（v0.6.4）：解密 / 转码耗时聚合
// 所有数值字段可能为 null（样本数为 0 时），前端须显式显示 '-'，禁止 ?? 0
export type PerfResp = {
  range: string
  from: number
  to: number
  per_file: {
    // #1 转换：均值按处理次数 (Nd+Nt)；分位用整文件端到端分布
    convert_avg_ms: number | null
    convert_e2e_p50_ms: number | null
    convert_e2e_p95_ms: number | null
    // #2 解密 / #3 转码：均值 + 各自单一分布的 P50/P95
    decrypt_avg_ms: number | null
    decrypt_p50_ms: number | null
    decrypt_p95_ms: number | null
    transcode_avg_ms: number | null
    transcode_p50_ms: number | null
    transcode_p95_ms: number | null
    decrypt_n: number
    transcode_n: number
  }
  per_mb: {
    convert_ms_per_mb: number | null
    decrypt_ms_per_mb: number | null
    transcode_ms_per_mb: number | null
  }
  // 按来源拆分：source=null 表示原始 FLAC/OGG 直传（无解密阶段）
  by_source: {
    source: string | null
    decrypt_ms_per_mb: number | null
    transcode_ms_per_mb: number | null
    decrypt_n: number
    transcode_n: number
  }[]
}

// 性能分析 - 按来源拆分的每 MB 耗时按天趋势（v0.6.4）
// points 每个元素含 { day, [sourceKey]: ms/MB|null }；sourceKey 为 ncm/kgm/vpr/qmc/__raw__
export type PerfTimeseriesSeries = {
  sources: string[]
  points: Array<Record<string, number | null>>
}
export type PerfTimeseriesResp = {
  range: string
  from: number
  to: number
  // convert = 解密+转码合并口径（每 MB）
  convert: PerfTimeseriesSeries
  decrypt: PerfTimeseriesSeries
  transcode: PerfTimeseriesSeries
}

export type FunnelStep = {
  name: string
  n: number
  uv: number  // 兼容老前端：dim=user 时是 UV，dim=file 时是文件数
  pct_of_prev: number | null
  pct_of_first: number | null
}

export type FunnelResp = {
  range: string
  user: { steps: FunnelStep[] }
  file: { steps: FunnelStep[] }
}

export type ButtonsResp = {
  range: string
  buttons: {
    base: string
    click_pv: number; click_uv: number
    view_pv: number; view_uv: number
    ctr: number | null
    ctr_uv: number | null
  }[]
  browser_compat: {
    browser_family: string
    detected_version: string
    required_version: string
    view_pv: number; view_uv: number
    confirm_pv: number; confirm_uv: number
    close_pv: number; close_uv: number
  }[]
  raw: { event: string; pv: number; uv: number }[]
}

export type TimeseriesResp = {
  range: string
  metric: string
  points: { day: number; v: number }[]
}

export type FormatDistributionResp = {
  range: string
  rows: { ext: string | null; total: number; success: number; fail: number }[]
}

export type DevicesResp = {
  range: string
  browsers: { name: string; n: number }[]
  os: { name: string; n: number }[]
  device_types: { name: string; n: number }[]
  visitors: { browser: string; os: string; device_type: string }[]
}

export type OverviewMetricKey =
  | 'pv' | 'uv' | 'upload_uv' | 'download_uv'
  | 'upload_files' | 'decrypt_done' | 'decrypt_fail' | 'transcode_fail'

export type DeviceCombination = {
  browser: string
  os: string
  device_type: string
  n: number
}

export type TrafficSeries = {
  pv: Array<{ day: number; v: number }>
  uv: Array<{ day: number; v: number }>
}

export type TrafficBreakdown = {
  overall: TrafficSeries
  sites: {
    'sleepno.cn': TrafficSeries
    'shiyinmp3.com': TrafficSeries
  }
}

export type OverviewBundleResp = {
  range: string
  from: number
  to: number
  generated_at: number
  data_source: 'raw' | 'rollup' | 'raw_fallback'
  rollup_lag_ms: number | null
  overview: OverviewResp
  funnel: FunnelResp
  timeseries: Record<OverviewMetricKey, Array<{ day: number; v: number }>>
  traffic: TrafficBreakdown
  devices: { combinations: DeviceCombination[] }
}

export type FailureRow = {
  id: number
  ts: number
  visitor_id: string
  stage: 'decrypt' | 'transcode' | 'download'
  error_code: string | null
  error_msg: string | null
  file_name: string | null
  file_ext: string | null
  file_size: number | null
  source: string | null
  app_ver: string | null
}

export type FailuresResp = {
  total: number
  page: number
  size: number
  rows: FailureRow[]
  code_agg: { error_code: string | null; n: number }[]
}

export type FailureDetail = FailureRow & {
  error_stack: string | null
  ua: string | null
  ip: string | null
}

export type SuccessRow = {
  id: number
  ts: number
  visitor_id: string
  stage: 'decrypt' | 'transcode'
  file_name: string | null
  file_ext: string | null
  file_size: number | null
  source: string | null
  app_ver: string | null
}

export type SuccessesResp = {
  total: number
  page: number
  size: number
  rows: SuccessRow[]
}

export type SuccessDetail = SuccessRow & {
  ua: string | null
  ip: string | null
  event: string
}

export type VisitorRow = {
  visitor_id: string
  first_ts: number
  last_ts: number
  sessions: number
  events: number
  ua: string | null
  ip: string | null
  first_page: string | null
  referrer: string | null
  browser: string
  os: string
  device_type: string
  channel: string
}

export type VisitorsResp = {
  range: string
  from: number
  to: number
  total: number
  page: number
  size: number
  rows: VisitorRow[]
  options: {
    browsers: string[]
    os: string[]
    device_types: string[]
    channels: string[]
  }
}

export type VisitorTimelineEvent = {
  id: number
  ts: number
  event: string
  page: string | null
  session_id: string
  app_ver: string | null
  props: Record<string, unknown> | null
}

export type VisitorDetail = VisitorRow & {
  timeline: VisitorTimelineEvent[]
}

export type UploadType = 'attempt' | 'reject'
export type UploadRejectReason =
  | 'FORMAT_UNSUPPORTED'
  | 'SIZE_EXCEEDED'
  | 'QUEUE_FULL'
  | 'LARGE_BATCH_DISMISSED'

// v0.4.1：合并后的「状态」枚举（含被拒细分 + 下游 pipeline_status）
// v0.4.8 把 rejected_large_batch 抠出来重命名为 user_dismissed（"主动取消"），从"被拒"分类剥离
export type UploadStatus =
  | 'rejected_format' | 'rejected_size' | 'rejected_queue' | 'user_dismissed'
  | 'success' | 'failed' | 'abandoned' | 'pending' | 'legacy'

export type UploadRow = {
  id: number
  ts: number
  visitor_id: string
  event: string
  // 旧字段保留过渡期一版
  type: UploadType
  reject_reason: UploadRejectReason | null
  pipeline_status: 'success' | 'failed' | 'abandoned' | 'pending' | 'legacy' | null
  // 新字段：合并后的状态，前端 Tag 直接消费
  status: UploadStatus | null
  file_id: string | null
  file_name: string | null
  file_ext: string | null
  file_size: number | null
  // v0.6.4：该文件 解密+转码 总耗时（ms）；被拒/主动取消/无下游 done 事件为 null
  duration_ms?: number | null
  app_ver: string | null
  browser: string
  os: string
  device_type: string
}

export type UploadsResp = {
  total: number
  page: number
  size: number
  rows: UploadRow[]
  reason_agg: { reason: string | null; n: number }[]
}

export type UploadTimelineEvent = {
  id: number
  ts: number
  event: string
  props: Record<string, unknown> | null
}

export type UploadDetail = UploadRow & {
  ua: string | null
  ip: string | null
  page: string | null
  timeline: UploadTimelineEvent[]
}

export type UploadsTimeseriesPoint = {
  day: number
  attempt: number
  // v0.4.8 起 reject_total 是「狭义被拒」（不含主动取消）
  reject_total: number
  reject_format: number
  reject_size: number
  reject_queue: number
  // v0.4.8：从 reject_large_batch 重命名而来，从"被拒"分组独立
  user_dismissed: number
}

export type UploadsTimeseriesResp = {
  range: string
  from: number
  to: number
  points: UploadsTimeseriesPoint[]
}

export type UploadsByFormatPerExt = {
  total: number
  success: number
  fail: number
}

export type UploadsByFormatPoint = {
  day: number
  per_ext: Record<string, UploadsByFormatPerExt>
}

export type UploadsByFormatResp = {
  range: string
  from: number
  to: number
  exts: string[]
  points: UploadsByFormatPoint[]
}

export type DownloadType = 'done' | 'fail'
export type DownloadKind = 'single' | 'all_separate' | 'zip'

export type DownloadRow = {
  id: number
  ts: number
  visitor_id: string
  event: string
  type: DownloadType
  download_kind: DownloadKind | null
  file_name: string | null
  file_ext: string | null
  file_size: number | null
  error_code: string | null
  error_msg: string | null
  app_ver: string | null
  browser: string
  os: string
  device_type: string
}

export type DownloadsResp = {
  total: number
  page: number
  size: number
  rows: DownloadRow[]
  kind_agg: { kind: string | null; n: number }[]
}

export type DownloadDetail = DownloadRow & {
  ua: string | null
  ip: string | null
  page: string | null
  error_stack: string | null
}
