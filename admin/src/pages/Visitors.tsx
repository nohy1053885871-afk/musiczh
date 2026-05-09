import { useCallback, useEffect, useMemo, useState } from 'react'
import { Space, Typography, Button, Drawer, Input, Select, Tag, Descriptions, Table } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import type { ColumnsType } from 'antd/es/table'
import {
  api,
  type VisitorRow, type VisitorDetail, type VisitorTimelineEvent, type VisitorsResp,
} from '../lib/api'
import { AppRangePicker, DEFAULT_RANGE, type Range, rangeQueryString } from '../components/biz/AppRangePicker'
import { DataTableCard } from '../components/biz/DataTableCard'
import { DownloadCSVButton } from '../components/biz/DownloadCSVButton'
import { formatTime, eventLabel, channelColor, shortUA } from '../lib/format'

const { Title, Text } = Typography

const PAGE_SIZE = 10

export function VisitorsPage() {
  const [range, setRange] = useState<Range>(DEFAULT_RANGE)
  const rq = useMemo(() => rangeQueryString(range), [range])

  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [browser, setBrowser] = useState('')
  const [os, setOs] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [channel, setChannel] = useState('')
  const [data, setData] = useState<VisitorsResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<VisitorDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  const queryParams = useMemo(() => {
    const [k, v] = rq.split('=')
    return k === 'range' ? { range: v } : Object.fromEntries(new URLSearchParams(rq))
  }, [rq])

  const load = useCallback(() => {
    setLoading(true)
    api
      .visitors({
        ...queryParams,
        page,
        size: PAGE_SIZE,
        q: q || undefined,
        browser: browser || undefined,
        os: os || undefined,
        device_type: deviceType || undefined,
        channel: channel || undefined,
      })
      .then(setData)
      .finally(() => setLoading(false))
  }, [queryParams, page, q, browser, os, deviceType, channel])

  useEffect(() => { load() }, [load])
  useEffect(() => { setPage(1) }, [q, browser, os, deviceType, channel, rq])

  const openDetail = async (visitorId: string) => {
    setDetailLoading(true)
    try {
      const d = await api.visitorDetail(visitorId)
      setDetail(d)
    } finally {
      setDetailLoading(false)
    }
  }

  const opts = data?.options
  const toOptions = (vs: string[]) => [{ value: '', label: '全部' }, ...vs.map((v) => ({ value: v, label: v }))]

  const columns: ColumnsType<VisitorRow> = [
    { title: '末访', dataIndex: 'last_ts', key: 'last_ts', width: 165,
      render: (v) => <code style={{ fontSize: 12 }}>{formatTime(v)}</code> },
    { title: '首访', dataIndex: 'first_ts', key: 'first_ts', width: 165,
      render: (v) => <code style={{ fontSize: 12 }}>{formatTime(v)}</code> },
    { title: 'visitor_id', dataIndex: 'visitor_id', key: 'visitor_id', width: 280, ellipsis: true,
      render: (v) => <code style={{ fontSize: 11 }}>{v}</code> },
    { title: '会话', dataIndex: 'sessions', key: 'sessions', align: 'right', width: 70 },
    { title: '事件', dataIndex: 'events', key: 'events', align: 'right', width: 70 },
    { title: '浏览器', dataIndex: 'browser', key: 'browser', width: 110 },
    { title: '操作系统', dataIndex: 'os', key: 'os', width: 110 },
    { title: '设备', dataIndex: 'device_type', key: 'device_type', width: 80,
      render: (v) => <Tag>{v}</Tag> },
    { title: '渠道', dataIndex: 'channel', key: 'channel', width: 110,
      render: (v) => <Tag color={channelColor(v)}>{v}</Tag> },
    { title: 'IP', dataIndex: 'ip', key: 'ip', width: 130,
      render: (v) => v ? <code style={{ fontSize: 12 }}>{v}</code> : '-' },
    { title: '首次进入', dataIndex: 'first_page', key: 'first_page', ellipsis: true,
      render: (v) => v ?? '-' },
    { title: '', key: 'op', width: 70, fixed: 'right',
      render: (_, r) => (
        <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); openDetail(r.visitor_id) }}>
          查看
        </Button>
      ) },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>访客日志</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            按 visitor_id 聚合的访问明细 · 末访倒序
          </Text>
        </div>
        <Space>
          <AppRangePicker value={range} onChange={setRange} />
          <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
        </Space>
      </div>

      <DataTableCard<VisitorRow>
        title={`访客列表（共 ${data?.total ?? 0} 个）`}
        toolbar={
          <Space wrap>
            <Input.Search
              placeholder="搜索 visitor_id"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              allowClear
              style={{ width: 200 }}
            />
            <Select value={browser} onChange={setBrowser} options={toOptions(opts?.browsers ?? [])}
              style={{ width: 130 }} placeholder="浏览器" />
            <Select value={os} onChange={setOs} options={toOptions(opts?.os ?? [])}
              style={{ width: 130 }} placeholder="操作系统" />
            <Select value={deviceType} onChange={setDeviceType} options={toOptions(opts?.device_types ?? [])}
              style={{ width: 110 }} placeholder="设备" />
            <Select value={channel} onChange={setChannel} options={toOptions(opts?.channels ?? [])}
              style={{ width: 130 }} placeholder="渠道" />
            <DownloadCSVButton<VisitorRow>
              filename={`visitors-${Date.now()}.csv`}
              columns={[
                { key: 'visitor_id', title: 'visitor_id' },
                { key: 'first_ts', title: '首访', format: (r) => formatTime(r.first_ts) },
                { key: 'last_ts', title: '末访', format: (r) => formatTime(r.last_ts) },
                { key: 'sessions', title: '会话数' },
                { key: 'events', title: '事件数' },
                { key: 'browser', title: '浏览器' },
                { key: 'os', title: '操作系统' },
                { key: 'device_type', title: '设备类型' },
                { key: 'channel', title: '渠道' },
                { key: 'ip', title: 'IP' },
                { key: 'first_page', title: '首次进入页面' },
                { key: 'referrer', title: '来源 URL' },
                { key: 'ua', title: 'User-Agent' },
              ]}
              dataSource={data?.rows ?? []}
            />
          </Space>
        }
        columns={columns}
        dataSource={data?.rows ?? []}
        rowKey="visitor_id"
        loading={loading}
        total={data?.total ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onRow={(r) => ({ onClick: () => openDetail(r.visitor_id), style: { cursor: 'pointer' } })}
        scroll={{ x: 1500 }}
      />

      <Drawer
        open={!!detail || detailLoading}
        onClose={() => setDetail(null)}
        title={detail ? `访客详情 · ${detail.visitor_id}` : '加载中…'}
        width={760}
      >
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="首访">{formatTime(detail.first_ts)}</Descriptions.Item>
              <Descriptions.Item label="末访">{formatTime(detail.last_ts)}</Descriptions.Item>
              <Descriptions.Item label="会话数">{detail.sessions}</Descriptions.Item>
              <Descriptions.Item label="事件数">{detail.events}</Descriptions.Item>
              <Descriptions.Item label="浏览器">{detail.browser}</Descriptions.Item>
              <Descriptions.Item label="操作系统">{detail.os}</Descriptions.Item>
              <Descriptions.Item label="设备类型">{detail.device_type}</Descriptions.Item>
              <Descriptions.Item label="渠道">
                <Tag color={channelColor(detail.channel)}>{detail.channel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="IP">{detail.ip ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="首次进入">{detail.first_page ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="来源 URL" span={2}>
                <span style={{ wordBreak: 'break-all' }}>{detail.referrer ?? '-（直接访问 / 浏览器隐藏）'}</span>
              </Descriptions.Item>
              <Descriptions.Item label="UA" span={2}>
                <span style={{ wordBreak: 'break-all', fontSize: 12 }}>{shortUA(detail.ua)}</span>
              </Descriptions.Item>
            </Descriptions>

            <div>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>事件时间线（最近 200 条）</div>
              <Table<VisitorTimelineEvent>
                size="small"
                rowKey="id"
                pagination={{ pageSize: 20, showSizeChanger: false }}
                columns={[
                  { title: '时间', dataIndex: 'ts', width: 165,
                    render: (v) => <code style={{ fontSize: 12 }}>{formatTime(v)}</code> },
                  { title: '事件', dataIndex: 'event', width: 200,
                    render: (v) => <span><code style={{ fontSize: 11 }}>{v}</code><br/><Text type="secondary" style={{ fontSize: 11 }}>{eventLabel(v)}</Text></span> },
                  { title: '页面', dataIndex: 'page', ellipsis: true,
                    render: (v) => v ?? '-' },
                  { title: 'props', dataIndex: 'props', ellipsis: true,
                    render: (v) => v ? <code style={{ fontSize: 11 }}>{JSON.stringify(v)}</code> : '-' },
                ]}
                dataSource={detail.timeline}
                scroll={{ x: 760 }}
              />
            </div>
          </div>
        )}
      </Drawer>
    </div>
  )
}
