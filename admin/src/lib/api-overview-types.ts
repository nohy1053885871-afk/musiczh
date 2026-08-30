export type HomepageGuidanceFlag = {
  enabled: boolean
  updatedAt: number | null
}

export type HomepageAnnouncementSite = 'sleepno.cn' | 'shiyinmp3.com'

export type HomepageAnnouncementConfig = {
  siteHost: HomepageAnnouncementSite
  enabled: boolean
  message: string
  actionLabel: string | null
  actionUrl: string | null
  updatedAt: number | null
}

export type HomepageAnnouncementInput = Pick<
  HomepageAnnouncementConfig,
  'enabled' | 'message' | 'actionLabel' | 'actionUrl'
>

export type HomepageAnnouncementsResponse = {
  announcements: HomepageAnnouncementConfig[]
}

export type QqInstallerLinkSite = HomepageAnnouncementSite

export type QqInstallerLinkConfig = {
  siteHost: QqInstallerLinkSite
  url: string | null
  updatedAt: number | null
}

export type QqInstallerLinkInput = Pick<QqInstallerLinkConfig, 'url'>

export type QqInstallerLinksResponse = {
  links: QqInstallerLinkConfig[]
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
  // 前端先于 API 部署的短暂窗口内，旧 API 可能没有此字段。
  restrictedPage?: RestrictedPageConfig
}

export type RestrictedPageConfig = {
  message: string | null
  updatedAt: number | null
}

export type RestrictedPageConfigInput = {
  message: string | null
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
  dismissed_files: number
  confirmed_upload_files: number
  upload_files_legacy: number
  decrypt_done: number
  decrypt_fail: number
  decrypt_success_rate: number | null
  transcode_done: number
  transcode_fail: number
  transcode_success_rate: number | null
  convert_done: number
  raw_flac_transcode_done: number
  raw_flac_transcode_fail: number
  upload_reject: number
  decrypt_abandon: number
  transcode_abandon: number
  abandon_total: number
  pending_files: number
  legacy_files: number
  success_files: number
  failed_files: number
  abandoned_files: number
}

// 性能分析：无样本时保留 null，前端必须显式显示 '-'。
export type PerfResp = {
  range: string
  from: number
  to: number
  per_file: {
    convert_avg_ms: number | null
    convert_e2e_p50_ms: number | null
    convert_e2e_p95_ms: number | null
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
  by_source: {
    source: string | null
    decrypt_ms_per_mb: number | null
    transcode_ms_per_mb: number | null
    decrypt_n: number
    transcode_n: number
  }[]
}

export type PerfTimeseriesSeries = {
  sources: string[]
  points: Array<Record<string, number | null>>
}

export type PerfTimeseriesResp = {
  range: string
  from: number
  to: number
  convert: PerfTimeseriesSeries
  decrypt: PerfTimeseriesSeries
  transcode: PerfTimeseriesSeries
}

export type FunnelStep = {
  name: string
  n: number
  uv: number
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
  // 前端可能先于 API 发布；缺失时必须显示部署告警，不能伪装为零数据。
  site_access?: {
    views: number
    uniqueIps: number
  }
}
