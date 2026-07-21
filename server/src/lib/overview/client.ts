import { Worker } from 'node:worker_threads'
import type { BundleRequest, OverviewBundle } from './types.js'

type WorkerResult = OverviewBundle | { processed: number; remaining: number }
type WorkerResponse = { id: number; ok: true; result: WorkerResult } | { id: number; ok: false; error: string }
type Pending = { resolve: (result: WorkerResult) => void; reject: (error: Error) => void }

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { expiresAt: number; value: OverviewBundle }>()
const inFlight = new Map<string, Promise<OverviewBundle>>()
const pending = new Map<number, Pending>()
let worker: Worker | null = null
let nextId = 1
let rollupTimer: NodeJS.Timeout | null = null

function rejectPending(error: Error): void {
  for (const item of pending.values()) item.reject(error)
  pending.clear()
}

function spawnWorker(): Worker {
  const isSourceTs = import.meta.url.endsWith('.ts')
  const url = new URL(isSourceTs ? './workerBootstrap.mjs' : './worker.js', import.meta.url)
  // 源码模式由 bootstrap 使用 tsx 的 scoped import；编译产物直接启动 worker.js。
  const instance = new Worker(url, { execArgv: [] })
  instance.on('message', (message: WorkerResponse) => {
    const item = pending.get(message.id)
    if (!item) return
    pending.delete(message.id)
    if (message.ok) item.resolve(message.result)
    else item.reject(new Error(message.error))
  })
  instance.on('error', (error) => {
    if (worker !== instance) return
    worker = null
    rejectPending(error)
  })
  instance.on('exit', (code) => {
    if (worker !== instance) return
    worker = null
    if (code !== 0) rejectPending(new Error(`overview worker exited with code ${code}`))
  })
  worker = instance
  return instance
}

function callWorker(operation: 'compute', request: BundleRequest): Promise<OverviewBundle>
function callWorker(operation: 'catchup'): Promise<{ processed: number; remaining: number }>
function callWorker(operation: 'compute' | 'catchup', request?: BundleRequest): Promise<any> {
  const id = nextId++
  const activeWorker = worker ?? spawnWorker()
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    activeWorker.postMessage(operation === 'compute'
      ? { id, operation, request }
      : { id, operation })
  })
}

export async function getOverviewBundle(
  request: BundleRequest,
  options: { cacheKey: string; refresh?: boolean },
): Promise<OverviewBundle> {
  const started = performance.now()
  const existing = inFlight.get(options.cacheKey)
  if (existing) {
    console.log(JSON.stringify({
      type: 'overview_bundle_request', cache: 'coalesced', key: options.cacheKey,
      queue_length: pending.size,
    }))
    return existing
  }
  if (!options.refresh) {
    const cached = cache.get(options.cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      console.log(JSON.stringify({
        type: 'overview_bundle_request', cache: 'hit', key: options.cacheKey,
        total_ms: Math.round(performance.now() - started), data_source: cached.value.data_source,
        generated_at: cached.value.generated_at, queue_length: pending.size,
      }))
      return cached.value
    }
  }

  const task = callWorker('compute', request).then((value) => {
    cache.set(options.cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, value })
    console.log(JSON.stringify({
      type: 'overview_bundle_request', cache: 'miss', key: options.cacheKey,
      total_ms: Math.round(performance.now() - started), data_source: value.data_source,
      generated_at: value.generated_at, queue_length: pending.size,
    }))
    return value
  }).finally(() => {
    if (inFlight.get(options.cacheKey) === task) inFlight.delete(options.cacheKey)
  })
  inFlight.set(options.cacheKey, task)
  return task
}

export function startOverviewRollupTimer(): void {
  if (rollupTimer) return
  const tick = () => {
    callWorker('catchup').catch((error) => {
      console.error('[overview-rollup] catchup failed', error)
    })
  }
  rollupTimer = setInterval(tick, 30_000)
  rollupTimer.unref()
  setTimeout(tick, 1_000).unref()
}

export async function stopOverviewWorker(): Promise<void> {
  if (rollupTimer) clearInterval(rollupTimer)
  rollupTimer = null
  const active = worker
  worker = null
  if (active) await active.terminate()
}
