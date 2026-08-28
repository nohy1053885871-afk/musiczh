// 管理后台 API 封装：所有请求自动带 cookie；401 自动抛 UnauthorizedError 由路由捕获

import type {
  ButtonsResp,
  CreateIpRuleInput,
  DevicesResp,
  FormatDistributionResp,
  FunnelResp,
  HomepageGuidanceFlag,
  OverviewBundleResp,
  OverviewResp,
  PerfResp,
  PerfTimeseriesResp,
  RestrictedPageConfigInput,
  SiteAccessSnapshot,
  TimeseriesResp,
  UpdateIpRuleInput,
} from './api-overview-types'
import type {
  DownloadDetail,
  DownloadsResp,
  FailureDetail,
  FailuresResp,
  SuccessDetail,
  SuccessesResp,
  UploadDetail,
  UploadsByFormatResp,
  UploadsResp,
  UploadStatus,
  UploadsTimeseriesResp,
  VisitorDetail,
  VisitorsResp,
} from './api-record-types'

export type * from './api-overview-types'
export type * from './api-record-types'

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
      method: 'POST', body: JSON.stringify({ username, password }),
    }),
  logout: () => request<{ ok: true }>('/admin/logout', { method: 'POST' }),

  homepageGuidanceFlag: () =>
    request<HomepageGuidanceFlag>('/admin/feature-flags/homepage-guidance'),
  updateHomepageGuidanceFlag: (enabled: boolean) =>
    request<HomepageGuidanceFlag>('/admin/feature-flags/homepage-guidance', {
      method: 'PUT', body: JSON.stringify({ enabled }),
    }),
  siteAccess: () => request<SiteAccessSnapshot>('/admin/site-access'),
  ensureCurrentIpRule: () =>
    request<SiteAccessSnapshot>('/admin/site-access/ip-rules/current', { method: 'POST' }),
  createIpRule: (input: CreateIpRuleInput) =>
    request<SiteAccessSnapshot>('/admin/site-access/ip-rules', {
      method: 'POST', body: JSON.stringify(input),
    }),
  updateIpRule: (id: number, input: UpdateIpRuleInput) =>
    request<SiteAccessSnapshot>(`/admin/site-access/ip-rules/${id}`, {
      method: 'PATCH', body: JSON.stringify(input),
    }),
  deleteIpRule: (id: number) =>
    request<SiteAccessSnapshot>(`/admin/site-access/ip-rules/${id}`, { method: 'DELETE' }),
  updateSiteAccessMode: (enabled: boolean) =>
    request<SiteAccessSnapshot>('/admin/site-access/mode', {
      method: 'PUT', body: JSON.stringify({ enabled }),
    }),
  updateRestrictedPage: (input: RestrictedPageConfigInput) =>
    request<SiteAccessSnapshot>('/admin/site-access/restricted-page', {
      method: 'PUT', body: JSON.stringify(input),
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
  devices: (rangeQuery: string) => request<DevicesResp>(`/admin/stats/devices?${rangeQuery}`),

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
    ext?: string; q?: string; from?: number; to?: number; range?: string
  }) => request<DownloadsResp>(`/admin/downloads?${buildQuery(params)}`),
  downloadDetail: (id: number) => request<DownloadDetail>(`/admin/downloads/${id}`),
}
