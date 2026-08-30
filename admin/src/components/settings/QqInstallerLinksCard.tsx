import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Space,
  Tabs,
  Typography,
} from 'antd'
import {
  api,
  type QqInstallerLinkConfig,
  type QqInstallerLinkSite,
} from '../../lib/api'

const { Text } = Typography

type Drafts = Partial<Record<QqInstallerLinkSite, string>>
type Feedback = { type: 'success' | 'error'; message: string }

const SITE_LABELS: Record<QqInstallerLinkSite, string> = {
  'sleepno.cn': '阿里云原站',
  'shiyinmp3.com': 'Cloudflare 主站',
}

const EMPTY_LINK_COPY: Record<QqInstallerLinkSite, string> = {
  'sleepno.cn': '留空时继续使用服务器现有的同源 ZIP，不改变当前用户体验。',
  'shiyinmp3.com': '留空时不跳转，并显示“暂不支持，敬请期待”。',
}

function formatTime(value: number | null): string {
  if (value === null) return '尚未保存'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

function isSafeHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function QqInstallerLinksCard() {
  const [configs, setConfigs] = useState<QqInstallerLinkConfig[]>([])
  const [drafts, setDrafts] = useState<Drafts>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [savingSite, setSavingSite] = useState<QqInstallerLinkSite | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    setFeedback(null)
    try {
      const response = await api.qqInstallerLinks()
      setConfigs(response.links)
      setDrafts(Object.fromEntries(
        response.links.map((config) => [config.siteHost, config.url ?? '']),
      ) as Drafts)
    } catch {
      setConfigs([])
      setDrafts({})
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const save = async (siteHost: QqInstallerLinkSite) => {
    if (savingSite) return
    const url = (drafts[siteHost] ?? '').trim()
    if (url && !isSafeHttpsUrl(url)) {
      setFeedback({
        type: 'error',
        message: '跳转链接必须是完整的 https:// 地址',
      })
      return
    }

    setSavingSite(siteHost)
    setFeedback(null)
    try {
      const updated = await api.updateQqInstallerLink(siteHost, {
        url: url || null,
      })
      setConfigs((current) => current.map((item) =>
        item.siteHost === siteHost ? updated : item,
      ))
      setDrafts((current) => ({
        ...current,
        [siteHost]: updated.url ?? '',
      }))
      setFeedback({
        type: 'success',
        message: updated.url
          ? `${siteHost} 已改为外部跳转链接，主站刷新后生效`
          : `${siteHost} 的外部跳转链接已清空`,
      })
    } catch {
      setFeedback({ type: 'error', message: '保存失败，服务器配置未改变' })
    } finally {
      setSavingSite(null)
    }
  }

  const tabs = configs.map((config) => ({
    key: config.siteHost,
    label: config.siteHost,
    children: (
      <Form layout="vertical" onFinish={() => void save(config.siteHost)}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div style={{ minWidth: 0 }}>
            <Text>{SITE_LABELS[config.siteHost]}</Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              更新于 {formatTime(config.updatedAt)}
            </Text>
          </div>

          <Form.Item
            label="网盘跳转链接"
            extra={(
              <span>
                仅支持完整 HTTPS 地址，最多 2048 字符。{EMPTY_LINK_COPY[config.siteHost]}
              </span>
            )}
            style={{ marginBottom: 0 }}
          >
            <Input
              type="url"
              value={drafts[config.siteHost] ?? ''}
              maxLength={2048}
              placeholder="https://pan.example.com/s/..."
              disabled={savingSite !== null}
              onChange={(event) => setDrafts((current) => ({
                ...current,
                [config.siteHost]: event.target.value,
              }))}
            />
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={savingSite === config.siteHost}
            disabled={savingSite !== null}
          >
            保存链接
          </Button>
        </Space>
      </Form>
    ),
  }))

  return (
    <Card title="QQ 旧版客户端下载链接（按域名独立配置）" loading={loading}>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="QQ 客户端链接配置加载失败"
          description="当前状态未知，为避免覆盖服务器配置，表单已停止显示。"
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="先灰度 Cloudflare 主站，阿里云原站暂不切换"
            description="第一阶段只保存 shiyinmp3.com 的网盘地址。观察稳定并再次确认后，再给 sleepno.cn 保存同一地址。"
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
          <Tabs items={tabs} tabBarGutter={12} destroyOnHidden={false} />
        </Space>
      )}
    </Card>
  )
}
