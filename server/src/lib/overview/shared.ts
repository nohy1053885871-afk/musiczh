import type { DeviceCombination, FunnelStep } from './types.js'

export const DAY_MS = 86_400_000
export const TZ_OFFSET_MS = -new Date().getTimezoneOffset() * 60_000
export const DAY_BUCKET_SQL = `((ts + ${TZ_OFFSET_MS}) / ${DAY_MS}) * ${DAY_MS} - ${TZ_OFFSET_MS}`

export function dayBucket(ts: number): number {
  return Math.floor((ts + TZ_OFFSET_MS) / DAY_MS) * DAY_MS - TZ_OFFSET_MS
}

export function buildSteps(raw: Array<{ name: string; n: number }>): FunnelStep[] {
  const first = raw[0]?.n ?? 0
  return raw.map((row, index) => {
    const previous = index === 0 ? row.n : raw[index - 1].n
    return {
      ...row,
      uv: row.n,
      pct_of_prev: previous > 0 ? row.n / previous : null,
      pct_of_first: first > 0 ? row.n / first : null,
    }
  })
}

export function combinationsFromVisitors(
  visitors: Iterable<{ browser: string; os: string; device_type: string }>,
): DeviceCombination[] {
  const counts = new Map<string, DeviceCombination>()
  for (const visitor of visitors) {
    const key = `${visitor.browser}\u0000${visitor.os}\u0000${visitor.device_type}`
    const current = counts.get(key)
    if (current) current.n += 1
    else counts.set(key, {
      browser: visitor.browser,
      os: visitor.os,
      device_type: visitor.device_type,
      n: 1,
    })
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)
}
