import { useMemo, useState } from 'react'
import { Tabs, Button, Space, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { AppRangePicker, DEFAULT_RANGE, type Range, rangeQueryString } from '../components/biz/AppRangePicker'
import { UploadsSection } from './decrypt-analysis/UploadsSection'
import { DecryptLogsSection } from './decrypt-analysis/DecryptLogsSection'
import { DownloadsSection } from './decrypt-analysis/DownloadsSection'
import { FormatDistributionSection } from './decrypt-analysis/FormatDistributionSection'

const { Title, Text } = Typography

export function DecryptAnalysisPage() {
  const [range, setRange] = useState<Range>(DEFAULT_RANGE)
  const rq = useMemo(() => rangeQueryString(range), [range])
  const [reloadKey, setReloadKey] = useState(0)
  const reload = () => setReloadKey((k) => k + 1)
  const [activeTab, setActiveTab] = useState('uploads')

  const items = [
    { key: 'uploads',  label: '上传日志', children: <UploadsSection rq={rq} reloadKey={reloadKey} /> },
    { key: 'decrypt',  label: '解密日志', children: <DecryptLogsSection rq={rq} reloadKey={reloadKey} /> },
    { key: 'downloads', label: '下载日志', children: <DownloadsSection rq={rq} reloadKey={reloadKey} /> },
    { key: 'format',   label: '格式分布', children: <FormatDistributionSection rq={rq} reloadKey={reloadKey} /> },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>解密分析</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            上传 / 解密 / 转码 / 下载全链路明细 + 文件格式分布
          </Text>
        </div>
        <Space>
          <AppRangePicker value={range} onChange={setRange} />
          <Button icon={<ReloadOutlined />} onClick={reload}>刷新</Button>
        </Space>
      </div>

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={items} />
    </div>
  )
}
