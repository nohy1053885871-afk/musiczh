import 'dotenv/config'
import db from '../db.js'
import { computeRawBundle } from '../lib/overview/raw.js'
import { compareOverviewBundles } from '../lib/overview/parity.js'
import { computeRollupBundle } from '../lib/overview/rollupReader.js'
import {
  getMaxEventId, getRollupState, processRollupBatch, setRollupStatus,
  resetOverviewRollup,
} from '../lib/overview/rollupWriter.js'
import { dayBucket, DAY_MS } from '../lib/overview/shared.js'

const BATCH_SIZE = 10_000

function ranges(now: number) {
  const today = dayBucket(now)
  return [
    { range: 'today', from: today, to: now },
    { range: '7d', from: now - 7 * DAY_MS, to: now },
    { range: '30d', from: now - 30 * DAY_MS, to: now },
    { range: '90d', from: now - 90 * DAY_MS, to: now },
    { range: '365d', from: now - 365 * DAY_MS, to: now },
    { range: 'custom', from: today - 17 * DAY_MS, to: today - 3 * DAY_MS + DAY_MS - 1 },
    { range: 'custom', from: today - 4 * DAY_MS + 3_600_000, to: now - 3_600_000 },
  ]
}

function backfill(targetEventId: number): void {
  let total = 0
  while (true) {
    const result = processRollupBatch(db, {
      batchSize: BATCH_SIZE,
      allowBuilding: true,
      maxEventId: targetEventId,
    })
    total += result.processed
    if (result.processed === 0) break
    if (total % 100_000 === 0 || result.processed < BATCH_SIZE) {
      console.log(`[overview-backfill] processed=${total} cursor=${result.lastEventId}/${targetEventId}`)
    }
  }
}

function verify(targetEventId: number): string[] {
  const errors: string[] = []
  const now = Date.now()
  for (const range of ranges(now)) {
    console.log(`[overview-backfill] verifying ${range.range} ${range.from}..${range.to}`)
    const request = { ...range, maxEventId: targetEventId }
    const raw = computeRawBundle(db, request)
    const rollup = computeRollupBundle(db, request, 0)
    const mismatches = compareOverviewBundles(raw, rollup)
    for (const mismatch of mismatches.slice(0, 20)) {
      errors.push(`${range.range}:${mismatch.path} raw=${JSON.stringify(mismatch.raw)} rollup=${JSON.stringify(mismatch.rollup)}`)
    }
    if (mismatches.length > 20) errors.push(`${range.range}: and ${mismatches.length - 20} more mismatches`)
  }
  return errors
}

if (process.argv.includes('--reset')) {
  console.log('[overview-backfill] resetting derived rollup tables')
  resetOverviewRollup(db)
} else {
  setRollupStatus(db, 'building')
}
let targetEventId = getMaxEventId(db)
const activeState = getRollupState(db)
console.log(`[overview-backfill] starting cursor=${activeState.last_event_id} target=${targetEventId}`)
let tailPass = false

while (true) {
  backfill(targetEventId)
  const errors = verify(targetEventId)
  if (errors.length) {
    const detail = errors.join('\n')
    setRollupStatus(db, 'building', detail.slice(0, 2000))
    console.error(`[overview-backfill] parity failed\n${detail}`)
    process.exitCode = 1
    break
  }

  const newestEventId = getMaxEventId(db)
  if (newestEventId > targetEventId && !tailPass) {
    console.log(`[overview-backfill] parity passed at ${targetEventId}; catching tail to ${newestEventId}`)
    targetEventId = newestEventId
    tailPass = true
    continue
  }
  setRollupStatus(db, 'ready')
  if (newestEventId > targetEventId) {
    console.log(`[overview-backfill] ${newestEventId - targetEventId} new tail events left for incremental catchup`)
  }
  console.log(`[overview-backfill] parity passed; rollup is ready at event ${targetEventId}`)
  break
}
