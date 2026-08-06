import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, Input, Space, Typography, Button } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import { api, type ButtonsResp } from '../lib/api'
import { AppRangePicker, DEFAULT_RANGE, type Range, rangeQueryString } from '../components/biz/AppRangePicker'
import { DataTableCard } from '../components/biz/DataTableCard'
import { DownloadCSVButton } from '../components/biz/DownloadCSVButton'
import { eventLabel, labelForButtonBase, formatPct } from '../lib/format'

const { Title, Text } = Typography

type ButtonRow = ButtonsResp['buttons'][number]
type CompatRow = ButtonsResp['browser_compat'][number]
type RawRow = ButtonsResp['raw'][number]

const BROWSER_FAMILY_LABELS: Record<string, string> = {
  chromium: 'Chromium',
  edge: 'Edge',
  firefox: 'Firefox',
  safari: 'Safari',
  ios_webkit: 'iOS / iPadOS WebKit',
  unknown: '未知',
}

function browserFamilyLabel(family: string): string {
  return BROWSER_FAMILY_LABELS[family] ?? family
}

export function ButtonsPage() {
  const [range, setRange] = useState<Range>(DEFAULT_RANGE)
  const [data, setData] = useState<ButtonsResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const rq = useMemo(() => rangeQueryString(range), [range])

  const reload = useCallback(() => {
    setLoading(true)
    api.buttons(rq).then(setData).finally(() => setLoading(false))
  }, [rq])

  useEffect(() => { reload() }, [reload])

  const lowered = keyword.trim().toLowerCase()
  const matches = (event: string) => {
    if (!lowered) return true
    const label = eventLabel(event).toLowerCase()
    return event.toLowerCase().includes(lowered) || label.includes(lowered)
  }
  const filteredButtons = (data?.buttons ?? []).filter((b) => {
    if (!lowered) return true
    if (b.base.toLowerCase().includes(lowered)) return true
    // 沿着所有可能的后缀检查中文描述，命中即视为匹配
    if (labelForButtonBase(b.base).toLowerCase().includes(lowered)) return true
    return ['_click', '_view', '_confirm', '_close', '_dismiss'].some((s) =>
      matches(`${b.base}${s}`),
    )
  })
  const filteredRaw = (data?.raw ?? []).filter((r) => matches(r.event))

  const buttonsColumns: ColumnsType<ButtonRow> = [
    { title: '事件名', dataIndex: 'base', key: 'base',
      render: (v) => <code style={{ fontSize: 12 }}>{v}</code> },
    { title: '中文描述', key: 'label',
      render: (_, r) => labelForButtonBase(r.base) },
    { title: '曝光 PV', dataIndex: 'view_pv', key: 'view_pv', align: 'right', width: 90 },
    { title: '曝光 UV', dataIndex: 'view_uv', key: 'view_uv', align: 'right', width: 90 },
    { title: '点击 PV', dataIndex: 'click_pv', key: 'click_pv', align: 'right', width: 90,
      render: (v) => <strong>{v}</strong> },
    { title: '点击 UV', dataIndex: 'click_uv', key: 'click_uv', align: 'right', width: 90 },
    { title: 'CTR (PV)', dataIndex: 'ctr', key: 'ctr', align: 'right', width: 90,
      render: (v) => formatPct(v) },
    { title: 'CTR (UV)', dataIndex: 'ctr_uv', key: 'ctr_uv', align: 'right', width: 90,
      render: (v) => formatPct(v) },
  ]

  const rawColumns: ColumnsType<RawRow> = [
    { title: '事件名', dataIndex: 'event', key: 'event',
      render: (v) => <code style={{ fontSize: 12 }}>{v}</code> },
    { title: '中文描述', key: 'label', render: (_, r) => eventLabel(r.event) },
    { title: 'PV', dataIndex: 'pv', key: 'pv', align: 'right', width: 90 },
    { title: 'UV', dataIndex: 'uv', key: 'uv', align: 'right', width: 90 },
  ]

  const compatColumns: ColumnsType<CompatRow> = [
    { title: '浏览器', dataIndex: 'browser_family', key: 'browser_family', width: 170,
      render: (value) => browserFamilyLabel(value) },
    { title: '检测版本', dataIndex: 'detected_version', key: 'detected_version', width: 110 },
    { title: '最低要求', dataIndex: 'required_version', key: 'required_version', width: 110 },
    { title: '曝光 PV', dataIndex: 'view_pv', key: 'view_pv', align: 'right', width: 90 },
    { title: '曝光 UV', dataIndex: 'view_uv', key: 'view_uv', align: 'right', width: 90 },
    { title: '确定 PV', dataIndex: 'confirm_pv', key: 'confirm_pv', align: 'right', width: 90 },
    { title: '确定 UV', dataIndex: 'confirm_uv', key: 'confirm_uv', align: 'right', width: 90 },
    { title: '关闭 PV', dataIndex: 'close_pv', key: 'close_pv', align: 'right', width: 90 },
    { title: '关闭 UV', dataIndex: 'close_uv', key: 'close_uv', align: 'right', width: 90 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>按钮埋点</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            各按钮的曝光与点击 PV / UV，以及对应 CTR
          </Text>
        </div>
        <Space>
          <AppRangePicker value={range} onChange={setRange} />
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>刷新</Button>
        </Space>
      </div>

      <Card>
        <Input.Search
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="按事件名（如 btn_transcode）或中文描述（如 转 MP3）搜索"
          allowClear
        />
      </Card>

      <DataTableCard<CompatRow>
        title="低版本浏览器提示"
        toolbar={
          <DownloadCSVButton<CompatRow>
            filename="browser-compat.csv"
            columns={[
              { key: 'browser_family', title: '浏览器', format: (r) => browserFamilyLabel(r.browser_family) },
              { key: 'detected_version', title: '检测版本' },
              { key: 'required_version', title: '最低要求' },
              { key: 'view_pv', title: '曝光 PV' },
              { key: 'view_uv', title: '曝光 UV' },
              { key: 'confirm_pv', title: '确定 PV' },
              { key: 'confirm_uv', title: '确定 UV' },
              { key: 'close_pv', title: '关闭 PV' },
              { key: 'close_uv', title: '关闭 UV' },
            ]}
            dataSource={data?.browser_compat ?? []}
          />
        }
        columns={compatColumns}
        dataSource={data?.browser_compat ?? []}
        rowKey={(row) => `${row.browser_family}-${row.detected_version}-${row.required_version}`}
        loading={loading}
        scroll={{ x: 1010 }}
      />

      <DataTableCard<ButtonRow>
        title="按钮聚合（曝光 vs 点击）"
        toolbar={
          <DownloadCSVButton<ButtonRow>
            filename={`buttons-aggregated-${Date.now()}.csv`}
            columns={[
              { key: 'base', title: '事件名' },
              { key: 'label', title: '中文描述', format: (r) => labelForButtonBase(r.base) },
              { key: 'view_pv', title: '曝光 PV' },
              { key: 'view_uv', title: '曝光 UV' },
              { key: 'click_pv', title: '点击 PV' },
              { key: 'click_uv', title: '点击 UV' },
              { key: 'ctr', title: 'CTR (PV)', format: (r) => formatPct(r.ctr) },
              { key: 'ctr_uv', title: 'CTR (UV)', format: (r) => formatPct(r.ctr_uv) },
            ]}
            dataSource={filteredButtons}
          />
        }
        columns={buttonsColumns}
        dataSource={filteredButtons}
        rowKey="base"
        loading={loading}
      />

      <DataTableCard<RawRow>
        title="原始事件计数（*_click / *_view / *_confirm / *_close / *_dismiss）"
        toolbar={
          <DownloadCSVButton<RawRow>
            filename={`buttons-raw-${Date.now()}.csv`}
            columns={[
              { key: 'event', title: '事件名' },
              { key: 'label', title: '中文描述', format: (r) => eventLabel(r.event) },
              { key: 'pv', title: 'PV' },
              { key: 'uv', title: 'UV' },
            ]}
            dataSource={filteredRaw}
          />
        }
        columns={rawColumns}
        dataSource={filteredRaw}
        rowKey="event"
        loading={loading}
      />
    </div>
  )
}
