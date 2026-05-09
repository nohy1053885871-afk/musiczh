import { useEffect, useState } from 'react'
import { DatePicker, Segmented } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'

export type RangePreset = 'today' | '7d' | '30d' | '90d' | '365d'

export type Range =
  | { kind: 'preset'; preset: RangePreset }
  | { kind: 'custom'; from: number; to: number }

const PRESET_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: 'today', label: '今日' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: '90d', label: '近 90 天' },
  { value: '365d', label: '近 1 年' },
]

export function rangeQueryString(r: Range): string {
  if (r.kind === 'preset') return `range=${r.preset}`
  return `from=${r.from}&to=${r.to}`
}

export function rangeLabel(r: Range): string {
  if (r.kind === 'preset') {
    return PRESET_OPTIONS.find((p) => p.value === r.preset)?.label ?? r.preset
  }
  return `${dayjs(r.from).format('YYYY-MM-DD')} ~ ${dayjs(r.to).format('YYYY-MM-DD')}`
}

export const DEFAULT_RANGE: Range = { kind: 'preset', preset: 'today' }

export function AppRangePicker({
  value,
  onChange,
}: {
  value: Range
  onChange: (r: Range) => void
}) {
  const isCustom = value.kind === 'custom'
  const [customRange, setCustomRange] = useState<[Dayjs, Dayjs] | null>(
    isCustom ? [dayjs(value.from), dayjs(value.to)] : null,
  )

  useEffect(() => {
    if (isCustom) setCustomRange([dayjs(value.from), dayjs(value.to)])
    else setCustomRange(null)
  }, [value, isCustom])

  return (
    <div className="inline-flex items-center gap-3 flex-wrap">
      <Segmented
        value={isCustom ? '' : value.preset}
        options={PRESET_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
        onChange={(v) => onChange({ kind: 'preset', preset: v as RangePreset })}
      />
      <DatePicker.RangePicker
        value={customRange as [Dayjs, Dayjs] | null}
        allowClear={false}
        disabledDate={(d) => d.isAfter(dayjs().endOf('day'))}
        onChange={(v) => {
          if (!v || !v[0] || !v[1]) return
          onChange({
            kind: 'custom',
            from: v[0].startOf('day').valueOf(),
            to: v[1].endOf('day').valueOf(),
          })
        }}
        placeholder={['开始日期', '结束日期']}
      />
    </div>
  )
}
