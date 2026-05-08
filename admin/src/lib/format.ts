// 事件名 → 中文描述（与 docs/ANALYTICS_SPEC.md 保持一致）
export const EVENT_LABELS: Record<string, string> = {
  pageview: '主站 - 首屏访问',

  upload_zone_click: '主站 - 上传区 - 点击（含还没选择文件的点击）',
  upload_zone_view:  '主站 - 上传区 - 曝光（首次进入视口）',
  upload_drop: '主站 - 上传区 - 拖拽文件松手',
  upload_pick: '主站 - 上传区 - 点击选择文件后确认',

  btn_transcode_click: '主站 - 列表行 - 转 MP3 按钮',
  btn_transcode_view:  '主站 - 列表行 - 转 MP3 按钮（曝光）',

  row_download_click: '主站 - 列表行 - 单文件下载',
  row_download_view:  '主站 - 列表行 - 单文件下载（曝光）',

  row_retry_click: '主站 - 列表行 - 重试',
  row_retry_view:  '主站 - 列表行 - 重试（曝光）',

  row_remove_click: '主站 - 列表行 - 移除（×）',
  row_remove_view:  '主站 - 列表行 - 移除（曝光）',

  btn_clear_all_click: '主站 - 工具栏 - 全部清空（触发）',
  btn_clear_all_view:  '主站 - 工具栏 - 全部清空（曝光）',
  dialog_clear_confirm: '主站 - 全部清空二次确认',

  btn_download_all_click: '主站 - 工具栏 - 下载全部（散文件）',
  btn_download_all_view:  '主站 - 工具栏 - 下载全部（曝光）',

  btn_download_zip_click: '主站 - 工具栏 - 打包下载（ZIP）',
  btn_download_zip_view:  '主站 - 工具栏 - 打包下载（曝光）',

  decrypt_start: '主站 - 业务 - 解密开始',
  decrypt_done:  '主站 - 业务 - 解密成功',
  decrypt_fail:  '主站 - 业务 - 解密失败',
  transcode_start: '主站 - 业务 - 转码开始',
  transcode_done:  '主站 - 业务 - 转码成功',
  transcode_fail:  '主站 - 业务 - 转码失败',
}

export function eventLabel(name: string): string {
  return EVENT_LABELS[name] ?? name
}

export function formatBytes(n?: number | null): string {
  if (n == null) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function formatDay(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatPct(v: number | null | undefined): string {
  if (v == null) return '-'
  return `${(v * 100).toFixed(1)}%`
}
