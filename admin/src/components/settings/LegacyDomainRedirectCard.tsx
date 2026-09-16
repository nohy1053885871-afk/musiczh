import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Space,
  Switch,
  Typography,
} from 'antd'
import {
  api,
  type LegacyDomainRedirectFlag,
} from '../../lib/api'

const { Text } = Typography

type Feedback = { type: 'success' | 'error'; message: string }

function formatTime(timestamp: number | null) {
  if (timestamp === null) return '使用系统默认值'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

export function LegacyDomainRedirectCard() {
  const { modal } = App.useApp()
  const [flag, setFlag] = useState<LegacyDomainRedirectFlag | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    setFeedback(null)
    try {
      setFlag(await api.legacyDomainRedirectFlag())
    } catch {
      setFlag(null)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const save = async (enabled: boolean) => {
    if (!flag || saving) return
    setSaving(true)
    setFeedback(null)
    try {
      const updated = await api.updateLegacyDomainRedirectFlag(enabled)
      setFlag(updated)
      setFeedback({
        type: 'success',
        message: enabled
          ? 'sleepno.cn 普通页面临时跳转已开启'
          : 'sleepno.cn 普通页面临时跳转已关闭',
      })
    } catch {
      setFeedback({
        type: 'error',
        message: '保存失败，服务端开关状态未改变',
      })
    } finally {
      setSaving(false)
    }
  }

  const change = (enabled: boolean) => {
    if (!enabled) {
      void save(false)
      return
    }
    modal.confirm({
      title: '确认开启旧域临时跳转？',
      content: '开启后，sleepno.cn 的普通页面会立即以 307 跳转到 shiyinmp3.com。旧域后台、API、静态资源、下载和证书验证路径继续保留。',
      okText: '确认开启',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => save(true),
    })
  }

  return (
    <Card title="旧域临时跳转" loading={loading}>
      {loadError && (
        <Alert
          type="error"
          showIcon
          message="跳转配置加载失败"
          description="当前状态未知，为避免误操作已禁用开关。"
          action={(
            <Button size="small" onClick={() => void load()}>
              重试
            </Button>
          )}
        />
      )}

      {flag && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type={flag.enabled ? 'warning' : 'info'}
            showIcon
            message={flag.enabled
              ? 'sleepno.cn 普通页面正在临时跳转'
              : 'sleepno.cn 仍完整提供普通页面'}
            description="目标固定为 https://shiyinmp3.com；仅跳转普通页面 GET/HEAD 请求并保留路径和查询参数。永久 301、后台、API、静态资源与下载不受此开关控制。"
          />

          {feedback && (
            <Alert
              type={feedback.type}
              showIcon
              closable
              message={feedback.message}
              onClose={() => setFeedback(null)}
            />
          )}

          <Space size="middle" wrap>
            <Switch
              checked={flag.enabled}
              checkedChildren="跳转"
              unCheckedChildren="保留"
              loading={saving}
              disabled={saving}
              onChange={change}
            />
            <Text>{flag.enabled ? '当前已开启' : '当前已关闭'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {formatTime(flag.updatedAt)}
            </Text>
          </Space>
        </Space>
      )}
    </Card>
  )
}
