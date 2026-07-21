export const OVERVIEW_METRICS = [
  'pv', 'uv', 'upload_uv', 'download_uv',
  'upload_files', 'decrypt_done', 'decrypt_fail', 'transcode_fail',
] as const

export type OverviewMetric = typeof OVERVIEW_METRICS[number]
export type DataSource = 'raw' | 'rollup' | 'raw_fallback'

export type OverviewStats = {
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

export type FunnelStep = {
  name: string
  n: number
  uv: number
  pct_of_prev: number | null
  pct_of_first: number | null
}

export type FunnelStats = {
  range: string
  from: number
  to: number
  user: { steps: FunnelStep[] }
  file: { steps: FunnelStep[] }
}

export type DeviceCombination = {
  browser: string
  os: string
  device_type: string
  n: number
}

export type OverviewBundle = {
  range: string
  from: number
  to: number
  generated_at: number
  data_source: DataSource
  rollup_lag_ms: number | null
  overview: OverviewStats
  funnel: FunnelStats
  timeseries: Record<OverviewMetric, Array<{ day: number; v: number }>>
  devices: { combinations: DeviceCombination[] }
}

export type BundleRequest = {
  from: number
  to: number
  range: string
  maxEventId?: number
}

export type RollupState = {
  last_event_id: number
  status: 'building' | 'ready' | 'disabled'
  last_run_at: number | null
  last_error: string | null
}
