import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Space,
  Switch,
  Tabs,
  Typography,
} from 'antd'
import {
  api,
  type HomepageAnnouncementConfig,
  type HomepageAnnouncementInput,
  type HomepageAnnouncementSite,
} from '../../lib/api'

const { Text } = Typography

type Draft = HomepageAnnouncementInput
type Drafts = Partial<Record<HomepageAnnouncementSite, Draft>>
type Feedback = { type: 'success' | 'error'; message: string }

const SITE_LABELS: Record<HomepageAnnouncementSite, string> = {
  'sleepno.cn': '阿里云原站',
  'shiyinmp3.com': 'Cloudflare 主站',
}

function toDraft(config: HomepageAnnouncementConfig): Draft {
  return {
    enabled: config.enabled,
    message: config.message,
    actionLabel: config.actionLabel,
    actionUrl: config.actionUrl,
  }
}

function formatTime(value: number | null): string {
  if (value === null) return '尚未保存'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function HomepageAnnouncementsCard() {
  const [configs, setConfigs] = useState<HomepageAnnouncementConfig[]>([])
  const [drafts, setDrafts] = useState<Drafts>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [savingSite, setSavingSite] = useState<HomepageAnnouncementSite | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    setFeedback(null)
    try {
      const response = await api.homepageAnnouncements()
      setConfigs(response.announcements)
      setDrafts(Object.fromEntries(
        response.announcements.map((config) => [config.siteHost, toDraft(config)]),
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

  const updateDraft = (
    siteHost: HomepageAnnouncementSite,
    patch: Partial<Draft>,
  ) => {
    setDrafts((current) => ({
      ...current,
      [siteHost]: { ...current[siteHost]!, ...patch },
    }))
  }

  const save = async (siteHost: HomepageAnnouncementSite) => {
    const draft = drafts[siteHost]
    if (!draft || savingSite) return
    const message = draft.message.trim()
    const actionLabel = draft.actionLabel?.trim() || null
    const actionUrl = draft.actionUrl?.trim() || null
    if (draft.enabled && !message) {
      setFeedback({ type: 'error', message: '开启公告前必须填写公告正文' })
      return
    }
    if ((actionLabel === null) !== (actionUrl === null)) {
      setFeedback({ type: 'error', message: '行动点文案和链接必须同时填写或同时留空' })
      return
    }

    setSavingSite(siteHost)
    setFeedback(null)
    try {
      const updated = await api.updateHomepageAnnouncement(siteHost, {
        enabled: draft.enabled,
        message,
        actionLabel,
        actionUrl,
      })
      setConfigs((current) => current.map((item) =>
        item.siteHost === siteHost ? updated : item,
      ))
      setDrafts((current) => ({ ...current, [siteHost]: toDraft(updated) }))
      setFeedback({
        type: 'success',
        message: `${siteHost} 公告配置已保存，新版本会重新展示给曾关闭公告的访客`,
      })
    } catch {
      setFeedback({ type: 'error', message: '保存失败，服务器配置未改变' })
    } finally {
      setSavingSite(null)
    }
  }

  const tabs = configs.map((config) => {
    const draft = drafts[config.siteHost]
    if (!draft) return null
    return {
      key: config.siteHost,
      label: config.siteHost,
      children: (
        <Form layout="vertical" onFinish={() => void save(config.siteHost)}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <div>
              <Space size="middle" wrap>
                <Switch
                  checked={draft.enabled}
                  checkedChildren="显示"
                  unCheckedChildren="隐藏"
                  disabled={savingSite !== null}
                  onChange={(enabled) => updateDraft(config.siteHost, { enabled })}
                />
                <Text>{SITE_LABELS[config.siteHost]}</Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  更新于 {formatTime(config.updatedAt)}
                </Text>
              </Space>
            </div>

            <Form.Item
              label="公告正文"
              extra={(
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <span>纯文本，最多 300 字；关闭显示后仍会保留已填写内容。</span>
                  <span style={{ flex: 'none' }}>{draft.message.length} / 300</span>
                </span>
              )}
              style={{ marginBottom: 0 }}
            >
              <Input.TextArea
                value={draft.message}
                rows={3}
                maxLength={300}
                placeholder="输入该域名首页展示的公告内容"
                disabled={savingSite !== null}
                onChange={(event) => updateDraft(config.siteHost, {
                  message: event.target.value,
                })}
              />
            </Form.Item>

            <Card size="small" title="行动点（可选）">
              <Row gutter={[16, 16]}>
                <Col xs={24} md={7}>
                  <Form.Item
                    label="按钮文案"
                    extra="最多 5 个字"
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      value={draft.actionLabel ?? ''}
                      maxLength={5}
                      placeholder="例如：查看详情"
                      disabled={savingSite !== null}
                      onChange={(event) => updateDraft(config.siteHost, {
                        actionLabel: event.target.value || null,
                      })}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={17}>
                  <Form.Item
                    label="跳转链接"
                    extra="仅支持 https:// 链接或 / 开头的站内路径；必须与按钮文案同时填写。"
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      value={draft.actionUrl ?? ''}
                      maxLength={2048}
                      placeholder="https://example.com/notice 或 /help"
                      disabled={savingSite !== null}
                      onChange={(event) => updateDraft(config.siteHost, {
                        actionUrl: event.target.value || null,
                      })}
                    />
                  </Form.Item>
                </Col>
              </Row>
            </Card>

            <Button
              type="primary"
              htmlType="submit"
              loading={savingSite === config.siteHost}
              disabled={savingSite !== null}
            >
              保存配置
            </Button>
          </Space>
        </Form>
      ),
    }
  }).filter((item): item is NonNullable<typeof item> => item !== null)

  return (
    <Card title="首页公告（按域名独立配置）" loading={loading}>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="公告配置加载失败"
          description="当前状态未知，为避免覆盖服务器配置，表单已停止显示。"
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="两个域名共用后台和数据库，但公告内容互相独立"
            description="分别切换域名标签保存。关闭按钮只隐藏访客当前看到的版本；再次保存会生成新版本并重新显示。"
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
