import { useEffect, useRef, useState } from 'react'

export type RangePreset = 'today' | '7d' | '30d' | '90d' | '365d'

export type Range =
  | { kind: 'preset'; preset: RangePreset }
  | { kind: 'custom'; from: number; to: number }

const PRESETS: { v: RangePreset; label: string }[] = [
  { v: 'today', label: '今日' },
  { v: '7d', label: '近 7 天' },
  { v: '30d', label: '近 30 天' },
  { v: '90d', label: '近 90 天' },
  { v: '365d', label: '近 1 年' },
]

function toIsoDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function startOfDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime()
}
function endOfDay(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).getTime()
}

export function rangeQueryString(r: Range): string {
  if (r.kind === 'preset') return `range=${r.preset}`
  return `from=${r.from}&to=${r.to}`
}

export function rangeLabel(r: Range): string {
  if (r.kind === 'preset') return PRESETS.find((p) => p.v === r.preset)?.label ?? r.preset
  return `${toIsoDate(r.from)} ~ ${toIsoDate(r.to)}`
}

export function RangePicker({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const [open, setOpen] = useState(false)
  const today = toIsoDate(Date.now())
  const initFrom = value.kind === 'custom' ? toIsoDate(value.from) : today
  const initTo = value.kind === 'custom' ? toIsoDate(value.to) : today
  const [fromIso, setFromIso] = useState(initFrom)
  const [toIso, setToIso] = useState(initTo)

  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const apply = () => {
    if (!fromIso || !toIso) return
    const f = startOfDay(fromIso)
    const t = endOfDay(toIso)
    if (f > t) return
    onChange({ kind: 'custom', from: f, to: t })
    setOpen(false)
  }

  const isCustom = value.kind === 'custom'

  return (
    <div ref={wrapRef} className="relative inline-flex items-center gap-2">
      <div className="inline-flex rounded-lg overflow-hidden" style={{
        background: '#ECEAE6',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
      }}>
        {PRESETS.map((o) => {
          const active = value.kind === 'preset' && value.preset === o.v
          return (
            <button
              key={o.v}
              onClick={() => onChange({ kind: 'preset', preset: o.v })}
              className="px-3 py-1.5 text-xs transition"
              style={active
                ? {
                    background: 'linear-gradient(180deg, #FFFFFF 0%, #F0EEEA 100%)',
                    color: '#1C1A18',
                    fontWeight: 600,
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.06)',
                  }
                : { color: '#8A8680' }}
            >
              {o.label}
            </button>
          )
        })}
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 text-xs rounded-lg transition"
        style={isCustom
          ? {
              background: 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
              color: '#fff',
              fontWeight: 600,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 1px 3px rgba(232,67,26,0.35)',
            }
          : {
              background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
              color: '#1C1A18',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.06)',
            }}
      >
        {isCustom ? `${toIsoDate(value.from)} ~ ${toIsoDate(value.to)}` : '自定义 ▾'}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-2 p-4 rounded-xl"
          style={{
            background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
            boxShadow: '0 12px 32px -8px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.07)',
            minWidth: 280,
          }}
        >
          <div className="text-xs mb-3" style={{ color: '#8A8680' }}>选择自定义时间范围</div>
          <div className="space-y-3">
            <label className="block">
              <div className="text-xs mb-1" style={{ color: '#8A8680' }}>开始日期</div>
              <input
                type="date"
                value={fromIso}
                max={toIso || today}
                onChange={(e) => setFromIso(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md text-sm outline-none"
              />
            </label>
            <label className="block">
              <div className="text-xs mb-1" style={{ color: '#8A8680' }}>结束日期</div>
              <input
                type="date"
                value={toIso}
                min={fromIso}
                max={today}
                onChange={(e) => setToIso(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-md text-sm outline-none"
              />
            </label>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              onClick={() => setOpen(false)}
              className="text-xs px-3 py-1.5"
              style={{ color: '#8A8680' }}
            >取消</button>
            <button
              onClick={apply}
              disabled={!fromIso || !toIso || startOfDay(fromIso) > endOfDay(toIso)}
              className="btn-primary text-xs px-3 py-1.5 rounded-md font-medium"
            >应用</button>
          </div>
        </div>
      )}
    </div>
  )
}
