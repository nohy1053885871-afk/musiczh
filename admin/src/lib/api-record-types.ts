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

export type UploadStatus =
  | 'rejected_format' | 'rejected_size' | 'rejected_queue' | 'user_dismissed'
  | 'success' | 'failed' | 'abandoned' | 'pending' | 'legacy'

export type UploadRow = {
  id: number
  ts: number
  visitor_id: string
  event: string
  type: UploadType
  reject_reason: UploadRejectReason | null
  pipeline_status: 'success' | 'failed' | 'abandoned' | 'pending' | 'legacy' | null
  status: UploadStatus | null
  file_id: string | null
  file_name: string | null
  file_ext: string | null
  file_size: number | null
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
  reject_total: number
  reject_format: number
  reject_size: number
  reject_queue: number
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
