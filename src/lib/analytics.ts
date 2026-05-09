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

type FailurePayload = {
  stage: 'decrypt' | 'transcode'
  error_code?: string
  error_msg?: string
  error_stack?: string
  file_name?: string
  file_ext?: string
  file_size?: number
  source?: string
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

const queue: EventEnvelope[] = []
const seenImpressions = new Set<string>()
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

function enqueue(env: EventEnvelope) {
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

export const analytics = {
  init() {
    if (initialized) return
    initialized = true
    getVisitorId()
    getSession()

    void drainRetry()

    const onHide = () => {
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

  trackFailure(stage: 'decrypt' | 'transcode', payload: Omit<FailurePayload, 'stage'>) {
    const propsForEvent: Props = {
      file_name: payload.file_name,
      file_ext: payload.file_ext,
      file_size: payload.file_size,
      error_code: payload.error_code,
      error_msg: payload.error_msg,
      source: payload.source,
    }
    Object.keys(propsForEvent).forEach((k) => {
      if (propsForEvent[k] === undefined) delete propsForEvent[k]
    })
    enqueue(envelope(`${stage}_fail`, propsForEvent, { stage, ...payload }))
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

export type { Props, FailurePayload }
