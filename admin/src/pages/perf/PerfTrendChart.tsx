import { useEffect, useMemo, useState } from 'react'
import { Card, Segmented, Empty, Typography } from 'antd'
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api, type PerfTimeseriesResp } from '../../lib/api'
import { formatDay, SOURCE_LABEL } from '../../lib/format'

const { Text } = Typography

type Metric = 'convert' | 'decrypt' | 'transcode'

// 来源 → 线条颜色（与卡片/Tag 体系区分开，纯为多线可辨识）
const SOURCE_COLOR: Record<string, string> = {
  ncm: '#E63946',   // 网易云 红
  kgm: '#1677FF',   // 酷狗 蓝
  vpr: '#722ED1',   // 酷狗 VPR 紫
  qmc: '#2BA471',   // QQ 音乐 绿
  __raw__: '#8C8C8C', // 原始 FLAC/OGG 灰
}

function sourceName(key: string): string {
  if (key === '__raw__') return '原始 FLAC/OGG'
  return SOURCE_LABEL[key] ?? key.toUpperCase()
}

export function PerfTrendChart({ rq, reloadKey }: { rq: string; reloadKey: number }) {
  const [data, setData] = useState<PerfTimeseriesResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [metric, setMetric] = useState<Metric>('convert')

  useEffect(() => {
    let alive = true
    setLoading(true)
    api
      .perfTimeseries(rq)
      .then((d) => { if (alive) setData(d) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [rq, reloadKey])

  const series = data ? data[metric] : undefined
  const points = series?.points ?? []
  const sources = series?.sources ?? []

  const hasData = points.length > 0 && sources.length > 0

  const title = useMemo(
    () =>
      metric === 'convert'
        ? '每 MB 转换耗时（解密+转码）'
        : metric === 'decrypt'
          ? '每 MB 解密耗时'
          : '每 MB 转码耗时',
    [metric],
  )

  return (
    <Card
      title="按来源拆分（每 MB 耗时趋势）"
      extra={
        <Segmented<Metric>
          size="small"
          value={metric}
          onChange={(v) => setMetric(v)}
          options={[
            { label: '每 MB 转换耗时', value: 'convert' },
            { label: '每 MB 解密耗时', value: 'decrypt' },
            { label: '每 MB 转码耗时', value: 'transcode' },
          ]}
        />
      }
    >
      <div style={{ marginBottom: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {loading ? '加载中…' : `每条线 = 一个来源的「${title}」逐日变化（ms/MB）；某天该来源无样本则断点`}
        </Text>
      </div>
      <div style={{ width: '100%', height: 340 }}>
        {!hasData ? (
          <Empty description={loading ? ' ' : '该区间暂无可用数据'} />
        ) : (
          <ResponsiveContainer>
            <LineChart data={points}>
              <CartesianGrid stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="day" tickFormatter={(v) => formatDay(v as number)} fontSize={11} />
              <YAxis fontSize={11} tickFormatter={(v) => `${v}`} width={48} />
              <Tooltip
                labelFormatter={(v) => formatDay(v as number)}
                formatter={(value, name) => [`${value} ms/MB`, name as string]}
              />
              <Legend />
              {sources.map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  name={sourceName(key)}
                  stroke={SOURCE_COLOR[key] ?? '#1677FF'}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}
