import { parentPort } from 'node:worker_threads'
import db from '../../db.js'
import { computeRawBundle } from './raw.js'
import { computeRollupBundle } from './rollupReader.js'
import { getMaxEventId, getRollupState, processRollupBatch } from './rollupWriter.js'
import type { BundleRequest, OverviewBundle } from './types.js'

type WorkerRequest =
  | { id: number; operation: 'compute'; request: BundleRequest }
  | { id: number; operation: 'catchup' }

type WorkerResponse =
  | { id: number; ok: true; result: OverviewBundle | { processed: number; remaining: number } }
  | { id: number; ok: false; error: string }

if (!parentPort) throw new Error('overview worker must run in a Worker thread')

function catchUp(maxBatches = 3): { processed: number; remaining: number } {
  let processed = 0
  for (let index = 0; index < maxBatches; index += 1) {
    const result = processRollupBatch(db)
    processed += result.processed
    if (result.processed === 0) break
  }
  const state = getRollupState(db)
  return { processed, remaining: Math.max(0, getMaxEventId(db) - state.last_event_id) }
}

function compute(request: BundleRequest): OverviewBundle {
  let state = getRollupState(db)
  if (state.status !== 'ready') return computeRawBundle(db, request)

  if (request.maxEventId == null) {
    try {
      const caughtUp = catchUp()
      state = getRollupState(db)
      if (caughtUp.remaining > 0) {
        const fallback = computeRawBundle(db, request)
        return { ...fallback, data_source: 'raw_fallback', rollup_lag_ms: Date.now() - (state.last_run_at ?? 0) }
      }
    } catch (error) {
      const fallback = computeRawBundle(db, request)
      return { ...fallback, data_source: 'raw_fallback', rollup_lag_ms: Date.now() - (state.last_run_at ?? 0) }
    }
  }
  const lag = Math.max(0, Date.now() - (state.last_run_at ?? Date.now()))
  try {
    return computeRollupBundle(db, request, lag)
  } catch (error) {
    console.error('[overview-rollup] read failed; using raw fallback', error)
    const fallback = computeRawBundle(db, request)
    return { ...fallback, data_source: 'raw_fallback', rollup_lag_ms: lag }
  }
}

parentPort.on('message', (message: WorkerRequest) => {
  let response: WorkerResponse
  try {
    const result = message.operation === 'compute' ? compute(message.request) : catchUp(1)
    response = { id: message.id, ok: true, result }
  } catch (error) {
    response = {
      id: message.id,
      ok: false,
      error: error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error),
    }
  }
  parentPort!.postMessage(response)
})
