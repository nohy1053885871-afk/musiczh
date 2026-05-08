import type { ReactNode } from 'react'

export function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: 'default' | 'good' | 'warn'
}) {
  const valueColor =
    tone === 'good' ? '#3A9B5C' : tone === 'warn' ? '#B83020' : '#1C1A18'
  return (
    <div className="neumo p-5">
      <div className="text-xs" style={{ color: '#8A8680' }}>
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold" style={{ color: valueColor }}>
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-xs" style={{ color: '#A0988E' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export function PanelCard({ title, children, extra }: { title: ReactNode; children: ReactNode; extra?: ReactNode }) {
  return (
    <div className="neumo p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-medium" style={{ color: '#1C1A18' }}>{title}</div>
        {extra}
      </div>
      {children}
    </div>
  )
}
