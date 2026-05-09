import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const COLORS = [
  '#1677FF', '#13C2C2', '#52C41A', '#FAAD14', '#F5222D',
  '#722ED1', '#EB2F96', '#FA541C', '#A0D911', '#2F54EB',
]

export type PieDatum = { name: string; value: number }

export function StatPie({
  data,
  height = 240,
  innerRadius = 50,
  outerRadius = 80,
  activeName,
  onSliceClick,
}: {
  data: PieDatum[]
  height?: number
  innerRadius?: number
  outerRadius?: number
  activeName?: string
  onSliceClick?: (name: string) => void
}) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const hasFilter = !!activeName
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          paddingAngle={2}
          onClick={onSliceClick ? (d: { name?: string }) => d?.name && onSliceClick(d.name) : undefined}
          style={onSliceClick ? { cursor: 'pointer' } : undefined}
        >
          {data.map((d, i) => {
            const dim = hasFilter && d.name !== activeName ? 0.3 : 1
            return <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={dim} />
          })}
        </Pie>
        <Tooltip
          formatter={(v, name) => {
            const num = Number(v)
            return [
              `${num}${total ? `（${((num / total) * 100).toFixed(1)}%）` : ''}`,
              String(name),
            ]
          }}
        />
        <Legend verticalAlign="bottom" height={28} iconType="circle" />
      </PieChart>
    </ResponsiveContainer>
  )
}
