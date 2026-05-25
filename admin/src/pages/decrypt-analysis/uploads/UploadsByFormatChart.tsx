import { useEffect, useMemo, useState } from 'react'
import { Card, Empty, Space, Tag, Typography, Button } from 'antd'
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, type UploadsByFormatPoint } from '../../../lib/api'
import { extLabel, formatDay } from '../../../lib/format'

const { Text } = Typography

// v0.4.1 上传日志页底部 · 按格式 × 时间双维度折线
// 横轴：日；可选格式（NCM/KGM/VPR/FLAC/OGG/MP3 多选）× 可选指标（5 项）
// 每条线 = (格式, 指标)；数量类落左 Y，占比类落右 Y（0-100%）
type MetricKey = 'total' | 'success' | 'fail' | 'share_pct' | 'success_rate'
type MetricMeta = { v: MetricKey; label: string; group: 'count' | 'pct' }
const METRICS: MetricMeta[] = [
  { v: 'total',        label: '上传总量', group: 'count' },
  { v: 'success',      label: '成功数',   group: 'count' },
  { v: 'fail',         label: '失败数',   group: 'count' },
  { v: 'share_pct',    label: '格式占比', group: 'pct' },
  { v: 'success_rate', label: '成功率',   group: 'pct' },
]

// 每个格式一个色系，搭配 metric 区分线型 / 暗度——这里简单用同色系一种色，靠线名识别
// QMC 系列共享同一蓝紫色族（用户视角它们都是「QQ 音乐」，分细只是 mflac/mgg 二选一的目标格式区别）
const EXT_COLORS: Record<string, string> = {
  ncm:  '#1677FF',
  kgm:  '#52C41A',
  vpr:  '#13C2C2',
  flac: '#FAAD14',
  ogg:  '#722ED1',
  mp3:  '#FA541C',
  // QMC 系列：紫红渐变区分
  mflac:   '#EB2F96',
  mflac0:  '#C41D7F',
  mflach:  '#9E1068',
  mgg:     '#F759AB',
  mgg0:    '#FF85C0',
  mgg1:    '#FFADD2',
  mggl:    '#FFD6E7',
  mmp4:    '#820014',
  qmcflac: '#A8071A',
  qmcogg:  '#CF1322',
  qmc0:    '#F5222D',
  qmc2:    '#FF4D4F',
  qmc3:    '#FF7875',
  qmc4:    '#FFA39E',
  qmc6:    '#FFCCC7',
  qmc8:    '#FFF1F0',
}
const fallback = '#999'

const DEFAULT_EXTS = ['ncm', 'kgm', 'flac']
const DEFAULT_METRICS: MetricKey[] = ['total', 'success_rate']

type ChartRow = Record<string, number | null> & { day: number }

// 把 backend points 重塑为 Recharts 单一 data：每条线一个 dataKey "<extLabel>·<metric label>"
function buildSeries(
  points: UploadsByFormatPoint[],
  selExts: string[],
  selMetrics: MetricKey[],
): { rows: ChartRow[]; series: { dataKey: string; color: string; group: 'count' | 'pct' }[] } {
  const series: { dataKey: string; color: string; group: 'count' | 'pct' }[] = []
  for (const ext of selExts) {
    for (const m of selMetrics) {
      const mMeta = METRICS.find((x) => x.v === m)!
      series.push({
        dataKey: `${extLabel(ext)} · ${mMeta.label}`,
        color: EXT_COLORS[ext] ?? fallback,
        group: mMeta.group,
      })
    }
  }
  const rows: ChartRow[] = points.map((p) => {
    const dayTotalAllExts = Object.values(p.per_ext).reduce((s, x) => s + (x.total ?? 0), 0)
    const row: ChartRow = { day: p.day }
    for (const ext of selExts) {
      const ent = p.per_ext[ext]
      for (const m of selMetrics) {
        const mMeta = METRICS.find((x) => x.v === m)!
        const key = `${extLabel(ext)} · ${mMeta.label}`
        if (!ent) { row[key] = null; continue }
        switch (m) {
          case 'total':        row[key] = ent.total; break
          case 'success':      row[key] = ent.success; break
          case 'fail':         row[key] = ent.fail; break
          case 'share_pct':
            row[key] = dayTotalAllExts > 0 ? +(ent.total / dayTotalAllExts * 100).toFixed(1) : null
            break
          case 'success_rate':
            row[key] = ent.total > 0 ? +(ent.success / ent.total * 100).toFixed(1) : null
            break
        }
      }
    }
    return row
  })
  return { rows, series }
}

const ALL_EXTS = [
  'ncm', 'kgm', 'vpr',
  'mflac', 'mflac0', 'mflach', 'mgg', 'mgg0', 'mgg1', 'mggl', 'mmp4',
  'qmcflac', 'qmcogg', 'qmc0', 'qmc2', 'qmc3', 'qmc4', 'qmc6', 'qmc8',
  'flac', 'ogg', 'mp3',
]

export function UploadsByFormatChart({ rq, reloadKey }: { rq: string; reloadKey: number }) {
  const [points, setPoints] = useState<UploadsByFormatPoint[]>([])
  const [exts, setExts] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selExts, setSelExts] = useState<string[]>(DEFAULT_EXTS)
  const [selMetrics, setSelMetrics] = useState<MetricKey[]>(DEFAULT_METRICS)

  useEffect(() => {
    setLoading(true)
    api.uploadsByFormat(rq)
      .then((d) => { setPoints(d.points); setExts(d.exts) })
      .finally(() => setLoading(false))
  }, [rq, reloadKey])

  // 时间窗口内有数据的格式优先展示在 tag 列表前面
  const orderedExts = useMemo(() => {
    const seen = new Set(exts)
    return [...exts, ...ALL_EXTS.filter((e) => !seen.has(e))]
  }, [exts])

  const { rows, series } = useMemo(
    () => buildSeries(points, selExts, selMetrics),
    [points, selExts, selMetrics],
  )

  const toggleExt = (e: string) => {
    setSelExts((prev) => prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e])
  }
  const toggleMetric = (m: MetricKey) => {
    setSelMetrics((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])
  }

  const hasCount = series.some((s) => s.group === 'count')
  const hasPct = series.some((s) => s.group === 'pct')
  const totalSeries = series.length

  return (
    <Card
      title="按格式维度拆解（时间趋势）"
      extra={
        <Text type="secondary" style={{ fontSize: 12 }}>
          {loading ? '加载中…' : `已选 ${selExts.length} 格式 × ${selMetrics.length} 指标 = ${totalSeries} 条线`}
        </Text>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        <Space wrap>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>格式</Text>
          {orderedExts.map((e) => {
            const active = selExts.includes(e)
            const color = EXT_COLORS[e] ?? fallback
            return (
              <Tag.CheckableTag
                key={e}
                checked={active}
                onChange={() => toggleExt(e)}
                style={active ? { background: color, color: '#fff' } : undefined}
              >
                {extLabel(e)}
              </Tag.CheckableTag>
            )
          })}
        </Space>
        <Space wrap>
          <Text type="secondary" style={{ fontSize: 12, marginRight: 4 }}>指标</Text>
          {METRICS.map((m) => {
            const active = selMetrics.includes(m.v)
            return (
              <Tag.CheckableTag
                key={m.v}
                checked={active}
                onChange={() => toggleMetric(m.v)}
              >
                {m.label}
              </Tag.CheckableTag>
            )
          })}
          {(selExts.length + selMetrics.length) > 0 && (
            <Button type="link" size="small" onClick={() => { setSelExts([]); setSelMetrics([]) }}>清空</Button>
          )}
          {(selExts.length === 0 || selMetrics.length === 0) && (
            <Button type="link" size="small"
              onClick={() => { setSelExts(DEFAULT_EXTS); setSelMetrics(DEFAULT_METRICS) }}>
              恢复默认
            </Button>
          )}
        </Space>
      </div>

      <div style={{ width: '100%', height: 360 }}>
        {selExts.length === 0 || selMetrics.length === 0 ? (
          <Empty description="请至少选 1 个格式 + 1 个指标" />
        ) : rows.length === 0 ? (
          <Empty description="时间窗口内暂无上传数据" />
        ) : (
          <ResponsiveContainer>
            <LineChart data={rows}>
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
                  const s = series.find((x) => x.dataKey === name)
                  if (!s) return [value, name]
                  return s.group === 'pct' ? [`${value}%`, name] : [value, name]
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {series.map((s) => (
                <Line
                  key={s.dataKey}
                  yAxisId={s.group === 'pct' ? 'right' : 'left'}
                  type="monotone"
                  dataKey={s.dataKey}
                  stroke={s.color}
                  // 用线型区分同色系内的不同 metric（count 实线、pct 虚线）
                  strokeDasharray={s.group === 'pct' ? '4 4' : undefined}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
