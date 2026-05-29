import { useEffect, useMemo, useState } from 'react'
import { Card, Empty, Space, Tag, Typography, Button } from 'antd'
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, type UploadsTimeseriesPoint } from '../../../lib/api'
import { formatDay } from '../../../lib/format'

const { Text } = Typography

// v0.4.1 上传日志页底部 · 单图双 Y 轴折线
// 数量类（左 Y 轴）：上传成功数 / 上传失败数 / 3 种失败原因 / 主动取消数
// 占比类（右 Y 轴）：上传成功占比 / 上传失败占比 / 3 种失败原因占比 / 主动取消占比
// v0.4.8：reject_large_batch → user_dismissed，与"被拒"语义割裂、单独成系列
//   - reject_total 后端已剔除主动取消（狭义被拒）；user_dismissed 单独字段
//   - success_pct / fail_pct 的 denom 改为 attempt + reject_total + user_dismissed（= upload_files）
//     这样 success_pct 与改造前完全一致、fail_pct 变小、user_dismissed_pct 补齐到 100%
//   - user_dismissed_pct 分母用 upload_files（不用 reject_total），更直观反映"50 文件阈值是否合理"
type MetricKey =
  | 'attempt' | 'reject_total' | 'reject_format' | 'reject_size' | 'reject_queue' | 'user_dismissed'
  | 'success_pct' | 'fail_pct' | 'reject_format_pct' | 'reject_size_pct' | 'reject_queue_pct' | 'user_dismissed_pct'

type MetricMeta = {
  v: MetricKey
  label: string
  color: string
  group: 'count' | 'pct'
}

const METRICS: MetricMeta[] = [
  // 数量
  { v: 'attempt',          label: '上传成功数',    color: '#52C41A', group: 'count' },
  { v: 'reject_total',     label: '上传失败数',    color: '#F5222D', group: 'count' },
  { v: 'reject_format',    label: '格式不支持数',  color: '#FA8C16', group: 'count' },
  { v: 'reject_size',      label: '超出大小数',    color: '#FAAD14', group: 'count' },
  { v: 'reject_queue',     label: '超出队列数',    color: '#722ED1', group: 'count' },
  { v: 'user_dismissed',   label: '主动取消数',    color: '#D48806', group: 'count' },
  // 占比
  { v: 'success_pct',      label: '上传成功占比',  color: '#389E0D', group: 'pct' },
  { v: 'fail_pct',         label: '上传失败占比',  color: '#CF1322', group: 'pct' },
  { v: 'reject_format_pct',label: '格式不支持占比', color: '#D46B08', group: 'pct' },
  { v: 'reject_size_pct',  label: '超出大小占比',  color: '#D48806', group: 'pct' },
  { v: 'reject_queue_pct', label: '超出队列占比',  color: '#531DAB', group: 'pct' },
  { v: 'user_dismissed_pct', label: '主动取消占比', color: '#AD6800', group: 'pct' },
]

const DEFAULT_SELECTED: MetricKey[] = ['attempt', 'reject_total']

type ChartRow = Record<string, number | null> & { day: number }

// 把后端按天点位 + 选中指标合并为 Recharts 单一 data 数组
// success_pct / fail_pct / user_dismissed_pct 分母 = upload_files（attempt + reject_total + user_dismissed），三类加起来 = 100%
// 各 reject_*_pct 分母 = reject_total（狭义被拒，不含主动取消），是"失败原因构成"占比
function buildSeries(points: UploadsTimeseriesPoint[], selected: MetricKey[]): ChartRow[] {
  return points.map((p) => {
    const denomAll = p.attempt + p.reject_total + p.user_dismissed
    const row: ChartRow = { day: p.day }
    for (const m of selected) {
      const meta = METRICS.find((x) => x.v === m)!
      const label = meta.label
      switch (m) {
        case 'attempt':        row[label] = p.attempt; break
        case 'reject_total':   row[label] = p.reject_total; break
        case 'reject_format':  row[label] = p.reject_format; break
        case 'reject_size':    row[label] = p.reject_size; break
        case 'reject_queue':   row[label] = p.reject_queue; break
        case 'user_dismissed': row[label] = p.user_dismissed; break
        case 'success_pct':       row[label] = denomAll > 0 ? +(p.attempt / denomAll * 100).toFixed(1) : null; break
        case 'fail_pct':          row[label] = denomAll > 0 ? +(p.reject_total / denomAll * 100).toFixed(1) : null; break
        case 'user_dismissed_pct':row[label] = denomAll > 0 ? +(p.user_dismissed / denomAll * 100).toFixed(1) : null; break
        case 'reject_format_pct':
          row[label] = p.reject_total > 0 ? +(p.reject_format / p.reject_total * 100).toFixed(1) : null; break
        case 'reject_size_pct':
          row[label] = p.reject_total > 0 ? +(p.reject_size / p.reject_total * 100).toFixed(1) : null; break
        case 'reject_queue_pct':
          row[label] = p.reject_total > 0 ? +(p.reject_queue / p.reject_total * 100).toFixed(1) : null; break
      }
    }
    return row
  })
}

export function UploadsTrendChart({ rq, reloadKey }: { rq: string; reloadKey: number }) {
  const [points, setPoints] = useState<UploadsTimeseriesPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<MetricKey[]>(DEFAULT_SELECTED)

  useEffect(() => {
    setLoading(true)
    api.uploadsTimeseries(rq)
      .then((d) => setPoints(d.points))
      .finally(() => setLoading(false))
  }, [rq, reloadKey])

  const data = useMemo(() => buildSeries(points, selected), [points, selected])

  const toggle = (m: MetricKey) => {
    setSelected((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])
  }

  // 是否有占比/数量被勾选——决定是否渲染对应 Y 轴
  const hasCount = selected.some((m) => METRICS.find((x) => x.v === m)!.group === 'count')
  const hasPct = selected.some((m) => METRICS.find((x) => x.v === m)!.group === 'pct')

  return (
    <Card
      title="上传趋势"
      extra={<Text type="secondary" style={{ fontSize: 12 }}>{loading ? '加载中…' : `已选 ${selected.length} / 10 项`}</Text>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <Space wrap>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>数量</Text>
          {METRICS.filter((m) => m.group === 'count').map((m) => {
            const active = selected.includes(m.v)
            return (
              <Tag.CheckableTag
                key={m.v}
                checked={active}
                onChange={() => toggle(m.v)}
                style={active ? { background: m.color, color: '#fff' } : undefined}
              >
                {m.label}
              </Tag.CheckableTag>
            )
          })}
        </Space>
        <Space wrap>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>占比</Text>
          {METRICS.filter((m) => m.group === 'pct').map((m) => {
            const active = selected.includes(m.v)
            return (
              <Tag.CheckableTag
                key={m.v}
                checked={active}
                onChange={() => toggle(m.v)}
                style={active ? { background: m.color, color: '#fff' } : undefined}
              >
                {m.label}
              </Tag.CheckableTag>
            )
          })}
          {selected.length > 0 && (
            <Button type="link" size="small" onClick={() => setSelected([])}>清空</Button>
          )}
          {selected.length === 0 && (
            <Button type="link" size="small" onClick={() => setSelected(DEFAULT_SELECTED)}>
              恢复默认
            </Button>
          )}
        </Space>
      </div>

      <div style={{ width: '100%', height: 320 }}>
        {selected.length === 0 ? (
          <Empty description="请勾选至少一个指标" />
        ) : (
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="day" tickFormatter={(v) => formatDay(v as number)} fontSize={11} />
              {hasCount && (
                <YAxis yAxisId="left" fontSize={11} allowDecimals={false} />
              )}
              {hasPct && (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  fontSize={11}
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                />
              )}
              <Tooltip
                labelFormatter={(v) => formatDay(v as number)}
                formatter={(value, name) => {
                  const meta = METRICS.find((m) => m.label === name)
                  if (!meta) return [value, name]
                  return meta.group === 'pct' ? [`${value}%`, name] : [value, name]
                }}
              />
              <Legend />
              {selected.map((k) => {
                const meta = METRICS.find((m) => m.v === k)!
                return (
                  <Line
                    key={k}
                    yAxisId={meta.group === 'pct' ? 'right' : 'left'}
                    type="monotone"
                    dataKey={meta.label}
                    stroke={meta.color}
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                )
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
