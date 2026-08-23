import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Space,
  Switch,
  Typography,
} from 'antd'
import {
  api,
  type HomepageGuidanceFlag,
} from '../lib/api'

const { Title, Text } = Typography

type SaveFeedback = {
  type: 'success' | 'error'
  message: string
}

export function SettingsPage() {
  const [flag, setFlag] = useState<HomepageGuidanceFlag | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback | null>(null)

  const loadFlag = async () => {
    setLoading(true)
    setLoadError(false)
    try {
      setFlag(await api.homepageGuidanceFlag())
    } catch {
      setFlag(null)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void api
      .homepageGuidanceFlag()
      .then((loadedFlag) => {
        if (active) setFlag(loadedFlag)
      })
      .catch(() => {
        if (active) {
          setFlag(null)
          setLoadError(true)
        }
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const updateFlag = async (enabled: boolean) => {
    if (!flag || saving) return
    setSaving(true)
    setSaveFeedback(null)
    try {
      const updated = await api.updateHomepageGuidanceFlag(enabled)
      setFlag(updated)
      setSaveFeedback({
        type: 'success',
        message: enabled ? '首页指引已显示' : '首页指引已隐藏',
      })
    } catch {
      setSaveFeedback({
        type: 'error',
        message: '保存失败，开关状态未改变',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div>
        <Title level={4} style={{ margin: 0 }}>配置中心</Title>
        <Text type="secondary" style={{ fontSize: 12 }}>
          管理主站运行时展示配置
        </Text>
      </div>

      <Card title="首页格式与 QQ 指引" loading={loading}>
        {loadError && (
          <Alert
            type="error"
            showIcon
            message="配置加载失败"
            description="当前状态未知，为避免误操作已禁用开关。"
            action={<Button size="small" onClick={() => void loadFlag()}>重试</Button>}
          />
        )}

        {flag && (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {saveFeedback && (
              <Alert
                type={saveFeedback.type}
                showIcon
                closable
                message={saveFeedback.message}
                onClose={() => setSaveFeedback(null)}
              />
            )}
            <div>
              <Text>
                控制首页上传区的平台支持文案、“查看全部支持的格式”和“如何转换 QQ 音乐文件”两个入口。
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                不影响容量限制、下载帮助、QQ 文件自动指引和失败行指引。主站刷新后生效。
              </Text>
            </div>

            <Space size="middle" wrap>
              <Switch
                checked={flag.enabled}
                checkedChildren="显示"
                unCheckedChildren="隐藏"
                loading={saving}
                disabled={saving}
                onChange={(enabled) => void updateFlag(enabled)}
              />
              <Text>{flag.enabled ? '当前显示' : '当前隐藏'}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {flag.updatedAt === null
                  ? '使用系统默认值'
                  : `更新于 ${new Date(flag.updatedAt).toLocaleString('zh-CN', { hour12: false })}`}
              </Text>
            </Space>
          </Space>
        )}
      </Card>
    </div>
  )
}
