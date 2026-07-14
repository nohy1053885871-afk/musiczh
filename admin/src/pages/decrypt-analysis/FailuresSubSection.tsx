import { useCallback, useEffect, useMemo, useState } from 'react'
import { Space, Input, Select, Tag, Drawer, Descriptions, Typography, Button, App as AntApp } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CopyOutlined } from '@ant-design/icons'
import { api, type FailureRow, type FailureDetail } from '../../lib/api'
import { DataTableCard } from '../../components/biz/DataTableCard'
import { DownloadCSVButton } from '../../components/biz/DownloadCSVButton'
import { formatBytes, formatTime, STAGE_LABEL, ERROR_CODE_LABEL } from '../../lib/format'
import { ErrorCodeCell } from '../../components/biz/ErrorCodeCell'

const { Text, Paragraph } = Typography

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

export function FailuresSubSection({ rq, reloadKey }: { rq: string; reloadKey: number }) {
  const [page, setPage] = useState(1)
  const [stage, setStage] = useState('')
  const [code, setCode] = useState('')
  const [ext, setExt] = useState('')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<FailureRow[]>([])
  const [total, setTotal] = useState(0)
  const [codeAgg, setCodeAgg] = useState<{ error_code: string | null; n: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<FailureDetail | null>(null)
  const { message } = AntApp.useApp()

  const queryParams = useMemo(() => {
    const [k, v] = rq.split('=')
    return k === 'range' ? { range: v } : Object.fromEntries(new URLSearchParams(rq))
  }, [rq])

  const load = useCallback(() => {
    setLoading(true)
    api
      .failures({
        ...queryParams,
        page,
        size: PAGE_SIZE,
        stage: stage || undefined,
        code: code || undefined,
        ext: ext || undefined,
        q: q || undefined,
      })
      .then((d) => { setRows(d.rows); setTotal(d.total); setCodeAgg(d.code_agg) })
      .finally(() => setLoading(false))
  }, [queryParams, page, stage, code, ext, q])

  useEffect(() => { load() }, [load, reloadKey])
  useEffect(() => { setPage(1) }, [stage, code, ext, q, rq])

  const codeOptions = useMemo(
    () => [
      { value: '', label: '全部错误码' },
      // error_code 为 null 的聚合组不进下拉：其 value('')与「全部错误码」冲突会劫持默认显示，
      // 且 code='' 查询参数会被丢弃、本就筛不了
      ...codeAgg
        .filter((c) => c.error_code)
        .map((c) => ({
          value: c.error_code as string,
          label: `${ERROR_CODE_LABEL[c.error_code as string] ?? c.error_code} (${c.n})`,
        })),
    ],
    [codeAgg],
  )

  const columns: ColumnsType<FailureRow> = [
    { title: '时间', dataIndex: 'ts', key: 'ts', width: 165,
      render: (v) => <code style={{ fontSize: 12 }}>{formatTime(v)}</code> },
    { title: '阶段', dataIndex: 'stage', key: 'stage', width: 70,
      render: (v: 'decrypt' | 'transcode' | 'download') => {
        const color = v === 'decrypt' ? 'blue' : v === 'transcode' ? 'purple' : 'orange'
        return <Tag color={color}>{STAGE_LABEL[v] ?? v}</Tag>
      } },
    { title: '错误码', dataIndex: 'error_code', key: 'error_code', width: 190,
      render: (v) => <ErrorCodeCell code={v} /> },
    { title: '文件名', dataIndex: 'file_name', key: 'file_name', ellipsis: true,
      render: (v) => v ?? '-' },
    { title: '大小', dataIndex: 'file_size', key: 'file_size', width: 90, align: 'right',
      render: (v) => formatBytes(v) },
    { title: '格式', dataIndex: 'source', key: 'source', width: 80,
      render: (v) => v ?? '-' },
    { title: '错误信息', dataIndex: 'error_msg', key: 'error_msg', ellipsis: true,
      render: (v) => v ?? '-' },
    { title: '', key: 'op', width: 70,
      render: (_, r) => (
        <Button type="link" size="small" onClick={(e) => { e.stopPropagation(); openDetail(r.id) }}>
          查看
        </Button>
      ) },
  ]

  const openDetail = async (id: number) => {
    const d = await api.failureDetail(id)
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

  return (
    <>
      <DataTableCard<FailureRow>
        title={`失败日志（共 ${total} 条）`}
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
            <Select value={code} onChange={setCode} options={codeOptions} style={{ width: 200 }} />
            <Select value={ext} onChange={setExt} options={EXT_OPTIONS} style={{ width: 110 }} />
            <DownloadCSVButton<FailureRow>
              filename={`failures-${Date.now()}.csv`}
              columns={[
                { key: 'ts', title: '时间', format: (r) => formatTime(r.ts) },
                { key: 'stage', title: '阶段', format: (r) => STAGE_LABEL[r.stage] ?? r.stage },
                { key: 'error_code', title: '错误码' },
                { key: 'file_name', title: '文件名' },
                { key: 'file_size', title: '大小（字节）' },
                { key: 'source', title: '格式' },
                { key: 'error_msg', title: '错误信息' },
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
        scroll={{ x: 1100 }}
      />

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={`失败详情 #${detail?.id ?? ''}`} width={680}>
        {detail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Space>
              <Button type="primary" icon={<CopyOutlined />} onClick={copyJson}>复制 JSON 给 Claude 排查</Button>
              <Text type="secondary" style={{ fontSize: 12 }}>直接粘贴到 Claude Code 即可定位</Text>
            </Space>
            <Descriptions column={2} size="small" bordered>
              <Descriptions.Item label="时间">{formatTime(detail.ts)}</Descriptions.Item>
              <Descriptions.Item label="阶段">{STAGE_LABEL[detail.stage] ?? detail.stage}</Descriptions.Item>
              <Descriptions.Item label="错误码"><ErrorCodeCell code={detail.error_code} /></Descriptions.Item>
              <Descriptions.Item label="格式">{detail.source ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="文件名" span={2}>{detail.file_name ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="文件大小">{formatBytes(detail.file_size)}</Descriptions.Item>
              <Descriptions.Item label="App 版本">{detail.app_ver ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="visitor_id" span={2}><code>{detail.visitor_id}</code></Descriptions.Item>
              <Descriptions.Item label="IP">{detail.ip ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="UA"><span style={{ wordBreak: 'break-all' }}>{detail.ua ?? '-'}</span></Descriptions.Item>
            </Descriptions>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>错误信息</Text>
              <Paragraph code style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {detail.error_msg ?? '-'}
              </Paragraph>
            </div>
            {detail.error_stack && (
              <div>
                <Text type="secondary" style={{ fontSize: 12 }}>错误堆栈</Text>
                <Paragraph code style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                  {detail.error_stack}
                </Paragraph>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </>
  )
}
