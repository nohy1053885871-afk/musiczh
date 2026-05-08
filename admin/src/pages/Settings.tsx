import { PanelCard } from '../components/Card'

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">配置中心</div>
        <div className="text-xs mt-1" style={{ color: '#8A8680' }}>本期占位，后续会接入功能开关与运行时配置</div>
      </div>
      <PanelCard title="规划">
        <ul className="text-sm space-y-2" style={{ color: '#1C1A18' }}>
          <li>· 功能开关：临时关闭 / 灰度某个解密器或转码路径</li>
          <li>· 文案配置：首屏标题、上传区文案、错误提示</li>
          <li>· 灰度名单：基于 visitor_id 的功能灰度</li>
          <li>· 限流阈值：调整 /api/track 每 IP 阈值</li>
        </ul>
      </PanelCard>
    </div>
  )
}
