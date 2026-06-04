import { useEffect, useMemo, useState } from 'react'
import { Row, Col, Card, Statistic, Table, Button, Space, Typography, Tooltip as AntTooltip } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { AppRangePicker, DEFAULT_RANGE, type Range, rangeQueryString } from '../components/biz/AppRangePicker'
import { api, type PerfResp } from '../lib/api'
import { formatMsPerMb, SOURCE_LABEL } from '../lib/format'
import { PerfTrendChart } from './perf/PerfTrendChart'

const { Title, Text } = Typography

// 卡片主数字：null → '-'，否则整数 ms（带千分位由 antd 处理）
function msValue(v: number | null | undefined): { value: number | string; suffix?: string } {
  if (v == null) return { value: '-' }
  return { value: Math.round(v), suffix: 'ms' }
}
const msText = (v: number | null | undefined) => (v == null ? '-' : `${Math.round(v)}ms`)

// 卡片副字：P50 / P95（端到端或单分布），缺失显式 '-'
function PctSub({ p50, p95, prefix }: { p50: number | null; p95: number | null; prefix?: string }) {
  return (
    <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
      {prefix ? `${prefix} ` : ''}P50 {msText(p50)} · P95 {msText(p95)}
    </div>
  )
}

function sourceLabel(source: string | null): string {
  if (source == null) return '原始 FLAC/OGG'
  return SOURCE_LABEL[source] ?? source.toUpperCase()
}

export function PerformanceAnalysisPage() {
  const [range, setRange] = useState<Range>(DEFAULT_RANGE)
  const rq = useMemo(() => rangeQueryString(range), [range])
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)

  const [perf, setPerf] = useState<PerfResp | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .perf(rq)
      .then((d) => { if (alive) setPerf(d) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [rq, reloadKey])

  const pf = perf?.per_file
  const pm = perf?.per_mb

  const sourceColumns: ColumnsType<NonNullable<PerfResp['by_source']>[number]> = [
    { title: '来源', dataIndex: 'source', key: 'source', render: (v) => sourceLabel(v) },
    { title: '每 MB 解密耗时', dataIndex: 'decrypt_ms_per_mb', key: 'decrypt_ms_per_mb', align: 'right',
      render: (v) => formatMsPerMb(v) },
    { title: '每 MB 转码耗时', dataIndex: 'transcode_ms_per_mb', key: 'transcode_ms_per_mb', align: 'right',
      render: (v) => formatMsPerMb(v) },
    { title: '解密样本数', dataIndex: 'decrypt_n', key: 'decrypt_n', align: 'right', render: (v) => v ?? 0 },
    { title: '转码样本数', dataIndex: 'transcode_n', key: 'transcode_n', align: 'right', render: (v) => v ?? 0 },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>性能分析</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            解密 / 转码耗时（仅统计成功的解密 / 转码）。单位毫秒；每 MB 按各阶段实际处理量计
          </Text>
        </div>
        <Space>
          <AppRangePicker value={range} onChange={setRange} />
          <Button icon={<ReloadOutlined />} onClick={reload} loading={loading}>刷新</Button>
        </Space>
      </div>

      {/* 第一行：每文件耗时（均值 + 分位数） */}
      <div>
        <Title level={5} style={{ margin: '0 0 12px' }}>
          每文件耗时{' '}
          <AntTooltip
            title={(
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                · <b>总耗时</b>均值按「处理次数」口径：(Σ解密+Σ转码) ÷ (解密次数+转码次数)
                <br />· 总耗时的 <b>P50/P95</b> 改用「整文件端到端」（一个文件 解密+转码 总和的分布），才能反映"最慢等多久"
                <br />· 解密 / 转码各自的 P50/P95 在其单一耗时分布上计算
                <br />· 解密样本 {pf?.decrypt_n ?? '-'} 件 · 转码样本 {pf?.transcode_n ?? '-'} 件
              </div>
            )}
          >
            <InfoCircleOutlined style={{ color: '#999', cursor: 'help', fontSize: 14 }} />
          </AntTooltip>
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title="平均总耗时（解密+转码）" {...msValue(pf?.convert_avg_ms)} />
              <PctSub p50={pf?.convert_e2e_p50_ms ?? null} p95={pf?.convert_e2e_p95_ms ?? null} prefix="端到端" />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title="平均解密耗时" {...msValue(pf?.decrypt_avg_ms)} />
              <PctSub p50={pf?.decrypt_p50_ms ?? null} p95={pf?.decrypt_p95_ms ?? null} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title="平均转码耗时" {...msValue(pf?.transcode_avg_ms)} />
              <PctSub p50={pf?.transcode_p50_ms ?? null} p95={pf?.transcode_p95_ms ?? null} />
            </Card>
          </Col>
        </Row>
      </div>

      {/* 第二行：每 MB 耗时 */}
      <div>
        <Title level={5} style={{ margin: '0 0 12px' }}>
          每 MB 耗时{' '}
          <AntTooltip
            title={(
              <div style={{ fontSize: 12, lineHeight: 1.8 }}>
                ratio-of-sums：Σ耗时 ÷ Σ处理量(MB)。
                <br />一个文件先解密再转码，按「执行两遍」计入两份处理量（解密用原始字节、转码用解密产物字节）
              </div>
            )}
          >
            <InfoCircleOutlined style={{ color: '#999', cursor: 'help', fontSize: 14 }} />
          </AntTooltip>
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="平均每 MB 转换耗时"
                value={pm?.convert_ms_per_mb == null ? '-' : pm.convert_ms_per_mb}
                precision={pm?.convert_ms_per_mb == null ? undefined : 1}
                suffix={pm?.convert_ms_per_mb == null ? undefined : 'ms/MB'}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="平均每 MB 解密耗时"
                value={pm?.decrypt_ms_per_mb == null ? '-' : pm.decrypt_ms_per_mb}
                precision={pm?.decrypt_ms_per_mb == null ? undefined : 1}
                suffix={pm?.decrypt_ms_per_mb == null ? undefined : 'ms/MB'}
              />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="平均每 MB 转码耗时"
                value={pm?.transcode_ms_per_mb == null ? '-' : pm.transcode_ms_per_mb}
                precision={pm?.transcode_ms_per_mb == null ? undefined : 1}
                suffix={pm?.transcode_ms_per_mb == null ? undefined : 'ms/MB'}
              />
            </Card>
          </Col>
        </Row>
      </div>

      {/* 第三行：按来源拆分 - 每日趋势折线图 */}
      <PerfTrendChart rq={rq} reloadKey={reloadKey} />

      {/* 区间合计表：折线图按天会抖动，这张表给出整段区间的合计 per-MB + 样本数（判断折线点是否可信） */}
      <Card
        title={(
          <Space size={4}>
            <span>按来源拆分（区间合计）</span>
            <AntTooltip title="整段时间区间的合计 per-MB 与样本数。不同平台解密算法不同（NCM/QMC=RC4，KGM=查表 XOR），per-MB 成本差异大；样本数太小的来源，折线趋势仅供参考">
              <InfoCircleOutlined style={{ color: '#999', cursor: 'help' }} />
            </AntTooltip>
          </Space>
        )}
      >
        <Table
          size="small"
          rowKey={(r) => r.source ?? '__raw__'}
          columns={sourceColumns}
          dataSource={perf?.by_source ?? []}
          loading={loading}
          pagination={false}
        />
      </Card>
    </div>
  )
}
