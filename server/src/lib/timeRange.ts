import { z } from 'zod'

const RangePresetSchema = z.enum(['today', '7d', '30d', '90d', '365d'])

function startOfTodayMs(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

// 解析 range：优先 from/to（自定义）；其次 range 预设；默认 30d
export function parseTimeRange(c: any): { from: number; to: number; range: string } {
  const fromQ = c.req.query('from')
  const toQ = c.req.query('to')
  if (fromQ || toQ) {
    const from = Number(fromQ ?? 0)
    const to = Number(toQ ?? Date.now())
    if (Number.isFinite(from) && Number.isFinite(to) && from <= to) {
      return { from, to, range: 'custom' }
    }
  }
  const raw = c.req.query('range') ?? '30d'
  const r = RangePresetSchema.safeParse(raw)
  const preset = r.success ? r.data : '30d'
  const now = Date.now()
  let from = now
  if (preset === 'today') from = startOfTodayMs()
  else {
    const days = preset === '7d' ? 7 : preset === '30d' ? 30 : preset === '90d' ? 90 : 365
    from = now - days * 86_400_000
  }
  return { from, to: now, range: preset }
}
