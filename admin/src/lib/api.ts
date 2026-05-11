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

  overview: (rangeQuery: string) => request<OverviewResp>(`/admin/stats/overview?${rangeQuery}`),
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

export type OverviewResp = {
  range: string
  from: number
  to: number
  pv: number
  uv: number
  upload_uv: number
  download_uv: number
  upload_files: number
  decrypt_done: number
  decrypt_fail: number
  decrypt_success_rate: number | null
  transcode_done: number
  transcode_fail: number
  transcode_success_rate: number | null
  // 「转换成功（件）」= 解密成功 + 原始 .flac 直接转码成功；同一文件解密+转码不双计数
  convert_done: number
  // 原始 flac 上传走转码路径的件数（用于上传文件总数卡的拆分展示）
  raw_flac_transcode_done: number
  raw_flac_transcode_fail: number
  // 上传被拒件数（格式不支持 / 超大小 / 队列上限）
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
export type UploadRejectReason = 'FORMAT_UNSUPPORTED' | 'SIZE_EXCEEDED' | 'QUEUE_FULL'

// v0.4.1：合并后的「状态」枚举（含被拒细分 + 下游 pipeline_status）
export type UploadStatus =
  | 'rejected_format' | 'rejected_size' | 'rejected_queue'
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
  reject_total: number
  reject_format: number
  reject_size: number
  reject_queue: number
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
