import { useCallback, useEffect, useMemo, useState } from 'react'
import { Space, Input, Select, Tag, Drawer, Descriptions, Button } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { api, type SuccessRow, type SuccessDetail } from '../../lib/api'
import { DataTableCard } from '../../components/biz/DataTableCard'
import { DownloadCSVButton } from '../../components/biz/DownloadCSVButton'
import { formatBytes, formatTime, STAGE_LABEL } from '../../lib/format'

const STAGE_OPTIONS = [
  { value: '', label: '全部阶段' },
  { value: 'decrypt', label: '解密' },
  { value: 'transcode', label: '转码' },
]

const EXT_OPTIONS = [
  { value: '', label: '全部格式' },
  { value: 'ncm', label: 'NCM' },
  { value: 'kgm', label: 'KGM' },
  { value: 'vpr', label: 'VPR' },
  { value: 'mflac', label: 'mflac (QQ)' },
  { value: 'mgg', label: 'mgg (QQ)' },
  { value: 'qmcflac', label: 'qmcflac (QQ)' },
  { value: 'qmcogg', label: 'qmcogg (QQ)' },
  { value: 'mp3', label: 'MP3' },
  { value: 'flac', label: 'FLAC' },
  { value: 'ogg', label: 'OGG' },
]

const PAGE_SIZE = 10

export function SuccessesSubSection({ rq, reloadKey }: { rq: string; reloadKey: number }) {
  const [page, setPage] = useState(1)
  const [stage, setStage] = useState('')
  const [ext, setExt] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<SuccessRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<SuccessDetail | null>(null)

  const queryParams = useMemo(() => {
    const [k, v] = rq.split('=')
    return k === 'range' ? { range: v } : Object.fromEntries(new URLSearchParams(rq))
  }, [rq])

  const load = useCallback(() => {
    setLoading(true)
    api
      .successes({
        ...queryParams,
        page,
        size: PAGE_SIZE,
        stage: stage || undefined,
        ext: ext || undefined,
        q: q || undefined,
      })
      .then((d) => { setRows(d.rows); setTotal(d.total) })
      .finally(() => setLoading(false))
  }, [queryParams, page, stage, ext, q])

  useEffect(() => { load() }, [load, reloadKey])
  useEffect(() => { setPage(1) }, [stage, ext, q, rq])

  const columns: ColumnsType<SuccessRow> = [
    { title: '时间', dataIndex: 'ts', key: 'ts', width: 165,
      render: (v) => <code style={{ fontSize: 12 }}>{formatTime(v)}</code> },
    { title: '阶段', dataIndex: 'stage', key: 'stage', width: 70,
      render: (v: 'decrypt' | 'transcode') =>
        <Tag color={v === 'decrypt' ? 'green' : 'cyan'}>{STAGE_LABEL[v]}</Tag> },
    { title: '文件名', dataIndex: 'file_name', key: 'file_name', ellipsis: true,
      render: (v) => v ?? '-' },
    { title: '大小', dataIndex: 'file_size', key: 'file_size', width: 90, align: 'right',
      render: (v) => formatBytes(v) },
    { title: '格式', dataIndex: 'source', key: 'source', width: 80,
      render: (_, r) => r.source ?? r.file_ext ?? '-' },
    { title: '', key: 'op', width: 70,
      render: (_, r) => (
        <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); openDetail(r.id) }}>
          查看
        </Button>
      ) },
  ]

  const openDetail = async (id: number) => {
    const d = await api.successDetail(id)
    setDetail(d)
  }

  return (
    <>
      <DataTableCard<SuccessRow>
        title={`成功日志（共 ${total} 条）`}
        toolbar={
          <Space wrap>
            <Input.Search
              placeholder="搜索文件名"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              allowClear
              style={{ width: 200 }}
            />
            <Select value={stage} onChange={setStage} options={STAGE_OPTIONS} style={{ width: 110 }} />
            <Select value={ext} onChange={setExt} options={EXT_OPTIONS} style={{ width: 110 }} />
            <DownloadCSVButton<SuccessRow>
              filename={`successes-${Date.now()}.csv`}
              columns={[
                { key: 'ts', title: '时间', format: (r) => formatTime(r.ts) },
                { key: 'stage', title: '阶段', format: (r) => STAGE_LABEL[r.stage] ?? r.stage },
                { key: 'file_name', title: '文件名' },
                { key: 'file_size', title: '大小（字节）' },
                { key: 'source', title: '格式', format: (r) => r.source ?? r.file_ext ?? '' },
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
        scroll={{ x: 900 }}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={`成功详情 #${detail?.id ?? ''}`} width={680}>
        {detail && (
          <Descriptions column={2} size="small" bordered>
            <Descriptions.Item label="时间">{formatTime(detail.ts)}</Descriptions.Item>
            <Descriptions.Item label="阶段">{STAGE_LABEL[detail.stage]}</Descriptions.Item>
            <Descriptions.Item label="事件"><code>{detail.event}</code></Descriptions.Item>
            <Descriptions.Item label="格式">{detail.source ?? detail.file_ext ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="文件名" span={2}>{detail.file_name ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="文件大小">{formatBytes(detail.file_size)}</Descriptions.Item>
            <Descriptions.Item label="App 版本">{detail.app_ver ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="visitor_id" span={2}><code>{detail.visitor_id}</code></Descriptions.Item>
            <Descriptions.Item label="IP">{detail.ip ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="UA"><span style={{ wordBreak: 'break-all' }}>{detail.ua ?? '-'}</span></Descriptions.Item>
          </Descriptions>
        )}
      </Drawer>
    </>
  )
}
