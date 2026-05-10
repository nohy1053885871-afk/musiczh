import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, Cell, LabelList,
} from 'recharts'
import { Card, Row, Col, Statistic, Button, Space, Typography, Tag, Empty, Segmented } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  api,
  type OverviewResp, type FunnelResp, type FunnelStep, type TimeseriesResp, type DevicesResp,
} from '../lib/api'
import { AppRangePicker, DEFAULT_RANGE, type Range, rangeQueryString } from '../components/biz/AppRangePicker'
import { DataTableCard } from '../components/biz/DataTableCard'
import { DownloadCSVButton } from '../components/biz/DownloadCSVButton'
import { StatPie } from '../components/biz/StatPie'
import { formatDay, formatPct, formatPercent } from '../lib/format'

type FunnelDim = 'user' | 'file'
const FUNNEL_COLORS = ['#1677FF', '#722ED1', '#13C2C2', '#52C41A']

const { Title, Text } = Typography

type MetricKey =
  | 'pv' | 'uv' | 'upload_uv' | 'download_uv'
  | 'upload_files' | 'decrypt_done' | 'decrypt_fail' | 'transcode_fail'

const METRIC_OPTIONS: { v: MetricKey; label: string; color: string }[] = [
  { v: 'pv',             label: 'PV',         color: '#1677FF' },
  { v: 'uv',             label: 'UV',         color: '#52C41A' },
  { v: 'upload_uv',      label: '上传 UV',    color: '#722ED1' },
  { v: 'download_uv',    label: '下载 UV',    color: '#13C2C2' },
  { v: 'upload_files',   label: '上传文件总数', color: '#FAAD14' },
  { v: 'decrypt_done',   label: '解密成功',    color: '#389E0D' },
  { v: 'decrypt_fail',   label: '解密失败',    color: '#F5222D' },
  { v: 'transcode_fail', label: '转码失败',    color: '#FA541C' },
]

const DEFAULT_METRICS: MetricKey[] = ['pv', 'uv']

export function OverviewPage() {
  const [range, setRange] = useState<Range>(DEFAULT_RANGE)
  const [overview, setOverview] = useState<OverviewResp | null>(null)
  const [funnel, setFunnel] = useState<FunnelResp | null>(null)
  const [pvSeries, setPvSeries] = useState<TimeseriesResp | null>(null)
  const [uvSeries, setUvSeries] = useState<TimeseriesResp | null>(null)
  const [devices, setDevices] = useState<DevicesResp | null>(null)
  const [loading, setLoading] = useState(false)

  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(DEFAULT_METRICS)
  const [seriesByMetric, setSeriesByMetric] = useState<Partial<Record<MetricKey, TimeseriesResp>>>({})
  const [seriesLoading, setSeriesLoading] = useState(false)
  const [funnelDim, setFunnelDim] = useState<FunnelDim>('user')

  const rq = useMemo(() => rangeQueryString(range), [range])

  const reloadOverview = useCallback(async () => {
    setLoading(true)
    try {
      const [o, f, pv, uv, dev] = await Promise.all([
        api.overview(rq),
        api.funnel(rq),
        api.timeseries(rq, 'pv'),
        api.timeseries(rq, 'uv'),
        api.devices(rq),
      ])
      setOverview(o); setFunnel(f); setPvSeries(pv); setUvSeries(uv); setDevices(dev)
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

  const customSeries = useMemo(
    () => mergeMultiSeries(selectedMetrics, seriesByMetric, METRIC_OPTIONS),
    [selectedMetrics, seriesByMetric],
  )

  const toggleMetric = (m: MetricKey) => {
    setSelectedMetrics((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))
  }

  const toggleFilter = (dim: 'browser' | 'os' | 'device_type', value: string) => {
    setDeviceFilter((cur) => (cur && cur.dim === dim && cur.value === value ? null : { dim, value }))
  }

  const [deviceFilter, setDeviceFilter] = useState<{ dim: 'browser' | 'os' | 'device_type'; value: string } | null>(null)

  const filteredDevices = useMemo(() => filterDevices(devices, deviceFilter), [devices, deviceFilter])
  const deviceTableData = useMemo(() => buildDeviceRows(filteredDevices), [filteredDevices])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>数据概览</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            站点 PV / UV、人维度、件维度核心 8 指标
          </Text>
        </div>
        <Space>
          <AppRangePicker value={range} onChange={setRange} />
          <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loading || seriesLoading}>刷新</Button>
        </Space>
      </div>

      {/* 第一组：流量 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card><Statistic title="PV（页面访问）" value={overview?.pv ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="UV（独立访客）" value={overview?.uv ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="上传过的人 UV" value={overview?.upload_uv ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="下载过的人 UV" value={overview?.download_uv ?? 0} /></Card></Col>
      </Row>

      {/* 第二组：件维度 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card><Statistic title="上传文件总数（件）" value={overview?.upload_files ?? 0} /></Card></Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="解密成功（件）"
              value={overview?.decrypt_done ?? 0}
              valueStyle={{ color: '#389E0D' }}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>{`成功率 ${formatPct(overview?.decrypt_success_rate)}`}</Text>}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="解密失败（件）"
              value={overview?.decrypt_fail ?? 0}
              valueStyle={overview && overview.decrypt_fail > 0 ? { color: '#F5222D' } : undefined}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="转码失败（件）"
              value={overview?.transcode_fail ?? 0}
              valueStyle={overview && overview.transcode_fail > 0 ? { color: '#F5222D' } : undefined}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>{`成功率 ${formatPct(overview?.transcode_success_rate)}`}</Text>}
            />
          </Card>
        </Col>
      </Row>

      {/* PV/UV 趋势 */}
      <Card title="PV / UV 趋势">
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={mergeSeries(pvSeries, uvSeries, ['PV', 'UV'])}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="day" tickFormatter={formatDay} fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip labelFormatter={(v) => formatDay(v as number)} />
              <Legend />
              <Line type="monotone" dataKey="PV" stroke="#1677FF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="UV" stroke="#52C41A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 漏斗 */}
      <Card
        title="转化漏斗"
        extra={
          <Space>
            <Segmented
              value={funnelDim}
              onChange={(v) => setFunnelDim(v as FunnelDim)}
              options={[
                { value: 'user', label: '按人 (UV)' },
                { value: 'file', label: '按文件数' },
              ]}
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {funnelDim === 'user' ? '访问 → 上传 → 解密 → 下载' : '上传 → 解密 → 下载'}
            </Text>
          </Space>
        }
      >
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={funnelStepsOf(funnel, funnelDim)} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip
                formatter={(v) => [v as number, funnelDim === 'user' ? 'UV' : '文件数']}
                labelFormatter={(label, payload) => {
                  const step = payload?.[0]?.payload as FunnelStep | undefined
                  if (!step) return String(label ?? '')
                  const prev = step.pct_of_prev != null ? `较上层 ${formatPct(step.pct_of_prev)}` : ''
                  const first = step.pct_of_first != null ? `总转化 ${formatPct(step.pct_of_first)}` : ''
                  return [String(label ?? ''), prev, first].filter(Boolean).join(' · ')
                }}
              />
              <Bar dataKey="n" radius={[6, 6, 0, 0]}>
                {funnelStepsOf(funnel, funnelDim).map((_s, i) => (
                  <Cell key={i} fill={FUNNEL_COLORS[i % FUNNEL_COLORS.length]} />
                ))}
                <LabelList dataKey="label_text" position="top" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 自定义多指标趋势 */}
      <Card
        title="自定义指标趋势（多选）"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>{seriesLoading ? '加载中…' : `已选 ${selectedMetrics.length} 个`}</Text>}
      >
        <Space wrap style={{ marginBottom: 16 }}>
          {METRIC_OPTIONS.map((m) => {
            const active = selectedMetrics.includes(m.v)
            return (
              <Tag.CheckableTag
                key={m.v}
                checked={active}
                onChange={() => toggleMetric(m.v)}
                style={active ? { background: m.color, color: '#fff' } : undefined}
              >
                {m.label}
              </Tag.CheckableTag>
            )
          })}
          {selectedMetrics.length > 0 && (
            <Button type="link" size="small" onClick={() => setSelectedMetrics([])}>清空</Button>
          )}
        </Space>

        <div style={{ width: '100%', height: 280 }}>
          {selectedMetrics.length === 0 ? (
            <Empty description="请选择至少一个指标" />
          ) : (
            <ResponsiveContainer>
              <LineChart data={customSeries}>
                <CartesianGrid stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="day" tickFormatter={formatDay} fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip labelFormatter={(v) => formatDay(v as number)} />
                <Legend />
                {selectedMetrics.map((m) => {
                  const opt = METRIC_OPTIONS.find((o) => o.v === m)!
                  return (
                    <Line key={m} type="monotone" dataKey={opt.label} stroke={opt.color} strokeWidth={2} dot={false} />
                  )
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* 访问设备环境 */}
      <Card
        title="访问设备环境"
        extra={
          <Space>
            {deviceFilter && (
              <Tag closable color="blue" onClose={() => setDeviceFilter(null)}>
                {DIM_LABEL[deviceFilter.dim]}：{deviceFilter.value}
              </Tag>
            )}
            <Text type="secondary" style={{ fontSize: 12 }}>按 visitor_id 去重 · 点击扇区交叉筛选</Text>
          </Space>
        }
      >
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center', marginBottom: 8, fontWeight: 500 }}>浏览器</div>
            <StatPie
              data={filteredDevices.browsers.map((b) => ({ name: b.name, value: b.n }))}
              activeName={deviceFilter?.dim === 'browser' ? deviceFilter.value : undefined}
              onSliceClick={(name) => toggleFilter('browser', name)}
            />
          </Col>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center', marginBottom: 8, fontWeight: 500 }}>操作系统</div>
            <StatPie
              data={filteredDevices.os.map((b) => ({ name: b.name, value: b.n }))}
              activeName={deviceFilter?.dim === 'os' ? deviceFilter.value : undefined}
              onSliceClick={(name) => toggleFilter('os', name)}
            />
          </Col>
          <Col xs={24} md={8}>
            <div style={{ textAlign: 'center', marginBottom: 8, fontWeight: 500 }}>设备类型</div>
            <StatPie
              data={filteredDevices.device_types.map((b) => ({ name: b.name, value: b.n }))}
              activeName={deviceFilter?.dim === 'device_type' ? deviceFilter.value : undefined}
              onSliceClick={(name) => toggleFilter('device_type', name)}
            />
          </Col>
        </Row>
      </Card>

      <DataTableCard<DeviceRow>
        title="设备分布明细"
        toolbar={
          <DownloadCSVButton<DeviceRow>
            filename={`devices-${Date.now()}.csv`}
            columns={[
              { key: 'dimension', title: '维度' },
              { key: 'name', title: '名称' },
              { key: 'n', title: '访客数' },
              { key: 'pct', title: '占比' },
            ]}
            dataSource={deviceTableData}
          />
        }
        columns={DEVICE_COLUMNS}
        dataSource={deviceTableData}
        rowKey={(r) => `${r.dimension}-${r.name}`}
        loading={loading}
        size="small"
      />
    </div>
  )
}

type DeviceRow = { dimension: string; name: string; n: number; pct: string }

const DIM_LABEL: Record<'browser' | 'os' | 'device_type', string> = {
  browser: '浏览器',
  os: '操作系统',
  device_type: '设备类型',
}

const DEVICE_COLUMNS: ColumnsType<DeviceRow> = [
  { title: '维度', dataIndex: 'dimension', key: 'dimension', width: 120,
    render: (v) => <Tag color="blue">{v}</Tag> },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '访客数', dataIndex: 'n', key: 'n', align: 'right', width: 120 },
  { title: '占比', dataIndex: 'pct', key: 'pct', align: 'right', width: 100 },
]

type FilteredDevices = {
  browsers: { name: string; n: number }[]
  os: { name: string; n: number }[]
  device_types: { name: string; n: number }[]
}

function filterDevices(
  devices: DevicesResp | null,
  filter: { dim: 'browser' | 'os' | 'device_type'; value: string } | null,
): FilteredDevices {
  if (!devices) return { browsers: [], os: [], device_types: [] }
  if (!filter) {
    return {
      browsers: devices.browsers,
      os: devices.os,
      device_types: devices.device_types,
    }
  }
  const visitors = devices.visitors.filter((v) => v[filter.dim] === filter.value)
  const tally = (key: 'browser' | 'os' | 'device_type') => {
    const m = new Map<string, number>()
    for (const v of visitors) m.set(v[key], (m.get(v[key]) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))
  }
  return {
    browsers: tally('browser'),
    os: tally('os'),
    device_types: tally('device_type'),
  }
}

function buildDeviceRows(devices: FilteredDevices): DeviceRow[] {
  const sumOf = (arr: { n: number }[]) => arr.reduce((s, x) => s + x.n, 0)
  const browserTotal = sumOf(devices.browsers)
  const osTotal = sumOf(devices.os)
  const dtTotal = sumOf(devices.device_types)
  return [
    ...devices.browsers.map((b) => ({ dimension: '浏览器', name: b.name, n: b.n, pct: formatPercent(b.n, browserTotal) })),
    ...devices.os.map((b) => ({ dimension: '操作系统', name: b.name, n: b.n, pct: formatPercent(b.n, osTotal) })),
    ...devices.device_types.map((b) => ({ dimension: '设备类型', name: b.name, n: b.n, pct: formatPercent(b.n, dtTotal) })),
  ]
}

type FunnelStepWithLabel = FunnelStep & { label_text: string }

function funnelStepsOf(funnel: FunnelResp | null, dim: FunnelDim): FunnelStepWithLabel[] {
  if (!funnel) return []
  const steps = dim === 'user' ? (funnel.user?.steps ?? []) : (funnel.file?.steps ?? [])
  return steps.map((s, i) => ({
    ...s,
    label_text:
      i === 0 || s.pct_of_prev == null
        ? String(s.n)
        : `${s.n} · ↘${formatPct(s.pct_of_prev)}`,
  }))
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
  const out = [...map.values()].sort((x, y) => x.day - y.day)
  for (const row of out) {
    for (const m of metrics) {
      const label = options.find((o) => o.v === m)?.label
      if (label && row[label] === undefined) row[label] = 0
    }
  }
  return out
}
