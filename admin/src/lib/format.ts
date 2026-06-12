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

  upload_attempt: '主站 - 业务 - 上传成功（进入队列）',
  upload_reject:  '主站 - 业务 - 上传被拒（格式/大小/数量）',
  download_done:  '主站 - 业务 - 下载完成',
  download_fail:  '主站 - 业务 - 下载失败',

  // v0.4.1 新增：心跳 + 中止
  transcode_progress: '主站 - 业务 - 转码进度心跳（10/30/50/70/90 五桶）',
  decrypt_abandon:    '主站 - 业务 - 解密中止（pagehide 时仍在 inflight）',
  transcode_abandon:  '主站 - 业务 - 转码中止（pagehide 时仍在 inflight，auto-FLAC OOM 定位用）',

  // v0.5.0 新增：大批量性能警告弹窗
  dialog_large_batch_view:         '主站 - 性能警告弹窗（≥50 文件）- 曝光',
  dialog_large_batch_confirm:      '主站 - 性能警告弹窗 - 选择（continue / reselect）',

  // v0.5.0 新增：上传拦截详情入口与弹窗
  btn_reject_details_view:    '主站 - 拦截横条 - 查看详情按钮（曝光）',
  btn_reject_details_click:   '主站 - 拦截横条 - 查看详情按钮（点击）',
  dialog_reject_details_view: '主站 - 拦截详情弹窗 - 曝光',
  dialog_reject_details_close:'主站 - 拦截详情弹窗 - 关闭',

  // v0.5.0 新增：FLAC 一键转 MP3 引导横条
  banner_flac_prompt_view:        '主站 - FLAC 转 MP3 横条 - 曝光',
  banner_flac_prompt_dismiss:     '主站 - FLAC 转 MP3 横条 - 关闭',
  btn_flac_batch_transcode_view:  '主站 - FLAC 横条 - 一键转 MP3 按钮（曝光）',
  btn_flac_batch_transcode_click: '主站 - FLAC 横条 - 一键转 MP3 按钮（点击）',

  // v0.6.0 新增：QQ 音乐使用引导 + 平台格式总览
  qq_guide_entry_view:           '主站 - 拖拽区下方 QQ 引导入口 - 曝光',
  qq_guide_entry_click:          '主站 - 拖拽区下方 QQ 引导入口 - 点击',
  qq_guide_view:                 '主站 - QQ 使用说明弹窗 - 曝光（带触发来源 entry/failure/auto/matrix）',
  qq_guide_dismiss:              '主站 - QQ 使用说明弹窗 - 关闭',
  qq_download_click:             '主站 - QQ 使用说明弹窗 - 下载旧版安装包按钮',
  support_matrix_entry_view:     '主站 - 拖拽区下方「查看全部格式」入口 - 曝光',
  support_matrix_entry_click:    '主站 - 拖拽区下方「查看全部格式」入口 - 点击',
  support_matrix_view:           '主站 - 平台/格式总览弹窗 - 曝光',
  support_matrix_dismiss:        '主站 - 平台/格式总览弹窗 - 关闭',

  // v0.7.1 新增：封面回填 + 解密健壮性诊断
  cover_backfill_done:      '主站 - 业务 - 封面回填成功（抓 albumPic 嵌入）',
  cover_backfill_fail:      '主站 - 业务 - 封面回填失败（抓图/写标签失败，文件仍可用）',
  decrypt_offset_recovered: '主站 - 诊断 - NCM 偏移自愈（出现新变体、已兜住）',
  decrypt_format_mismatch:  '主站 - 诊断 - 解密格式不符（真实 magic ≠ 元数据声称）',
}

export function eventLabel(name: string): string {
  return EVENT_LABELS[name] ?? name
}

// 给「按钮埋点」聚合行用：base 可能对应多种行动后缀（_click / _confirm / _close / _dismiss），
// 按优先级试一遍，第一个命中 EVENT_LABELS 的中文标签即返回；都没命中时 fallback 到 _view 标签或 base 名
const LABEL_SUFFIXES = ['_click', '_confirm', '_close', '_dismiss', '_view'] as const
export function labelForButtonBase(base: string): string {
  for (const suffix of LABEL_SUFFIXES) {
    const label = EVENT_LABELS[`${base}${suffix}`]
    if (label) return label
  }
  return base
}

export const STAGE_LABEL: Record<string, string> = {
  decrypt: '解密',
  transcode: '转码',
  download: '下载',
}

export const REJECT_REASON_LABEL: Record<string, string> = {
  FORMAT_UNSUPPORTED: '格式不支持',
  SIZE_EXCEEDED: '超出 200MB',
  QUEUE_FULL: '超出 50 个上限',
  LARGE_BATCH_DISMISSED: '大批量取消',
}

// v0.4.1 合并后的上传日志「状态」列：Tag 文案 + 颜色
// v0.4.8 把 rejected_large_batch 抠出来重命名为 user_dismissed（"主动取消"），颜色从 red 改 gold，独立于"被拒"
export type UploadStatusKey =
  | 'rejected_format' | 'rejected_size' | 'rejected_queue' | 'user_dismissed'
  | 'success' | 'failed' | 'abandoned' | 'pending' | 'legacy'

export const UPLOAD_STATUS_LABEL: Record<UploadStatusKey, { label: string; color: string }> = {
  rejected_format:  { label: '被拒-格式', color: 'red' },
  rejected_size:    { label: '被拒-大小', color: 'red' },
  rejected_queue:   { label: '被拒-队列', color: 'red' },
  user_dismissed:   { label: '主动取消',  color: 'gold' },  // v0.4.8 独立成态，非"被拒"
  success:          { label: '成功',      color: 'green' },
  failed:           { label: '失败',      color: 'volcano' },
  abandoned:        { label: '中止',      color: 'orange' },
  pending:          { label: '未完成',    color: 'default' },
  legacy:           { label: '-',         color: 'default' },
}

// 工具栏下拉
export const UPLOAD_STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '全部状态' },
  { value: 'rejected_format', label: '被拒-格式' },
  { value: 'rejected_size',   label: '被拒-大小' },
  { value: 'rejected_queue',  label: '被拒-队列' },
  { value: 'user_dismissed',  label: '主动取消' },
  { value: 'success',         label: '成功' },
  { value: 'failed',          label: '失败' },
  { value: 'abandoned',       label: '中止' },
  { value: 'pending',         label: '未完成' },
  { value: 'legacy',          label: '历史数据' },
]

export const DOWNLOAD_KIND_LABEL: Record<string, string> = {
  single: '单文件下载',
  all_separate: '下载全部（散）',
  zip: 'ZIP 打包',
}

export const EXT_LABELS: Record<string, string> = {
  ncm: 'NCM 网易云',
  kgm: 'KGM 酷狗',
  vpr: 'VPR 酷狗',
  // v0.6.0：QQ 音乐 QMCv2 系列
  mflac:  'mflac QQ',
  mflac0: 'mflac0 QQ',
  mflach: 'mflach QQ',
  mgg:    'mgg QQ',
  mgg0:   'mgg0 QQ',
  mgg1:   'mgg1 QQ',
  mggl:   'mggl QQ',
  mmp4:   'mmp4 QQ',
  qmcflac: 'qmcflac QQ',
  qmcogg:  'qmcogg QQ',
  qmc0: 'qmc0 QQ',
  qmc2: 'qmc2 QQ',
  qmc3: 'qmc3 QQ',
  qmc4: 'qmc4 QQ',
  qmc6: 'qmc6 QQ',
  qmc8: 'qmc8 QQ',
  // 通用
  mp3: 'MP3',
  flac: 'FLAC',
  ogg: 'OGG',
  wav: 'WAV',
  m4a: 'M4A',
}

// source 平台 → 中文标签。失败日志按 source 列展示时复用这张表。
// 'qq_mflac' 是 v0.4.1-v0.5.2 旧版 source 值（当时仅 sniff 拦截，没真正解密），保留映射便于历史回看
export const SOURCE_LABEL: Record<string, string> = {
  ncm: '网易云',
  kgm: '酷狗',
  vpr: '酷狗 VPR',
  qmc: 'QQ 音乐',
  qq_mflac: 'QQ 音乐（v0.6.0 前 sniff 拦截）',
}

// 失败错误码 → 中文标签。运营后台失败日志 / 漏斗损失分析时复用
export const ERROR_CODE_LABEL: Record<string, string> = {
  INVALID_HEADER:              '文件头不匹配',
  FILE_TOO_SMALL:              '文件过小',
  FILE_TOO_LARGE:              '文件过大',
  DECRYPT_FAILED:              '解密失败',
  OUTPUT_NOT_AUDIO:            '解密产物非音频（乱码/未知变体）',
  KGM_V4_UNSUPPORTED:          '酷狗 KGM v4（联网密钥）',
  QMC_NEW_VERSION_UNSUPPORTED: 'QQ 新版（密钥在云端）',
  UNSUPPORTED_FORMAT:          '不支持的格式',
  HIRES_NOT_SUPPORTED:         'Hi-Res FLAC 浏览器解不了',
  TRANSCODE_OOM:               '转码进程内存溢出/崩溃',
  UNKNOWN:                     '未知错误',
}

export function extLabel(ext: string | null | undefined): string {
  if (!ext) return '-'
  return EXT_LABELS[ext] ?? ext.toUpperCase()
}

export function formatBytes(n?: number | null): string {
  if (n == null) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

// 耗时（毫秒）友好展示：null → '-'；<1000ms 显示整数 ms；否则秒（2 位小数）
export function formatDuration(ms?: number | null): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${Math.round(ms)}ms`
  return `${(ms / 1000).toFixed(2)}s`
}

// 每 MB 耗时：null → '-'；保留 1 位小数 + 单位
export function formatMsPerMb(v?: number | null): string {
  if (v == null) return '-'
  return `${v.toFixed(1)} ms/MB`
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

export function formatPercent(part: number, total: number): string {
  if (!total) return '-'
  return `${((part / total) * 100).toFixed(1)}%`
}

// 用于卡片小字：「成功率 9/10 = 90%」；分母 0 时显示「成功率 -」
export function ratioLabel(prefix: string, part?: number | null, complement?: number | null, rate?: number | null): string {
  const p = part ?? 0
  const denom = p + (complement ?? 0)
  if (denom === 0) return `${prefix} -`
  return `${prefix} ${p}/${denom} = ${formatPct(rate)}`
}

const CHANNEL_COLOR: Record<string, string> = {
  '直接访问': 'default',
  '站内': 'blue',
  '搜索引擎': 'green',
  '社交': 'purple',
  '外部网站': 'orange',
  '其他': 'default',
}

export function channelColor(channel: string): string {
  return CHANNEL_COLOR[channel] ?? 'default'
}

export function shortUA(ua: string | null | undefined): string {
  if (!ua) return '-'
  if (ua.length <= 80) return ua
  return ua.slice(0, 78) + '…'
}
