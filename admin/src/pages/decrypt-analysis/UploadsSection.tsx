import { useCallback, useEffect, useMemo, useState } from 'react'
import { Space, Input, Select, Tag, Drawer, Descriptions, Typography, Button, Table, Tooltip as AntTooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CopyOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { App as AntApp } from 'antd'
import { api, type UploadRow, type UploadDetail, type UploadStatus } from '../../lib/api'
import { DataTableCard } from '../../components/biz/DataTableCard'
import { DownloadCSVButton } from '../../components/biz/DownloadCSVButton'
import {
  formatBytes, formatTime, formatDuration, extLabel,
  UPLOAD_STATUS_LABEL, UPLOAD_STATUS_FILTER_OPTIONS,
  eventLabel,
} from '../../lib/format'
import { UploadsTrendChart } from './uploads/UploadsTrendChart'
import { UploadsByFormatChart } from './uploads/UploadsByFormatChart'

const { Text, Paragraph } = Typography

const EXT_OPTIONS = [
  { value: '', label: '全部格式' },
  { value: 'ncm', label: 'NCM' },
  { value: 'kgm', label: 'KGM' },
  { value: 'vpr', label: 'VPR' },
  { value: 'xm', label: 'XM (喜马拉雅)' },
  { value: 'mflac', label: 'mflac (QQ)' },
  { value: 'mgg', label: 'mgg (QQ)' },
  { value: 'qmcflac', label: 'qmcflac (QQ)' },
  { value: 'qmcogg', label: 'qmcogg (QQ)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'flac', label: 'FLAC' },
  { value: 'ogg', label: 'OGG' },
  { value: 'm4a', label: 'M4A' },
]

const PAGE_SIZE = 10

function StatusTag({ status }: { status: UploadStatus | null }) {
  if (!status) return <span style={{ color: 'rgba(0,0,0,0.25)' }}>-</span>
  const meta = UPLOAD_STATUS_LABEL[status]
  if (!meta) return <Tag>{status}</Tag>
  return <Tag color={meta.color}>{meta.label}</Tag>
}

export function UploadsSection({ rq, reloadKey }: { rq: string; reloadKey: number }) {
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<UploadStatus | ''>('')
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
        status: status || undefined,
        ext: ext || undefined,
        q: q || undefined,
      })
      .then((d) => { setRows(d.rows); setTotal(d.total) })
      .finally(() => setLoading(false))
  }, [queryParams, page, status, ext, q])

  useEffect(() => { load() }, [load, reloadKey])
  useEffect(() => { setPage(1) }, [status, ext, q, rq])

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
    {
      title: (
        <Space size={4}>
          <span>状态</span>
          <AntTooltip
            title={(
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                每条上传记录的最终归宿，共 8 种：
                <br />· <b>被拒-格式 / 大小 / 队列</b>：上传时被前端校验拦截
                <br />· <b>成功</b>：解密成功或转码成功（按 file_id 关联）
                <br />· <b>失败</b>：处理过程中明确报错
                <br />· <b>中止</b>：用户在解密/转码途中关页/切后台（auto-FLAC OOM 主嫌疑）
                <br />· <b>未完成</b>：上传后无任何下游事件（兜底，应趋近 0）
                <br />· <b>-（历史）</b>：v0.4.1 之前的记录无 file_id，无法追溯下游
              </div>
            )}
          >
            <InfoCircleOutlined style={{ color: '#999', cursor: 'help' }} />
          </AntTooltip>
        </Space>
      ),
      dataIndex: 'status', key: 'status', width: 130,
      render: (v: UploadStatus | null) => <StatusTag status={v} /> },
    { title: '文件名', dataIndex: 'file_name', key: 'file_name', ellipsis: true,
      render: (v) => v ?? '-' },
    { title: '格式', dataIndex: 'file_ext', key: 'file_ext', width: 90,
      render: (v) => v ? <Tag color="blue">{extLabel(v)}</Tag> : '-' },
    { title: '大小', dataIndex: 'file_size', key: 'file_size', width: 95, align: 'right',
      render: (v) => formatBytes(v) },
    { title: '耗时', dataIndex: 'duration_ms', key: 'duration_ms', width: 90, align: 'right',
      render: (v) => v != null ? formatDuration(v) : '-' },
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
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
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
            <Select
              value={status}
              onChange={(v) => setStatus(v as UploadStatus | '')}
              options={UPLOAD_STATUS_FILTER_OPTIONS}
              style={{ width: 130 }}
            />
            <Select value={ext} onChange={setExt} options={EXT_OPTIONS} style={{ width: 110 }} />
            <DownloadCSVButton<UploadRow>
              filename={`uploads-${Date.now()}.csv`}
              columns={[
                { key: 'ts', title: '时间', format: (r) => formatTime(r.ts) },
                { key: 'status', title: '状态',
                  format: (r) => r.status ? (UPLOAD_STATUS_LABEL[r.status]?.label ?? r.status) : '-' },
                { key: 'file_name', title: '文件名' },
                { key: 'file_ext', title: '格式' },
                { key: 'file_size', title: '大小（字节）' },
                { key: 'duration_ms', title: '耗时（毫秒）' },
                { key: 'browser', title: '浏览器' },
                { key: 'os', title: '系统' },
                { key: 'device_type', title: '设备' },
                { key: 'file_id', title: 'file_id' },
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

      {/* 上传趋势折线图（C3） */}
      <UploadsTrendChart rq={rq} reloadKey={reloadKey} />

      {/* 按格式维度拆解（C6） */}
      <UploadsByFormatChart rq={rq} reloadKey={reloadKey} />

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`上传详情 #${detail?.id ?? ''}`}
        width={720}
      >
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Space>
              <Button type="primary" icon={<CopyOutlined />} onClick={copyJson}>复制 JSON</Button>
              <Text type="secondary" style={{ fontSize: 12 }}>粘贴到 Claude Code 即可定位</Text>
            </Space>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="时间">{formatTime(detail.ts)}</Descriptions.Item>
              <Descriptions.Item label="状态"><StatusTag status={detail.status} /></Descriptions.Item>
              <Descriptions.Item label="文件名" span={2}>{detail.file_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="格式">{detail.file_ext ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="文件大小">{formatBytes(detail.file_size)}</Descriptions.Item>
              <Descriptions.Item label="App 版本">{detail.app_ver ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="file_id">
                <code style={{ fontSize: 11 }}>{detail.file_id ?? '（v0.4.1 前历史数据无此字段）'}</code>
              </Descriptions.Item>
              <Descriptions.Item label="浏览器">{detail.browser}</Descriptions.Item>
              <Descriptions.Item label="操作系统">{detail.os}</Descriptions.Item>
              <Descriptions.Item label="设备" span={2}>{detail.device_type}</Descriptions.Item>
              <Descriptions.Item label="visitor_id" span={2}><code>{detail.visitor_id}</code></Descriptions.Item>
              <Descriptions.Item label="IP">{detail.ip ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="UA"><span style={{ wordBreak: 'break-all' }}>{detail.ua ?? '-'}</span></Descriptions.Item>
            </Descriptions>

            {/* 事件时间线：该 file_id 关联的所有事件，按 ts 升序，看清楚到底走到了哪一步 */}
            <div>
              <Text strong>事件时间线</Text>
              {!detail.file_id ? (
                <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
                  该条记录无 file_id（v0.4.1 之前的上传埋点），无法关联后续解密/转码事件。
                </div>
              ) : detail.timeline.length === 0 ? (
                <div style={{ marginTop: 8, color: 'rgba(0,0,0,0.45)', fontSize: 12 }}>
                  暂无关联事件。
                </div>
              ) : (
                <Table
                  size="small"
                  style={{ marginTop: 8 }}
                  pagination={false}
                  rowKey="id"
                  dataSource={detail.timeline}
                  columns={[
                    { title: '时间', dataIndex: 'ts', key: 'ts', width: 165,
                      render: (v) => <code style={{ fontSize: 11 }}>{formatTime(v)}</code> },
                    { title: '事件', dataIndex: 'event', key: 'event',
                      render: (v: string) => (
                        <span>
                          <code style={{ fontSize: 11 }}>{v}</code>
                          <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.45)' }}>{eventLabel(v)}</div>
                        </span>
                      ),
                    },
                    { title: '关键字段', dataIndex: 'props', key: 'props',
                      render: (p: Record<string, unknown> | null) => {
                        if (!p) return '-'
                        // 只挑事件诊断时最有用的几个：error_code / progress_bucket / last_progress / reject_reason / source / 耗时
                        const keys = ['error_code', 'progress_bucket', 'last_progress', 'reject_reason', 'source', 'from_format', 'decrypt_ms', 'transcode_ms']
                        const picked = keys
                          .filter((k) => p[k] !== undefined && p[k] !== null)
                          .map((k) => `${k}=${String(p[k])}`)
                        return picked.length ? (
                          <code style={{ fontSize: 11 }}>{picked.join('  ')}</code>
                        ) : '-'
                      },
                    },
                  ]}
                />
              )}
            </div>

            {detail.page && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>来源页</Text>
                <Paragraph code style={{ marginTop: 8 }}>{detail.page}</Paragraph>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </Space>
  )
}
