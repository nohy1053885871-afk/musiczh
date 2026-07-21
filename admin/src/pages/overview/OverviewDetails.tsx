import { useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Button, Card, Col, Empty, Row, Segmented, Space, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type {
  DeviceCombination, FunnelResp, FunnelStep, OverviewBundleResp, OverviewMetricKey,
} from '../../lib/api'
import { DataTableCard } from '../../components/biz/DataTableCard'
import { DownloadCSVButton } from '../../components/biz/DownloadCSVButton'
import { StatPie } from '../../components/biz/StatPie'
import { formatDay, formatPct, formatPercent } from '../../lib/format'

const { Text } = Typography
type FunnelDim = 'user' | 'file'
type MetricKey = OverviewMetricKey
type DeviceDimension = 'browser' | 'os' | 'device_type'
type DeviceFilter = { dim: DeviceDimension; value: string } | null
type DeviceRow = { dimension: string; name: string; n: number; pct: string }
type SeriesMap = Partial<Record<MetricKey, Array<{ day: number; v: number }>>>

const FUNNEL_COLORS = ['#1677FF', '#722ED1', '#13C2C2', '#52C41A']
const METRIC_OPTIONS: { v: MetricKey; label: string; color: string }[] = [
  { v: 'pv', label: 'PV', color: '#1677FF' },
  { v: 'uv', label: 'UV', color: '#52C41A' },
  { v: 'upload_uv', label: '上传 UV', color: '#722ED1' },
  { v: 'download_uv', label: '下载 UV', color: '#13C2C2' },
  { v: 'upload_files', label: '上传文件总数', color: '#FAAD14' },
  { v: 'decrypt_done', label: '解密成功', color: '#389E0D' },
  { v: 'decrypt_fail', label: '解密失败', color: '#F5222D' },
  { v: 'transcode_fail', label: '转码失败', color: '#FA541C' },
]
const DIM_LABEL: Record<DeviceDimension, string> = {
  browser: '浏览器', os: '操作系统', device_type: '设备类型',
}
const DEVICE_COLUMNS: ColumnsType<DeviceRow> = [
  { title: '维度', dataIndex: 'dimension', key: 'dimension', width: 120,
    render: (value) => <Tag color="blue">{value}</Tag> },
  { title: '名称', dataIndex: 'name', key: 'name' },
  { title: '访客数', dataIndex: 'n', key: 'n', align: 'right', width: 120 },
  { title: '占比', dataIndex: 'pct', key: 'pct', align: 'right', width: 100 },
]

export function OverviewDetails({ bundle, loading }: {
  bundle: OverviewBundleResp | null
  loading: boolean
}) {
  const [funnelDim, setFunnelDim] = useState<FunnelDim>('user')
  const [selectedMetrics, setSelectedMetrics] = useState<MetricKey[]>(['pv', 'uv'])
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>(null)
  const timeseries = bundle?.timeseries
  const devices = bundle?.devices.combinations ?? []
  const filteredDevices = useMemo(() => filterDevices(devices, deviceFilter), [devices, deviceFilter])
  const deviceTableData = useMemo(() => buildDeviceRows(filteredDevices), [filteredDevices])
  const customSeries = useMemo(
    () => mergeMultiSeries(selectedMetrics, timeseries ?? {}, METRIC_OPTIONS),
    [selectedMetrics, timeseries],
  )
  const toggleMetric = (metric: MetricKey) => {
    setSelectedMetrics((current) => current.includes(metric)
      ? current.filter((item) => item !== metric)
      : [...current, metric])
  }
  const toggleFilter = (dim: DeviceDimension, value: string) => {
    setDeviceFilter((current) => current?.dim === dim && current.value === value ? null : { dim, value })
  }

  return (
    <>
      <Card title="PV / UV 趋势">
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <LineChart data={mergeSeries(timeseries?.pv, timeseries?.uv, ['PV', 'UV'])}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="day" tickFormatter={formatDay} fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip labelFormatter={(value) => formatDay(value as number)} />
              <Legend />
              <Line type="monotone" dataKey="PV" stroke="#1677FF" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="UV" stroke="#52C41A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="转化漏斗" extra={(
        <Space>
          <Segmented value={funnelDim} onChange={(value) => setFunnelDim(value as FunnelDim)}
            options={[{ value: 'user', label: '按人 (UV)' }, { value: 'file', label: '按文件数' }]} />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {funnelDim === 'user' ? '访问 → 上传 → 转换 → 下载' : '上传总数 → 确认上传 → 转换成功 → 下载'}
          </Text>
        </Space>
      )}>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={funnelStepsOf(bundle?.funnel ?? null, funnelDim)} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip formatter={(value) => [value as number, funnelDim === 'user' ? 'UV' : '文件数']}
                labelFormatter={(label, payload) => {
                  const step = payload?.[0]?.payload as FunnelStep | undefined
                  if (!step) return String(label ?? '')
                  return [String(label ?? ''), step.pct_of_prev != null ? `较上层 ${formatPct(step.pct_of_prev)}` : '',
                    step.pct_of_first != null ? `总转化 ${formatPct(step.pct_of_first)}` : ''].filter(Boolean).join(' · ')
                }} />
              <Bar dataKey="n" radius={[6, 6, 0, 0]}>
                {funnelStepsOf(bundle?.funnel ?? null, funnelDim).map((_step, index) => (
                  <Cell key={index} fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]} />
                ))}
                <LabelList dataKey="label_text" position="top" fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="自定义指标趋势（多选）"
        extra={<Text type="secondary" style={{ fontSize: 12 }}>{loading ? '加载中…' : `已选 ${selectedMetrics.length} 个`}</Text>}>
        <Space wrap style={{ marginBottom: 16 }}>
          {METRIC_OPTIONS.map((metric) => {
            const active = selectedMetrics.includes(metric.v)
            return <Tag.CheckableTag key={metric.v} checked={active} onChange={() => toggleMetric(metric.v)}
              style={active ? { background: metric.color, color: '#fff' } : undefined}>{metric.label}</Tag.CheckableTag>
          })}
          {selectedMetrics.length > 0 && <Button type="link" size="small" onClick={() => setSelectedMetrics([])}>清空</Button>}
        </Space>
        <div style={{ width: '100%', height: 280 }}>
          {selectedMetrics.length === 0 ? <Empty description="请选择至少一个指标" /> : (
            <ResponsiveContainer>
              <LineChart data={customSeries}>
                <CartesianGrid stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="day" tickFormatter={formatDay} fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip labelFormatter={(value) => formatDay(value as number)} />
                <Legend />
                {selectedMetrics.map((metric) => {
                  const option = METRIC_OPTIONS.find((item) => item.v === metric)!
                  return <Line key={metric} type="monotone" dataKey={option.label}
                    stroke={option.color} strokeWidth={2} dot={false} />
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card title="访问设备环境" extra={(
        <Space>
          {deviceFilter && <Tag closable color="blue" onClose={() => setDeviceFilter(null)}>
            {DIM_LABEL[deviceFilter.dim]}：{deviceFilter.value}
          </Tag>}
          <Text type="secondary" style={{ fontSize: 12 }}>按 visitor_id 去重 · 点击扇区交叉筛选</Text>
        </Space>
      )}>
        <Row gutter={[16, 16]}>
          {(['browser', 'os', 'device_type'] as const).map((dimension) => (
            <Col xs={24} md={8} key={dimension}>
              <div style={{ textAlign: 'center', marginBottom: 8, fontWeight: 500 }}>{DIM_LABEL[dimension]}</div>
              <StatPie data={deviceList(filteredDevices, dimension).map((item) => ({ name: item.name, value: item.n }))}
                activeName={deviceFilter?.dim === dimension ? deviceFilter.value : undefined}
                onSliceClick={(name) => toggleFilter(dimension, name)} />
            </Col>
          ))}
        </Row>
      </Card>

      <DataTableCard<DeviceRow> title="设备分布明细" loading={loading} size="small"
        columns={DEVICE_COLUMNS} dataSource={deviceTableData} rowKey={(row) => `${row.dimension}-${row.name}`}
        toolbar={<DownloadCSVButton<DeviceRow> filename={`devices-${Date.now()}.csv`}
          columns={[{ key: 'dimension', title: '维度' }, { key: 'name', title: '名称' },
            { key: 'n', title: '访客数' }, { key: 'pct', title: '占比' }]}
          dataSource={deviceTableData} />} />
    </>
  )
}

type FilteredDevices = {
  browsers: { name: string; n: number }[]
  os: { name: string; n: number }[]
  device_types: { name: string; n: number }[]
}

function filterDevices(devices: DeviceCombination[], filter: DeviceFilter): FilteredDevices {
  const combinations = filter ? devices.filter((item) => item[filter.dim] === filter.value) : devices
  const tally = (key: DeviceDimension) => {
    const counts = new Map<string, number>()
    for (const item of combinations) counts.set(item[key], (counts.get(item[key]) ?? 0) + item.n)
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }))
  }
  return { browsers: tally('browser'), os: tally('os'), device_types: tally('device_type') }
}

function deviceList(devices: FilteredDevices, dimension: DeviceDimension): { name: string; n: number }[] {
  if (dimension === 'browser') return devices.browsers
  if (dimension === 'device_type') return devices.device_types
  return devices.os
}

function buildDeviceRows(devices: FilteredDevices): DeviceRow[] {
  const rows = (dimension: string, values: { name: string; n: number }[]) => {
    const total = values.reduce((sum, item) => sum + item.n, 0)
    return values.map((item) => ({ dimension, ...item, pct: formatPercent(item.n, total) }))
  }
  return [...rows('浏览器', devices.browsers), ...rows('操作系统', devices.os), ...rows('设备类型', devices.device_types)]
}

function funnelStepsOf(funnel: FunnelResp | null, dimension: FunnelDim) {
  const steps = dimension === 'user' ? funnel?.user.steps ?? [] : funnel?.file.steps ?? []
  return steps.map((step, index) => ({
    ...step,
    label_text: index === 0 || step.pct_of_prev == null ? String(step.n) : `${step.n} · ↘${formatPct(step.pct_of_prev)}`,
  }))
}

function mergeSeries(a: Array<{ day: number; v: number }> | undefined,
  b: Array<{ day: number; v: number }> | undefined, keys: [string, string]) {
  const rows = new Map<number, { day: number; [key: string]: number }>()
  for (const point of a ?? []) rows.set(point.day, { day: point.day, [keys[0]]: point.v, [keys[1]]: 0 })
  for (const point of b ?? []) {
    const row = rows.get(point.day) ?? { day: point.day, [keys[0]]: 0, [keys[1]]: 0 }
    row[keys[1]] = point.v
    rows.set(point.day, row)
  }
  return [...rows.values()].sort((aRow, bRow) => aRow.day - bRow.day)
}

function mergeMultiSeries(metrics: MetricKey[], byMetric: SeriesMap,
  options: { v: MetricKey; label: string }[]) {
  const rows = new Map<number, { day: number; [label: string]: number }>()
  for (const metric of metrics) {
    const label = options.find((option) => option.v === metric)?.label
    if (!label) continue
    for (const point of byMetric[metric] ?? []) {
      const row = rows.get(point.day) ?? { day: point.day }
      row[label] = point.v
      rows.set(point.day, row)
    }
  }
  return [...rows.values()].sort((a, b) => a.day - b.day).map((row) => {
    for (const metric of metrics) {
      const label = options.find((option) => option.v === metric)?.label
      if (label && row[label] == null) row[label] = 0
    }
    return row
  })
}
