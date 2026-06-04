// 拾音 · 前端埋点 SDK
// 设计与字段规范见 docs/ANALYTICS_SPEC.md
// 隐私底线：仅上报元数据（含完整 file.name 与 file.size），严禁读取或上传文件二进制内容

const TRACK_URL = '/api/track'
const VID_KEY = '_sleepno_vid'
const SESS_KEY = '_sleepno_sess'
const RETRY_KEY = '_sleepno_retry'
const SESSION_TIMEOUT = 30 * 60 * 1000
const FLUSH_INTERVAL = 2_000
const FLUSH_THRESHOLD = 10
const RETRY_QUEUE_MAX = 50

const APP_VER = (import.meta.env?.VITE_APP_VERSION as string | undefined) ?? 'dev'

type Props = Record<string, unknown>

type FailureStage = 'decrypt' | 'transcode' | 'download'

type FailurePayload = {
  stage: FailureStage
  error_code?: string
  error_msg?: string
  error_stack?: string
  file_id?: string
  file_name?: string
  file_ext?: string
  file_size?: number
  source?: string
  download_kind?: 'single' | 'all_separate' | 'zip'
  // 性能埋点：失败时各阶段已耗时（毫秒），仅作诊断（"多久后才失败"），不进性能均值口径
  decrypt_ms?: number
  transcode_ms?: number
}

type EventEnvelope = {
  event: string
  ts: number
  visitor_id: string
  session_id: string
  page: string
  app_ver: string
  props?: Props
  failure?: FailurePayload
}

type InflightStage = 'decrypt' | 'transcode'

type InflightMeta = {
  file_name?: string
  file_ext?: string
  file_size?: number
  from_format?: string
}

type InflightEntry = {
  stage: InflightStage
  meta: InflightMeta
  lastBucket: number // 已 emit 过的最高 progress bucket（0/1/3/5/7/9 对应 0/0.1/0.3/0.5/0.7/0.9）
  lastProgress: number // 最近一次 progress（0-1），pagehide abandon 时回填
}

// transcode_progress 心跳分桶：0.1 / 0.3 / 0.5 / 0.7 / 0.9 共 5 个
// 用 ×10 的整数表示（1/3/5/7/9），避免浮点比较
const PROGRESS_BUCKETS = [1, 3, 5, 7, 9] as const

const queue: EventEnvelope[] = []
const seenImpressions = new Set<string>()
const inflight = new Map<string, InflightEntry>()
let flushTimer: number | null = null
let initialized = false

function genId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'v-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function safeStorage(): Storage | null {
  try {
    const x = '__t__'
    localStorage.setItem(x, x)
    localStorage.removeItem(x)
    return localStorage
  } catch {
    try {
      sessionStorage.setItem('__t__', '1')
      sessionStorage.removeItem('__t__')
      return sessionStorage
    } catch {
      return null
    }
  }
}

const inMemFallback: Record<string, string> = {}
function readKv(k: string): string | null {
  const s = safeStorage()
  if (s) return s.getItem(k)
  return inMemFallback[k] ?? null
}
function writeKv(k: string, v: string) {
  const s = safeStorage()
  if (s) s.setItem(k, v)
  else inMemFallback[k] = v
}

function getVisitorId(): string {
  let v = readKv(VID_KEY)
  if (!v) {
    v = genId()
    writeKv(VID_KEY, v)
  }
  return v
}

type SessionState = { id: string; lastActiveAt: number }

function getSession(): string {
  const raw = readKv(SESS_KEY)
  const now = Date.now()
  if (raw) {
    try {
      const s = JSON.parse(raw) as SessionState
      if (now - s.lastActiveAt < SESSION_TIMEOUT) {
        s.lastActiveAt = now
        writeKv(SESS_KEY, JSON.stringify(s))
        return s.id
      }
    } catch { /* fall through */ }
  }
  const fresh: SessionState = { id: genId(), lastActiveAt: now }
  writeKv(SESS_KEY, JSON.stringify(fresh))
  return fresh.id
}

function envelope(event: string, props?: Props, failure?: FailurePayload): EventEnvelope {
  return {
    event,
    ts: Date.now(),
    visitor_id: getVisitorId(),
    session_id: getSession(),
    page: typeof location !== 'undefined' ? location.pathname : '/',
    app_ver: APP_VER,
    props,
    failure,
  }
}

function loadRetryQueue(): EventEnvelope[] {
  const raw = readKv(RETRY_KEY)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

function saveRetryQueue(rows: EventEnvelope[]) {
  if (!rows.length) {
    const s = safeStorage()
    if (s) s.removeItem(RETRY_KEY)
    return
  }
  const trimmed = rows.slice(-RETRY_QUEUE_MAX)
  writeKv(RETRY_KEY, JSON.stringify(trimmed))
}

function pushRetry(rows: EventEnvelope[]) {
  const cur = loadRetryQueue()
  saveRetryQueue([...cur, ...rows])
}

async function postEvents(rows: EventEnvelope[], useBeacon: boolean): Promise<boolean> {
  if (!rows.length) return true
  const body = JSON.stringify({ events: rows })
  if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([body], { type: 'application/json' })
      const ok = navigator.sendBeacon(TRACK_URL, blob)
      if (ok) return true
    } catch { /* fall through */ }
  }
  try {
    const res = await fetch(TRACK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'same-origin',
    })
    return res.ok
  } catch {
    return false
  }
}

async function flush(useBeacon = false) {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (!queue.length) return
  const batch = queue.splice(0, queue.length)
  const ok = await postEvents(batch, useBeacon)
  if (!ok) pushRetry(batch)
}

function scheduleFlush() {
  if (flushTimer !== null) return
  flushTimer = window.setTimeout(() => {
    flushTimer = null
    void flush(false)
  }, FLUSH_INTERVAL)
}

// dev 环境给每个上报事件打一条控制台日志，方便本地点一遍新功能时
// 肉眼核对"应该有的事件都打印过了"——构建产物会因 dead code elimination 整段删掉
function devLog(env: EventEnvelope) {
  if (!import.meta.env.DEV) return
  const isFail = !!env.failure
  const tag = isFail ? '[analytics:fail]' : '[analytics]'
  const tagStyle = `color:#fff;background:${isFail ? '#d33' : '#0a84ff'};padding:1px 5px;border-radius:3px;font-weight:bold`
  const nameStyle = `color:${isFail ? '#d33' : '#0a84ff'};font-weight:bold`
  console.log(`%c${tag}%c ${env.event}`, tagStyle, nameStyle, env.props ?? env.failure ?? '')
}

function enqueue(env: EventEnvelope) {
  devLog(env)
  queue.push(env)
  if (queue.length >= FLUSH_THRESHOLD) {
    void flush(false)
  } else {
    scheduleFlush()
  }
}

async function drainRetry() {
  const cur = loadRetryQueue()
  if (!cur.length) return
  saveRetryQueue([])
  const ok = await postEvents(cur, false)
  if (!ok) pushRetry(cur)
}

// pagehide / visibilitychange=hidden 时：把仍在 inflight Map 里的文件
// 一律视为「中止」（用户主动关页 / 切到后台被系统杀 / Safari OOM 静默崩）
// 每个文件 emit 一次 ${stage}_abandon；同一个 file_id 只在此处 emit 一次后从 Map 移除
function emitAbandonForInflight() {
  if (inflight.size === 0) return
  for (const [fileId, entry] of inflight) {
    enqueue(
      envelope(`${entry.stage}_abandon`, {
        file_id: fileId,
        file_name: entry.meta.file_name,
        file_ext: entry.meta.file_ext,
        file_size: entry.meta.file_size,
        from_format: entry.meta.from_format,
        last_progress: entry.lastProgress,
        stage: entry.stage,
      }),
    )
  }
  inflight.clear()
}

export const analytics = {
  init() {
    if (initialized) return
    initialized = true
    getVisitorId()
    getSession()

    void drainRetry()

    const onHide = () => {
      emitAbandonForInflight()
      void flush(true)
    }
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide()
    })
  },

  pageview(props?: Props) {
    const ref = typeof document !== 'undefined' ? document.referrer : ''
    const merged: Props = { ...(props ?? {}) }
    if (ref) merged.referrer = ref
    enqueue(envelope('pageview', merged))
  },

  track(event: string, props?: Props) {
    enqueue(envelope(event, props))
  },

  trackFailure(stage: FailureStage, payload: Omit<FailurePayload, 'stage'>) {
    const propsForEvent: Props = {
      file_id: payload.file_id,
      file_name: payload.file_name,
      file_ext: payload.file_ext,
      file_size: payload.file_size,
      error_code: payload.error_code,
      error_msg: payload.error_msg,
      source: payload.source,
      download_kind: payload.download_kind,
      decrypt_ms: payload.decrypt_ms,
      transcode_ms: payload.transcode_ms,
    }
    Object.keys(propsForEvent).forEach((k) => {
      if (propsForEvent[k] === undefined) delete propsForEvent[k]
    })
    enqueue(envelope(`${stage}_fail`, propsForEvent, { stage, ...payload }))
  },

  // ── inflight 文件追踪：decrypt / transcode 开始时 register，结束时 unregister
  // pagehide 时仍在 Map 里的，统一发 *_abandon（含 last_progress / stage）
  registerInflight(fileId: string, stage: InflightStage, meta: InflightMeta) {
    if (!fileId) return
    inflight.set(fileId, { stage, meta, lastBucket: 0, lastProgress: 0 })
  },

  unregisterInflight(fileId: string) {
    if (!fileId) return
    inflight.delete(fileId)
  },

  // 转码进度回调里调一次。内部：① 更新 inflight.lastProgress；② 跨越新 bucket 时 emit transcode_progress
  // 同一桶在同一文件内只 emit 一次（lastBucket 单调递增）
  trackTranscodeProgress(fileId: string, progress: number, meta: InflightMeta) {
    if (!fileId) return
    const entry = inflight.get(fileId)
    if (entry) {
      entry.lastProgress = progress
      // 不允许 inflight 在 progress 调用阶段被外部 meta 覆盖；保留 register 时的 meta
    }
    // bucket 用 floor(progress * 10)，落到 PROGRESS_BUCKETS 任意一个就 emit
    const cur = Math.floor(progress * 10)
    if (!entry) return
    for (const b of PROGRESS_BUCKETS) {
      if (cur >= b && entry.lastBucket < b) {
        entry.lastBucket = b
        enqueue(
          envelope('transcode_progress', {
            file_id: fileId,
            file_name: meta.file_name ?? entry.meta.file_name,
            file_ext: meta.file_ext ?? entry.meta.file_ext,
            file_size: meta.file_size ?? entry.meta.file_size,
            from_format: meta.from_format ?? entry.meta.from_format,
            progress_bucket: b / 10, // 还原成 0.1 / 0.3 / ...
          }),
        )
      }
    }
  },

  // 元素进入视口 ≥50% 且停留 ≥300ms 触发一次 *_view，session 内同 event 去重
  observeImpression(el: Element, event: string, props?: Props): () => void {
    if (typeof IntersectionObserver === 'undefined') return () => {}
    const dedupeKey = `${getSession()}::${event}`
    if (seenImpressions.has(dedupeKey)) return () => {}

    let stayTimer: number | null = null
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (stayTimer === null) {
              stayTimer = window.setTimeout(() => {
                if (!seenImpressions.has(dedupeKey)) {
                  seenImpressions.add(dedupeKey)
                  enqueue(envelope(event, props))
                }
                obs.disconnect()
              }, 300)
            }
          } else if (stayTimer !== null) {
            clearTimeout(stayTimer)
            stayTimer = null
          }
        }
      },
      { threshold: [0.5] },
    )
    obs.observe(el)
    return () => {
      if (stayTimer !== null) clearTimeout(stayTimer)
      obs.disconnect()
    }
  },
}

export type { Props, FailurePayload, FailureStage, InflightStage, InflightMeta }
