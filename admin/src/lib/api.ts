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

  failures: (params: {
    page?: number; size?: number; stage?: string; code?: string; from?: number; to?: number
  }) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') q.set(k, String(v)) })
    return request<FailuresResp>(`/admin/failures?${q.toString()}`)
  },
  failureDetail: (id: number) => request<FailureDetail>(`/admin/failures/${id}`),
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
}

export type FunnelResp = {
  range: string
  steps: { name: string; uv: number }[]
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

export type FailureRow = {
  id: number
  ts: number
  visitor_id: string
  stage: 'decrypt' | 'transcode'
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
