import { useCallback, useEffect, useState } from 'react'
import { Card, Row, Col, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { api, type FormatDistributionResp } from '../../lib/api'
import { DataTableCard } from '../../components/biz/DataTableCard'
import { DownloadCSVButton } from '../../components/biz/DownloadCSVButton'
import { StatPie } from '../../components/biz/StatPie'
import { extLabel, formatPercent } from '../../lib/format'

const { Text } = Typography

type FormatRow = { ext: string; total: number; success: number; fail: number; pct: string }

export function FormatDistributionSection({ rq, reloadKey }: { rq: string; reloadKey: number }) {
  const [data, setData] = useState<FormatDistributionResp | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.formatDistribution(rq).then(setData).finally(() => setLoading(false))
  }, [rq])

  useEffect(() => { load() }, [load, reloadKey])

  const totalAll = (data?.rows ?? []).reduce((s, r) => s + r.total, 0)
  const tableRows: FormatRow[] = (data?.rows ?? []).map((r) => ({
    ext: r.ext ?? '(未知)',
    total: r.total,
    success: r.success,
    fail: r.fail,
    pct: formatPercent(r.total, totalAll),
  }))

  const pieData = tableRows.map((r) => ({ name: extLabel(r.ext), value: r.total }))

  const columns: ColumnsType<FormatRow> = [
    { title: '格式', dataIndex: 'ext', key: 'ext',
      render: (v) => <Tag color="blue">{extLabel(v)}</Tag> },
    { title: '总次数', dataIndex: 'total', key: 'total', align: 'right', width: 110 },
    { title: '解密成功', dataIndex: 'success', key: 'success', align: 'right', width: 110,
      render: (v) => <Text style={{ color: '#389E0D' }}>{v}</Text> },
    { title: '解密失败', dataIndex: 'fail', key: 'fail', align: 'right', width: 110,
      render: (v) => <Text style={{ color: v > 0 ? '#F5222D' : undefined }}>{v}</Text> },
    { title: '占比', dataIndex: 'pct', key: 'pct', align: 'right', width: 100 },
  ]

  return (
    <Card title="上传文件格式分布" loading={loading}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={10}>
          {pieData.length === 0
            ? <div style={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Text type="secondary">暂无数据</Text></div>
            : <StatPie data={pieData} height={280} innerRadius={60} outerRadius={100} />}
        </Col>
        <Col xs={24} md={14}>
          <DataTableCard<FormatRow>
            toolbar={
              <DownloadCSVButton<FormatRow>
                filename={`format-distribution-${Date.now()}.csv`}
                columns={[
                  { key: 'ext', title: '格式', format: (r) => extLabel(r.ext) },
                  { key: 'total', title: '总次数' },
                  { key: 'success', title: '解密成功' },
                  { key: 'fail', title: '解密失败' },
                  { key: 'pct', title: '占比' },
                ]}
                dataSource={tableRows}
              />
            }
            columns={columns}
            dataSource={tableRows}
            rowKey="ext"
            size="small"
          />
        </Col>
      </Row>
    </Card>
  )
}
