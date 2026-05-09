import { Card, Typography, List } from 'antd'

const { Title, Text } = Typography

const PLANS = [
  '功能开关：临时关闭 / 灰度某个解密器或转码路径',
  '文案配置：首屏标题、上传区文案、错误提示',
  '灰度名单：基于 visitor_id 的功能灰度',
  '限流阈值：调整 /api/track 每 IP 阈值',
]

export function SettingsPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <Title level={4} style={{ margin: 0 }}>配置中心</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>本期占位，后续会接入功能开关与运行时配置</Text>
      </div>
      <Card title="规划">
        <List
          dataSource={PLANS}
          renderItem={(item) => <List.Item>· {item}</List.Item>}
        />
      </Card>
    </div>
  )
}
