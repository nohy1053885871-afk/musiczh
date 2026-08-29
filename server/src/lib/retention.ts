import db from '../db.js'

const ONE_DAY_MS = 86_400_000

function getRetentionDays(): number {
  const v = Number(process.env.RETENTION_DAYS ?? 365)
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 365
}

export function runRetention(): {
  events_deleted: number
  failures_deleted: number
  site_access_events_deleted: number
} {
  const days = getRetentionDays()
  const cutoff = Date.now() - days * ONE_DAY_MS
  const e = db.prepare('DELETE FROM events WHERE ts < ?').run(cutoff)
  const f = db.prepare('DELETE FROM failures WHERE ts < ?').run(cutoff)
  const s = db.prepare('DELETE FROM site_access_events WHERE ts < ?').run(cutoff)
  console.log(
    `[retention] cutoff=${new Date(cutoff).toISOString()} (${days}d), ` +
    `events deleted=${e.changes}, failures deleted=${f.changes}, ` +
    `site access events deleted=${s.changes}`,
  )
  return {
    events_deleted: e.changes as number,
    failures_deleted: f.changes as number,
    site_access_events_deleted: s.changes as number,
  }
}

// 计算"下一个 03:00"的延迟毫秒数
function msUntilNext03(): number {
  const now = new Date()
  const target = new Date(now)
  target.setHours(3, 0, 0, 0)
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1)
  return target.getTime() - now.getTime()
}

export function startRetentionCron() {
  const tick = () => {
    try { runRetention() } catch (err) { console.error('[retention] failed', err) }
    setTimeout(tick, 24 * 60 * 60 * 1000)
  }
  setTimeout(tick, msUntilNext03())
  console.log(`[retention] scheduled, first run in ${Math.round(msUntilNext03() / 60000)} min`)
}
