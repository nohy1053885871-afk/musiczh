import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import { api, type OverviewResp, type FunnelResp, type TimeseriesResp } from '../lib/api'
import { StatCard, PanelCard } from '../components/Card'
import { RangePicker, type Range, rangeQueryString } from '../components/RangePicker'
import { RefreshButton } from '../components/RefreshButton'
import { formatDay, formatPct } from '../lib/format'

type MetricKey =
  | 'pv' | 'uv' | 'upload_uv' | 'download_uv'
  | 'upload_files' | 'decrypt_done' | 'decrypt_fail' | 'transcode_fail'

const METRIC_OPTIONS: { v: MetricKey; label: string; color: string }[] = [
  { v: 'pv',             label: 'PV',         color: '#F05A2A' },
  { v: 'uv',             label: 'UV',         color: '#3A9B5C' },
  { v: 'upload_uv',      label: '上传 UV',    color: '#7B5BD6' },
  { v: 'download_uv',    label: '下载 UV',    color: '#2A8DC9' },
  { v: 'upload_files',   label: '上传文件总数', color: '#D6A437' },
  { v: 'decrypt_done',   label: '解密成功',    color: '#236B3A' },
  { v: 'decrypt_fail',   label: '解密失败',    color: '#B83020' },
  { v: 'transcode_fail', label: '转码失败',    color: '#8B3A1A' },
]

const DEFAULT_METRICS: MetricKey[] = ['pv', 'uv']

export function OverviewPage() {
  const [range, setRange] = useState<Range>({ kind: 'preset', preset: '30d' })
  const [overview, setOverview] = useState<OverviewResp | null>(null)
  const [funnel, setFunnel] = useState<FunnelResp | null>(null)
  const [pvSeries, setPvSeries] = useState<TimeseriesResp | null>(null)
  const [uvSeries, setUvSeries] = useState<TimeseriesResp | null>(null)
  const [loading, setLoading] = useState(false)

  // 多选趋势图
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(DEFAULT_METRICS)
  const [seriesByMetric, setSeriesByMetric] = useState<Partial<Record<MetricKey, TimeseriesResp>>>({})
  const [seriesLoading, setSeriesLoading] = useState(false)

  const rq = useMemo(() => rangeQueryString(range), [range])

  const reloadOverview = useCallback(async () => {
    setLoading(true)
    try {
      const [o, f, pv, uv] = await Promise.all([
        api.overview(rq),
        api.funnel(rq),
        api.timeseries(rq, 'pv'),
        api.timeseries(rq, 'uv'),
      ])
      setOverview(o); setFunnel(f); setPvSeries(pv); setUvSeries(uv)
    } finally {
      setLoading(false)
    }
  }, [rq])

  const reloadCustomChart = useCallback(async () => {
    if (!selectedMetrics.length) { setSeriesByMetric({}); return }
    setSeriesLoading(true)
    try {
      const results = await Promise.all(
        selectedMetrics.map((m) => api.timeseries(rq, m).then((r) => [m, r] as const)),
      )
      const next: Partial<Record<MetricKey, TimeseriesResp>> = {}
      for (const [m, r] of results) next[m] = r
      setSeriesByMetric(next)
    } finally {
      setSeriesLoading(false)
    }
  }, [rq, selectedMetrics])

  useEffect(() => { reloadOverview() }, [reloadOverview])
  useEffect(() => { reloadCustomChart() }, [reloadCustomChart])

  const refreshAll = useCallback(() => {
    reloadOverview()
    reloadCustomChart()
  }, [reloadOverview, reloadCustomChart])

  const customSeries = useMemo(() => mergeMultiSeries(selectedMetrics, seriesByMetric, METRIC_OPTIONS),
    [selectedMetrics, seriesByMetric])

  const toggleMetric = (m: MetricKey) => {
    setSelectedMetrics((cur) =>
      cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m],
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xl font-semibold">数据概览</div>
          <div className="text-xs mt-1" style={{ color: '#8A8680' }}>
            站点 PV / UV、人维度、件维度核心 8 指标 {loading && '· 加载中…'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RangePicker value={range} onChange={setRange} />
          <RefreshButton onClick={refreshAll} loading={loading || seriesLoading} />
        </div>
      </div>

      {/* 第一组：流量 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="PV（页面访问）" value={overview?.pv ?? '-'} sub="所有 pageview 事件" />
        <StatCard label="UV（独立访客）" value={overview?.uv ?? '-'} sub="按 visitor_id 去重" />
        <StatCard label="上传过的人 UV" value={overview?.upload_uv ?? '-'} sub="拖拽 / 点选过文件的人数" />
        <StatCard label="下载过的人 UV" value={overview?.download_uv ?? '-'} sub="单文件 + 散下载 + ZIP 下载" />
      </div>

      {/* 第二组：件维度 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="上传文件总数" value={overview?.upload_files ?? '-'} sub="进入解密队列的文件数" />
        <StatCard
          label="解密成功"
          value={overview?.decrypt_done ?? '-'}
          sub={`成功率 ${formatPct(overview?.decrypt_success_rate)}`}
          tone="good"
        />
        <StatCard
          label="解密失败"
          value={overview?.decrypt_fail ?? '-'}
          sub="点「失败日志」看详情"
          tone={overview && overview.decrypt_fail > 0 ? 'warn' : 'default'}
        />
        <StatCard
          label="转码失败"
          value={overview?.transcode_fail ?? '-'}
          sub={`成功率 ${formatPct(overview?.transcode_success_rate)}`}
          tone={overview && overview.transcode_fail > 0 ? 'warn' : 'default'}
        />
      </div>

      {/* PV/UV 趋势 */}
      <PanelCard title="PV / UV 趋势">
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={mergeSeries(pvSeries, uvSeries, ['PV', 'UV'])}>
              <CartesianGrid stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="day" tickFormatter={formatDay} stroke="#8A8680" fontSize={11} />
              <YAxis stroke="#8A8680" fontSize={11} allowDecimals={false} />
              <Tooltip labelFormatter={(v) => formatDay(v as number)} />
              <Line type="monotone" dataKey="PV" stroke="#F05A2A" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="UV" stroke="#3A9B5C" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </PanelCard>

      {/* 漏斗 */}
      <PanelCard title="转化漏斗（按人/UV）" extra={<span className="text-xs" style={{ color: '#8A8680' }}>上传 → 解密成功 → 下载</span>}>
        <div style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={funnel?.steps ?? []}>
              <CartesianGrid stroke="rgba(0,0,0,0.05)" />
              <XAxis dataKey="name" stroke="#8A8680" fontSize={11} />
              <YAxis stroke="#8A8680" fontSize={11} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="uv" radius={[6, 6, 0, 0]}>
                {(funnel?.steps ?? []).map((_s, i) => (
                  <Cell key={i} fill={['#F05A2A', '#E8431A', '#C4310E'][i]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </PanelCard>

      {/* 自定义多指标趋势 */}
      <PanelCard
        title="自定义指标趋势（多选）"
        extra={<span className="text-xs" style={{ color: '#8A8680' }}>{seriesLoading ? '加载中…' : `已选 ${selectedMetrics.length} 个`}</span>}
      >
        <div className="flex flex-wrap gap-2 mb-4">
          {METRIC_OPTIONS.map((m) => {
            const active = selectedMetrics.includes(m.v)
            return (
              <button
                key={m.v}
                onClick={() => toggleMetric(m.v)}
                className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
                style={active
                  ? {
                      background: '#1C1A18',
                      color: '#fff',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    }
                  : { background: '#ECEAE6', color: '#1C1A18' }}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: m.color }}
                />
                {m.label}
              </button>
            )
          })}
          {selectedMetrics.length > 0 && (
            <button
              onClick={() => setSelectedMetrics([])}
              className="px-2.5 py-1 rounded-md text-xs"
              style={{ color: '#8A8680' }}
            >
              清空
            </button>
          )}
        </div>

        <div style={{ width: '100%', height: 280 }}>
          {selectedMetrics.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: '#A0988E' }}>
              请选择至少一个指标
            </div>
          ) : (
            <ResponsiveContainer>
              <LineChart data={customSeries}>
                <CartesianGrid stroke="rgba(0,0,0,0.05)" />
                <XAxis dataKey="day" tickFormatter={formatDay} stroke="#8A8680" fontSize={11} />
                <YAxis stroke="#8A8680" fontSize={11} allowDecimals={false} />
                <Tooltip labelFormatter={(v) => formatDay(v as number)} />
                <Legend />
                {selectedMetrics.map((m) => {
                  const opt = METRIC_OPTIONS.find((o) => o.v === m)!
                  return (
                    <Line
                      key={m}
                      type="monotone"
                      dataKey={opt.label}
                      stroke={opt.color}
                      strokeWidth={2}
                      dot={false}
                    />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </PanelCard>
    </div>
  )
}

function mergeSeries(
  a: TimeseriesResp | null,
  b: TimeseriesResp | null,
  keys: [string, string],
): { day: number; [k: string]: number }[] {
  const map = new Map<number, { day: number; [k: string]: number }>()
  for (const p of a?.points ?? []) {
    map.set(p.day, { day: p.day, [keys[0]]: p.v, [keys[1]]: 0 })
  }
  for (const p of b?.points ?? []) {
    const cur = map.get(p.day)
    if (cur) cur[keys[1]] = p.v
    else map.set(p.day, { day: p.day, [keys[0]]: 0, [keys[1]]: p.v })
  }
  return [...map.values()].sort((x, y) => x.day - y.day)
}

function mergeMultiSeries(
  metrics: MetricKey[],
  byMetric: Partial<Record<MetricKey, TimeseriesResp>>,
  options: { v: MetricKey; label: string }[],
): { day: number; [label: string]: number }[] {
  const map = new Map<number, { day: number; [label: string]: number }>()
  for (const m of metrics) {
    const opt = options.find((o) => o.v === m)
    const series = byMetric[m]
    if (!opt || !series) continue
    for (const p of series.points) {
      const cur = map.get(p.day) ?? { day: p.day }
      cur[opt.label] = p.v
      map.set(p.day, cur)
    }
  }
  // 把缺失的点补 0
  const out = [...map.values()].sort((x, y) => x.day - y.day)
  for (const row of out) {
    for (const m of metrics) {
      const label = options.find((o) => o.v === m)?.label
      if (label && row[label] === undefined) row[label] = 0
    }
  }
  return out
}
