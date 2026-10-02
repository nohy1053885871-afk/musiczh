import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Popconfirm,
  Row,
  Space,
  Switch,
  Typography,
  Upload,
} from 'antd'
import { DeleteOutlined, InboxOutlined } from '@ant-design/icons'
import type { UploadProps } from 'antd'
import {
  ApiError,
  api,
  type FooterHoverCardConfig,
} from '../../lib/api'

const { Text } = Typography
const { Dragger } = Upload
const MAX_BYTES = 20 * 1024 * 1024
const ACCEPTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const ACCEPTED_NAME = /\.(png|jpe?g|webp)$/i

type Feedback = { type: 'success' | 'error'; message: string }

const SAVE_ERROR_MESSAGES: Record<string, string> = {
  payload_too_large: '图片或上传请求超过 20 MiB，请压缩后重试',
  image_too_large: '图片超过 20 MiB，请压缩后重试',
  image_empty: '图片内容为空，请重新选择',
  image_invalid: '无法识别图片结构，请重新导出为标准 PNG、JPEG 或 WebP 后重试',
  image_mime_mismatch: '图片扩展名、MIME 类型与真实文件内容不一致',
  invalid_image_field: '上传图片字段无效，请重新选择图片',
  invalid_multipart: '上传请求不完整，请重新选择图片后重试',
  invalid_payload: '配置字段无效，请刷新页面后重试',
  label_invalid: '入口文案无效，最多填写 10 个字符',
  label_required_when_enabled: '开启展示前必须填写入口文案',
  image_required_when_enabled: '开启展示前必须上传图片',
  image_and_remove_conflict: '不能同时替换和移除图片，请重新选择操作',
}

function saveErrorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return '保存失败，服务器配置未改变'
  const detail = error.detail
  const code = typeof detail === 'object' && detail !== null &&
    typeof (detail as Record<string, unknown>).error === 'string'
    ? (detail as Record<string, string>).error
    : null
  if (!code) return `保存失败（HTTP ${error.status}），服务器配置未改变`
  return `${SAVE_ERROR_MESSAGES[code] ?? '保存失败，服务器配置未改变'}（${code}）`
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(value < 100 * 1024 ? 1 : 0)} KB`
  }
  return `${(value / (1024 * 1024)).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MiB`
}

function formatTime(value: number | null): string {
  if (value === null) return '尚未保存'
  return new Date(value).toLocaleString('zh-CN', { hour12: false })
}

export function FooterHoverCard() {
  const [config, setConfig] = useState<FooterHoverCardConfig | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [label, setLabel] = useState('')
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const clearPendingFile = useCallback(() => {
    setPendingPreview((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setPendingFile(null)
  }, [])

  const applyConfig = useCallback((next: FooterHoverCardConfig) => {
    setConfig(next)
    setEnabled(next.enabled)
    setLabel(next.label)
    setRemoveImage(false)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    setFeedback(null)
    try {
      const next = await api.footerHoverCard()
      clearPendingFile()
      applyConfig(next)
    } catch {
      setConfig(null)
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }, [applyConfig, clearPendingFile])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  useEffect(() => () => {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
  }, [pendingPreview])

  const preview = useMemo(() => {
    if (pendingPreview && pendingFile) {
      return {
        url: pendingPreview,
        title: '待保存的新图片',
        detail: `${pendingFile.name} · ${formatBytes(pendingFile.size)}`,
      }
    }
    if (!removeImage && config?.image) {
      return {
        url: config.image.url,
        title: '当前线上图片',
        detail:
          `${config.image.width} × ${config.image.height} · ${formatBytes(config.image.byteSize)}`,
      }
    }
    return null
  }, [config, pendingFile, pendingPreview, removeImage])

  const beforeUpload: UploadProps['beforeUpload'] = async (candidate) => {
    setFeedback(null)
    const file = candidate as File
    const hasAcceptedType = ACCEPTED_MIME_TYPES.has(file.type) ||
      (file.type === '' && ACCEPTED_NAME.test(file.name))
    if (!hasAcceptedType || !ACCEPTED_NAME.test(file.name)) {
      setFeedback({ type: 'error', message: '仅支持 PNG、JPEG 或 WebP 图片' })
      return Upload.LIST_IGNORE
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      setFeedback({ type: 'error', message: '图片必须大于 0 B 且不超过 20 MiB' })
      return Upload.LIST_IGNORE
    }

    clearPendingFile()
    setPendingFile(file)
    setPendingPreview(URL.createObjectURL(file))
    setRemoveImage(false)
    return Upload.LIST_IGNORE
  }

  const save = async () => {
    if (!config || saving) return
    const trimmedLabel = label.trim()
    const hasImage = pendingFile !== null || (config.image !== null && !removeImage)
    if (enabled && !trimmedLabel) {
      setFeedback({ type: 'error', message: '开启展示前必须填写入口文案' })
      return
    }
    if (Array.from(trimmedLabel).length > 10) {
      setFeedback({ type: 'error', message: '入口文案最多 10 个字符' })
      return
    }
    if (enabled && !hasImage) {
      setFeedback({ type: 'error', message: '开启展示前必须上传图片' })
      return
    }

    setSaving(true)
    setFeedback(null)
    try {
      const updated = await api.updateFooterHoverCard({
        enabled,
        label: trimmedLabel,
        image: pendingFile ?? undefined,
        removeImage,
      })
      clearPendingFile()
      applyConfig(updated)
      setFeedback({
        type: 'success',
        message: updated.enabled
          ? '底部悬浮图已保存并启用，主站刷新后生效'
          : '配置已保存，当前保持隐藏',
      })
    } catch (error) {
      setFeedback({ type: 'error', message: saveErrorMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="底部悬浮图（全站统一配置）" loading={loading}>
      {loadError ? (
        <Alert
          type="error"
          showIcon
          message="底部悬浮图配置加载失败"
          description="当前状态未知，为避免覆盖服务器配置，表单已停止显示。"
          action={<Button size="small" onClick={() => void load()}>重试</Button>}
        />
      ) : config && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="该配置同时用于 shiyinmp3.com 与 sleepno.cn"
            description="桌面端悬浮或键盘聚焦时显示图片；移动端点击入口后从底部展开。原有本地处理声明始终保留。"
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
              checked={enabled}
              checkedChildren="显示"
              unCheckedChildren="隐藏"
              disabled={saving}
              onChange={setEnabled}
            />
            <Text>{enabled ? '当前计划显示' : '当前计划隐藏'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              更新于 {formatTime(config.updatedAt)}
            </Text>
          </Space>

          <Row gutter={[20, 20]}>
            <Col xs={24} lg={12}>
              <Form layout="vertical" onFinish={() => void save()}>
                <Form.Item
                  label="入口文案"
                  extra="最多 10 个字符；关闭后仍会保留已填写内容。"
                >
                  <Input
                    value={label}
                    maxLength={10}
                    showCount
                    placeholder="例如：关注拾音"
                    disabled={saving}
                    onChange={(event) => setLabel(event.target.value)}
                  />
                </Form.Item>

                <Form.Item
                  label="悬浮图片"
                  extra="支持 PNG、JPEG、WebP；≤ 20 MiB，不限制图片宽高。"
                >
                  <Dragger
                    accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                    beforeUpload={beforeUpload}
                    disabled={saving}
                    maxCount={1}
                    showUploadList={false}
                  >
                    <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                    <p className="ant-upload-text">点击或拖拽图片到这里</p>
                    <p className="ant-upload-hint">选择后先在右侧预览，保存配置才会生效</p>
                  </Dragger>
                </Form.Item>

                <Space wrap>
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={saving}
                    disabled={saving}
                  >
                    保存配置
                  </Button>
                  {pendingFile && (
                    <Button disabled={saving} onClick={clearPendingFile}>
                      取消替换
                    </Button>
                  )}
                  {!pendingFile && config.image && !removeImage && (
                    <Popconfirm
                      title="移除当前图片？"
                      description="需要同时关闭展示后才能保存移除。"
                      okText="标记移除"
                      cancelText="取消"
                      onConfirm={() => {
                        setEnabled(false)
                        setRemoveImage(true)
                      }}
                    >
                      <Button danger icon={<DeleteOutlined />} disabled={saving}>
                        移除图片
                      </Button>
                    </Popconfirm>
                  )}
                  {removeImage && (
                    <Button disabled={saving} onClick={() => setRemoveImage(false)}>
                      保留原图
                    </Button>
                  )}
                </Space>
              </Form>
            </Col>

            <Col xs={24} lg={12}>
              <Card size="small" title="效果预览">
                {preview ? (
                  <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <div
                      style={{
                        minHeight: 240,
                        padding: 12,
                        display: 'grid',
                        placeItems: 'center',
                        borderRadius: 8,
                        background: '#F5F5F5',
                      }}
                    >
                      <img
                        src={preview.url}
                        alt="底部悬浮图预览"
                        style={{
                          display: 'block',
                          width: '100%',
                          height: 'auto',
                          borderRadius: 6,
                        }}
                      />
                    </div>
                    <Text>{preview.title}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {preview.detail}
                    </Text>
                  </Space>
                ) : (
                  <div
                    style={{
                      minHeight: 240,
                      display: 'grid',
                      placeItems: 'center',
                      color: 'rgba(0,0,0,0.45)',
                    }}
                  >
                    {removeImage ? '保存后将移除当前图片' : '尚未上传图片'}
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </Space>
      )}
    </Card>
  )
}
