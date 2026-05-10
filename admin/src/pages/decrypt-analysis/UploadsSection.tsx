import { useCallback, useEffect, useMemo, useState } from 'react'
import { Space, Input, Select, Tag, Drawer, Descriptions, Typography, Button } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CopyOutlined } from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { api, type UploadRow, type UploadDetail } from '../../lib/api'
import { DataTableCard } from '../../components/biz/DataTableCard'
import { DownloadCSVButton } from '../../components/biz/DownloadCSVButton'
import {
  formatBytes, formatTime, extLabel, REJECT_REASON_LABEL,
} from '../../lib/format'

const { Text, Paragraph } = Typography

const TYPE_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'attempt', label: '上传成功' },
  { value: 'reject', label: '上传被拒' },
]

const REASON_OPTIONS = [
  { value: '', label: '全部原因' },
  { value: 'FORMAT_UNSUPPORTED', label: '格式不支持' },
  { value: 'SIZE_EXCEEDED', label: '超出 100MB' },
  { value: 'QUEUE_FULL', label: '超出 50 个上限' },
]

const EXT_OPTIONS = [
  { value: '', label: '全部格式' },
  { value: 'ncm', label: 'NCM' },
  { value: 'kgm', label: 'KGM' },
  { value: 'vpr', label: 'VPR' },
  { value: 'mp3', label: 'MP3' },
  { value: 'flac', label: 'FLAC' },
  { value: 'ogg', label: 'OGG' },
]

const PAGE_SIZE = 10

export function UploadsSection({ rq, reloadKey }: { rq: string; reloadKey: number }) {
  const [page, setPage] = useState(1)
  const [type, setType] = useState<'' | 'attempt' | 'reject'>('')
  const [reason, setReason] = useState('')
  const [ext, setExt] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<UploadRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<UploadDetail | null>(null)
  const { message } = AntApp.useApp()

  const queryParams = useMemo(() => {
    const [k, v] = rq.split('=')
    return k === 'range' ? { range: v } : Object.fromEntries(new URLSearchParams(rq))
  }, [rq])

  const load = useCallback(() => {
    setLoading(true)
    api
      .uploads({
        ...queryParams,
        page,
        size: PAGE_SIZE,
        type: type || undefined,
        reason: reason || undefined,
        ext: ext || undefined,
        q: q || undefined,
      })
      .then((d) => { setRows(d.rows); setTotal(d.total) })
      .finally(() => setLoading(false))
  }, [queryParams, page, type, reason, ext, q])

  useEffect(() => { load() }, [load, reloadKey])
  useEffect(() => { setPage(1) }, [type, reason, ext, q, rq])

  const openDetail = async (id: number) => {
    const d = await api.uploadDetail(id)
    setDetail(d)
  }

  const copyJson = async () => {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(detail, null, 2))
      message.success('已复制')
    } catch {
      message.error('复制失败')
    }
  }

  const columns: ColumnsType<UploadRow> = [
    { title: '时间', dataIndex: 'ts', key: 'ts', width: 165,
      render: (v) => <code style={{ fontSize: 12 }}>{formatTime(v)}</code> },
    { title: '类型', dataIndex: 'type', key: 'type', width: 90,
      render: (v: 'attempt' | 'reject') =>
        v === 'attempt'
          ? <Tag color="green">成功</Tag>
          : <Tag color="red">拒绝</Tag> },
    { title: '拒绝原因', dataIndex: 'reject_reason', key: 'reject_reason', width: 130,
      render: (v: string | null) => v ? <Tag color="orange">{REJECT_REASON_LABEL[v] ?? v}</Tag> : '-' },
    { title: '文件名', dataIndex: 'file_name', key: 'file_name', ellipsis: true,
      render: (v) => v ?? '-' },
    { title: '格式', dataIndex: 'file_ext', key: 'file_ext', width: 90,
      render: (v) => v ? <Tag color="blue">{extLabel(v)}</Tag> : '-' },
    { title: '大小', dataIndex: 'file_size', key: 'file_size', width: 95, align: 'right',
      render: (v) => formatBytes(v) },
    { title: '浏览器', dataIndex: 'browser', key: 'browser', width: 90, ellipsis: true },
    { title: '系统', dataIndex: 'os', key: 'os', width: 90, ellipsis: true },
    { title: '设备', dataIndex: 'device_type', key: 'device_type', width: 70, ellipsis: true },
    { title: '', key: 'op', width: 70,
      render: (_, r) => (
        <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); openDetail(r.id) }}>
          查看
        </Button>
      ) },
  ]

  return (
    <>
      <DataTableCard<UploadRow>
        title={`上传日志（共 ${total} 条）`}
        toolbar={
          <Space wrap>
            <Input.Search
              placeholder="搜索文件名"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              allowClear
              style={{ width: 200 }}
            />
            <Select value={type} onChange={(v) => setType(v as any)} options={TYPE_OPTIONS} style={{ width: 110 }} />
            <Select value={reason} onChange={setReason} options={REASON_OPTIONS} style={{ width: 160 }} />
            <Select value={ext} onChange={setExt} options={EXT_OPTIONS} style={{ width: 110 }} />
            <DownloadCSVButton<UploadRow>
              filename={`uploads-${Date.now()}.csv`}
              columns={[
                { key: 'ts', title: '时间', format: (r) => formatTime(r.ts) },
                { key: 'type', title: '类型', format: (r) => r.type === 'attempt' ? '成功' : '拒绝' },
                { key: 'reject_reason', title: '拒绝原因',
                  format: (r) => r.reject_reason ? (REJECT_REASON_LABEL[r.reject_reason] ?? r.reject_reason) : '' },
                { key: 'file_name', title: '文件名' },
                { key: 'file_ext', title: '格式' },
                { key: 'file_size', title: '大小（字节）' },
                { key: 'browser', title: '浏览器' },
                { key: 'os', title: '系统' },
                { key: 'device_type', title: '设备' },
                { key: 'visitor_id', title: 'visitor_id' },
                { key: 'app_ver', title: 'App 版本' },
              ]}
              dataSource={rows}
            />
          </Space>
        }
        columns={columns}
        dataSource={rows}
        rowKey="id"
        loading={loading}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
        onRow={(r) => ({ onClick: () => openDetail(r.id), style: { cursor: 'pointer' } })}
        scroll={{ x: 1200 }}
      />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`上传详情 #${detail?.id ?? ''}`}
        width={680}
      >
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Space>
              <Button type="primary" icon={<CopyOutlined />} onClick={copyJson}>复制 JSON</Button>
              <Text type="secondary" style={{ fontSize: 12 }}>粘贴到 Claude Code 即可定位</Text>
            </Space>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="时间">{formatTime(detail.ts)}</Descriptions.Item>
              <Descriptions.Item label="类型">
                {detail.type === 'attempt' ? <Tag color="green">成功</Tag> : <Tag color="red">拒绝</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="拒绝原因">
                {detail.reject_reason ? (REJECT_REASON_LABEL[detail.reject_reason] ?? detail.reject_reason) : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="格式">{detail.file_ext ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="文件名" span={2}>{detail.file_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="文件大小">{formatBytes(detail.file_size)}</Descriptions.Item>
              <Descriptions.Item label="App 版本">{detail.app_ver ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="浏览器">{detail.browser}</Descriptions.Item>
              <Descriptions.Item label="操作系统">{detail.os}</Descriptions.Item>
              <Descriptions.Item label="设备" span={2}>{detail.device_type}</Descriptions.Item>
              <Descriptions.Item label="visitor_id" span={2}><code>{detail.visitor_id}</code></Descriptions.Item>
              <Descriptions.Item label="IP">{detail.ip ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="UA"><span style={{ wordBreak: 'break-all' }}>{detail.ua ?? '-'}</span></Descriptions.Item>
            </Descriptions>
            {detail.page && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>来源页</Text>
                <Paragraph code style={{ marginTop: 8 }}>{detail.page}</Paragraph>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  )
}
