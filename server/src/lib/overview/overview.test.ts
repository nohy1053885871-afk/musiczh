import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import Database from 'better-sqlite3'
import { compareOverviewBundles } from './parity.js'
import { computeRawBundle } from './raw.js'
import { computeRollupBundle } from './rollupReader.js'
import { getMaxEventId, processRollupBatch } from './rollupWriter.js'
import { DAY_MS, dayBucket } from './shared.js'

const UA_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36'
const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36'

function createDb(path = ':memory:') {
  const db = new Database(path)
  db.exec(readFileSync(new URL('../../schema.sql', import.meta.url), 'utf8'))
  db.exec("ALTER TABLE events ADD COLUMN file_id TEXT GENERATED ALWAYS AS (json_extract(props,'$.file_id')) VIRTUAL")
  db.exec('CREATE INDEX idx_events_file_id ON events(file_id) WHERE file_id IS NOT NULL')
  return db
}

function seed(db: Database.Database) {
  const insert = db.prepare(
    `INSERT INTO events (ts,event,visitor_id,session_id,page,ua,ip,app_ver,props)
     VALUES (@ts,@event,@visitor_id,@session_id,'/',@ua,'127.0.0.1','test',@props)`,
  )
  const base = dayBucket(Date.now()) - 3 * DAY_MS
  const add = (
    day: number, offset: number, event: string, visitor: string,
    props: Record<string, unknown> = {}, ua = UA_DESKTOP,
  ) => insert.run({
    ts: base + day * DAY_MS + offset,
    event, visitor_id: visitor, session_id: `${visitor}-session`, ua,
    props: Object.keys(props).length ? JSON.stringify(props) : null,
  })

  add(0, 1_000, 'pageview', 'visitor-a')
  add(0, 2_000, 'upload_attempt', 'visitor-a', { file_id: 'file-success', file_ext: 'ncm' })
  add(0, 3_000, 'decrypt_fail', 'visitor-a', { file_id: 'file-success' })
  add(1, 1_000, 'decrypt_done', 'visitor-a', { file_id: 'file-success', source: 'ncm' }, UA_MOBILE)
  add(1, 2_000, 'download_done', 'visitor-a', { file_id: 'file-success' }, UA_MOBILE)

  add(1, 3_000, 'pageview', 'visitor-b', {}, UA_MOBILE)
  add(1, 4_000, 'upload_attempt', 'visitor-b', { file_id: 'file-abandon', file_ext: 'flac' }, UA_MOBILE)
  add(1, 5_000, 'transcode_abandon', 'visitor-b', { file_id: 'file-abandon' }, UA_MOBILE)
  add(2, 1_000, 'upload_attempt', 'visitor-b', { file_id: 'file-pending', file_ext: 'ogg' })
  add(2, 2_000, 'upload_reject', 'visitor-c', { reject_reason: 'FORMAT_UNSUPPORTED' })
  add(2, 3_000, 'upload_reject', 'visitor-c', { reject_reason: 'LARGE_BATCH_DISMISSED' })
  add(2, 4_000, 'upload_pick', 'visitor-c', { count: 2 })
  add(2, 5_000, 'transcode_done', 'visitor-c', { file_id: 'raw-file', file_size: 1000 })
  return { from: base, to: base + 3 * DAY_MS - 1 }
}

test('rollup preserves raw overview, funnel, timeseries and device results', () => {
  const db = createDb()
  const range = seed(db)
  const target = getMaxEventId(db)
  while (processRollupBatch(db, { allowBuilding: true, maxEventId: target, batchSize: 3 }).processed) {
    // Small batches exercise cursor resume and transaction idempotency.
  }
  assert.equal(processRollupBatch(db, { allowBuilding: true, maxEventId: target }).processed, 0)

  const request = { ...range, range: 'custom', maxEventId: target }
  const raw = computeRawBundle(db, request)
  const rollup = computeRollupBundle(db, request, 0)
  assert.deepEqual(compareOverviewBundles(raw, rollup), [])
  assert.equal(rollup.overview.success_files, 1)
  assert.equal(rollup.overview.abandoned_files, 1)
  assert.equal(rollup.overview.pending_files, 1)
  assert.equal(rollup.overview.dismissed_files, 1)

  const partialRequest = {
    from: range.from + 1_500,
    to: range.to - DAY_MS - 2_500,
    range: 'custom',
    maxEventId: target,
  }
  assert.deepEqual(
    compareOverviewBundles(
      computeRawBundle(db, partialRequest),
      computeRollupBundle(db, partialRequest, 0),
    ),
    [],
  )
  db.close()
})

test('worker serves and caches a raw bundle while rollup is building', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'musiczh-overview-'))
  const path = join(directory, 'analytics.db')
  const db = createDb(path)
  const range = seed(db)
  db.close()
  process.env.DB_PATH = path

  const { getOverviewBundle, stopOverviewWorker } = await import('./client.js')
  try {
    const request = { ...range, range: 'custom' }
    const [first, coalesced] = await Promise.all([
      getOverviewBundle(request, { cacheKey: 'worker-test', refresh: true }),
      getOverviewBundle(request, { cacheKey: 'worker-test', refresh: true }),
    ])
    const second = await getOverviewBundle(
      request,
      { cacheKey: 'worker-test' },
    )
    assert.equal(first.data_source, 'raw')
    assert.equal(coalesced, first)
    assert.equal(second.generated_at, first.generated_at)
  } finally {
    await stopOverviewWorker()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('worker falls back to raw when rollup read fails and restarts after termination', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'musiczh-overview-fallback-'))
  const path = join(directory, 'analytics.db')
  const db = createDb(path)
  const range = seed(db)
  const target = getMaxEventId(db)
  while (processRollupBatch(db, { allowBuilding: true, maxEventId: target }).processed) {
    // Complete a valid rollup before simulating a broken summary table.
  }
  db.prepare("UPDATE overview_rollup_state SET status = 'ready'").run()
  db.exec('DROP TABLE overview_daily_metrics')
  db.exec('CREATE TABLE overview_daily_metrics (broken INTEGER)')
  db.close()
  process.env.DB_PATH = path

  const { getOverviewBundle, stopOverviewWorker } = await import('./client.js')
  try {
    const first = await getOverviewBundle(
      { ...range, range: 'custom' },
      { cacheKey: 'fallback-test', refresh: true },
    )
    assert.equal(first.data_source, 'raw_fallback')

    await stopOverviewWorker()
    const restarted = await getOverviewBundle(
      { ...range, range: 'custom' },
      { cacheKey: 'fallback-restart-test', refresh: true },
    )
    assert.equal(restarted.data_source, 'raw_fallback')
  } finally {
    await stopOverviewWorker()
    rmSync(directory, { recursive: true, force: true })
  }
})
