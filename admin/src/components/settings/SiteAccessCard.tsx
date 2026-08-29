import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  ApiError,
  api,
  type IpRuleKind,
  type SiteAccessIpRule,
  type SiteAccessSnapshot,
} from '../../lib/api'

const { Text } = Typography

type Feedback = { type: 'success' | 'error'; message: string }
type EditState = { rule: SiteAccessIpRule; note: string } | null

function formatTime(timestamp: number | null) {
  if (timestamp === null) return '使用系统默认值'
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false })
}

function apiErrorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const detail = error.detail
  if (typeof detail !== 'object' || detail === null) return null
  const code = (detail as { error?: unknown }).error
  return typeof code === 'string' ? code : null
}

function errorCopy(error: unknown): string {
  switch (apiErrorCode(error)) {
    case 'duplicate_ip': return '该 IP 已在访问规则中，请直接移动现有规则'
    case 'invalid_ip': return '请输入不带端口或网段的精确 IPv4 / IPv6 地址'
    case 'current_ip_not_allowed': return '当前 IP 不在 sleepno.cn 白名单，无法开启限制模式'
    case 'current_ip_unavailable': return '服务器未能识别当前 IP，无法执行该操作'
    case 'current_ip_protected': return '当前 IP 不能直接删除'
    case 'reserved_ip': return '服务器回环地址由系统保留，不能配置访问规则'
    case 'invalid_restricted_message': return '辅助提示文案最多 200 个字符'
    default: return '操作失败，服务器状态未改变'
  }
}

export function SiteAccessCard() {
  const { modal } = App.useApp()
  const [state, setState] = useState<SiteAccessSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [activeRule, setActiveRule] = useState<IpRuleKind>('allow')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [restrictedMessage, setRestrictedMessage] = useState('')
  const [editState, setEditState] = useState<EditState>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(false)
    setFeedback(null)
    try {
      const next = await api.ensureCurrentIpRule()
      setState(next)
      setRestrictedMessage(next.restrictedPage?.message ?? '')
    } catch (error) {
      try {
        const next = await api.siteAccess()
        setState(next)
        setRestrictedMessage(next.restrictedPage?.message ?? '')
        setFeedback({ type: 'error', message: errorCopy(error) })
      } catch {
        setState(null)
        setLoadError(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const currentRule = useMemo(() => {
    if (!state?.currentIp) return null
    return [...state.allowedIps, ...state.blockedIps]
      .find((rule) => rule.address === state.currentIp) ?? null
  }, [state])

  const run = async (
    key: string,
    operation: () => Promise<SiteAccessSnapshot>,
    success: string,
  ) => {
    if (busy) return
    setBusy(key)
    setFeedback(null)
    try {
      setState(await operation())
      setFeedback({ type: 'success', message: success })
    } catch (error) {
      setFeedback({ type: 'error', message: errorCopy(error) })
      throw error
    } finally {
      setBusy(null)
    }
  }

  const addRule = async () => {
    const nextAddress = address.trim()
    if (!nextAddress) {
      setFeedback({ type: 'error', message: '请输入 IP 地址' })
      return
    }
    try {
      await run(
        'create',
        () => api.createIpRule({
          address: nextAddress,
          rule: activeRule,
          note: note.trim() || null,
        }),
        activeRule === 'allow' ? '已加入 sleepno.cn 白名单' : '已加入 sleepno.cn 黑名单',
      )
      setAddress('')
      setNote('')
    } catch {
      // run 已保留服务端状态并展示错误。
    }
  }

  const changeMode = (enabled: boolean) => {
    const save = () => run(
      'mode',
      () => api.updateSiteAccessMode(enabled),
      enabled ? 'sleepno.cn 白名单限制模式已开启' : 'sleepno.cn 白名单限制模式已关闭；黑名单仍然生效',
    ).catch(() => undefined)
    if (!enabled) {
      void save()
      return
    }
    modal.confirm({
      title: '确认开启白名单限制模式？',
      content: '开启后，仅 sleepno.cn 的公开主站允许白名单 IP；shiyinmp3.com 不受此配置影响。sleepno.cn 的运营后台和健康检查仍不受限制。',
      okText: '确认开启',
      cancelText: '取消',
      onOk: save,
    })
  }

  const moveRule = (rule: SiteAccessIpRule) => {
    const nextRule: IpRuleKind = rule.rule === 'allow' ? 'deny' : 'allow'
    const isCurrent = rule.address === state?.currentIp
    modal.confirm({
      title: nextRule === 'deny'
        ? isCurrent ? '确认禁止当前 IP？' : '确认移入黑名单？'
        : '确认恢复访问？',
      content: nextRule === 'deny' && isCurrent
        ? 'sleepno.cn 公开主站会立即对当前网络返回 403；运营后台仍可访问，可在这里恢复。'
        : nextRule === 'deny'
          ? `${rule.address} 将立即无法访问 sleepno.cn 公开主站。`
          : `${rule.address} 将移回 sleepno.cn 白名单；是否能访问还取决于白名单限制模式。`,
      okText: nextRule === 'deny' ? '确认禁止' : '恢复访问',
      okButtonProps: { danger: nextRule === 'deny' },
      cancelText: '取消',
      onOk: () => run(
        `move-${rule.id}`,
        () => api.updateIpRule(rule.id, {
          rule: nextRule,
          confirmCurrentIp: isCurrent && nextRule === 'deny',
        }),
        nextRule === 'deny' ? '已移入 sleepno.cn 黑名单' : '已移入 sleepno.cn 白名单',
      ).catch(() => undefined),
    })
  }

  const saveEditedNote = async () => {
    if (!editState) return
    try {
      await run(
        `edit-${editState.rule.id}`,
        () => api.updateIpRule(editState.rule.id, { note: editState.note }),
        '备注已更新',
      )
      setEditState(null)
    } catch {
      // run 已保留弹窗输入和服务端状态。
    }
  }

  const saveRestrictedPage = async () => {
    try {
      await run(
        'restricted-page',
        () => api.updateRestrictedPage({
          message: restrictedMessage.trim() || null,
        }),
        '受限页辅助文案已更新',
      )
    } catch {
      // run 已保留表单输入和服务端状态。
    }
  }

  const columns: ColumnsType<SiteAccessIpRule> = [
    {
      title: 'IP 地址', dataIndex: 'address', width: 250,
      render: (value: string, rule) => (
        <Space size={6}>
          <Text code copyable>{value}</Text>
          {value === state?.currentIp && (
            <Tag color={rule.rule === 'deny' ? 'error' : 'processing'}>
              {rule.rule === 'deny' ? '当前 IP · 已禁止' : '当前 IP'}
            </Tag>
          )}
        </Space>
      ),
    },
    { title: '备注', dataIndex: 'note', width: 180, render: (value) => value || '—' },
    { title: '添加时间', dataIndex: 'createdAt', width: 180, render: formatTime },
    {
      title: '操作', key: 'actions', width: 250, fixed: 'right',
      render: (_, rule) => {
        const isCurrent = rule.address === state?.currentIp
        return (
          <Space size={4}>
            <Button type="link" size="small" onClick={() => setEditState({ rule, note: rule.note ?? '' })}>
              编辑备注
            </Button>
            <Button
              type="link"
              danger={rule.rule === 'allow'}
              size="small"
              loading={busy === `move-${rule.id}`}
              onClick={() => moveRule(rule)}
            >
              {rule.rule === 'allow' ? '移至黑名单' : isCurrent ? '恢复访问' : '移至白名单'}
            </Button>
            <Popconfirm
              title="确认删除这条 IP 规则？"
              disabled={isCurrent}
              onConfirm={() => run(
                `delete-${rule.id}`,
                () => api.deleteIpRule(rule.id),
                'IP 规则已删除',
              ).catch(() => undefined)}
            >
              <Button type="link" danger size="small" disabled={isCurrent} loading={busy === `delete-${rule.id}`}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <Card title="公开站点访问控制（仅 sleepno.cn）" loading={loading}>
      {loadError && (
        <Alert type="error" showIcon message="访问配置加载失败" description="当前状态未知，为避免误操作已禁用控制。" action={<Button size="small" onClick={() => void load()}>重试</Button>} />
      )}
      {state && (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {feedback && <Alert type={feedback.type} showIcon closable message={feedback.message} onClose={() => setFeedback(null)} />}
          <Alert
            type={state.enabled ? 'warning' : 'info'}
            showIcon
            message={state.enabled ? 'sleepno.cn 白名单限制模式已开启' : 'sleepno.cn 白名单限制模式未开启'}
            description="本配置仅限制 sleepno.cn；shiyinmp3.com 当前不受白名单和黑名单规则影响。sleepno.cn 的运营后台与健康检查仍不受限制。"
          />
          <Space size="middle" wrap>
            <Switch checked={state.enabled} loading={busy === 'mode'} disabled={busy !== null} checkedChildren="限制" unCheckedChildren="开放" onChange={changeMode} />
            <Text>{state.enabled ? 'sleepno.cn 仅允许白名单' : 'sleepno.cn 默认开放'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>更新于 {formatTime(state.updatedAt)}</Text>
          </Space>
          <Space size="small" wrap>
            <Text>当前请求 IP：</Text>
            {state.currentIp ? <Text code copyable>{state.currentIp}</Text> : <Text type="danger">未识别</Text>}
            {currentRule && <Tag color={currentRule.rule === 'deny' ? 'error' : 'processing'}>{currentRule.rule === 'deny' ? '黑名单' : '白名单'}</Tag>}
          </Space>
          <Card size="small" title="受限页辅助文案">
            {state.restrictedPage === undefined && (
              <Alert
                type="warning"
                showIcon
                message="当前 API 尚未提供受限页配置，请先部署 API v0.4.14"
                style={{ marginBottom: 16 }}
              />
            )}
            <Form layout="vertical" onFinish={() => void saveRestrictedPage()}>
              <Form.Item
                label="辅助提示文案"
                extra="文案为空时，受限页只显示原有访问限制说明。"
              >
                <Input.TextArea
                  value={restrictedMessage}
                  rows={3}
                  maxLength={200}
                  showCount
                  placeholder="例如：关注我们的小红书，获取拾音最新地址。"
                  disabled={busy !== null || state.restrictedPage === undefined}
                  onChange={(event) => setRestrictedMessage(event.target.value)}
                />
              </Form.Item>
              <Space size="middle" wrap>
                <Button type="primary" htmlType="submit" loading={busy === 'restricted-page'} disabled={busy !== null || state.restrictedPage === undefined}>
                  保存辅助文案
                </Button>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  更新于 {formatTime(state.restrictedPage?.updatedAt ?? null)}
                </Text>
              </Space>
            </Form>
          </Card>
          <Form layout="inline" style={{ rowGap: 8 }} onFinish={() => void addRule()}>
            <Form.Item><Input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="精确 IPv4 / IPv6" style={{ width: 240 }} disabled={busy !== null} /></Form.Item>
            <Form.Item><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="备注（可选）" maxLength={64} style={{ width: 180 }} disabled={busy !== null} /></Form.Item>
            <Form.Item><Button type="primary" htmlType="submit" loading={busy === 'create'} disabled={busy !== null}>加入{activeRule === 'allow' ? '白名单' : '黑名单'}</Button></Form.Item>
          </Form>
          <Tabs
            activeKey={activeRule}
            onChange={(key) => setActiveRule(key as IpRuleKind)}
            items={[
              { key: 'allow', label: `允许访问 (${state.allowedIps.length})`, children: <Table rowKey="id" size="small" pagination={false} columns={columns} dataSource={state.allowedIps} scroll={{ x: 860 }} locale={{ emptyText: '暂无白名单 IP' }} /> },
              { key: 'deny', label: `禁止访问 (${state.blockedIps.length})`, children: <Table rowKey="id" size="small" pagination={false} columns={columns} dataSource={state.blockedIps} scroll={{ x: 860 }} locale={{ emptyText: '暂无黑名单 IP' }} /> },
            ]}
          />
        </Space>
      )}
      <Modal
        title="编辑 IP 备注"
        open={editState !== null}
        okText="保存"
        cancelText="取消"
        confirmLoading={editState !== null && busy === `edit-${editState.rule.id}`}
        onOk={() => void saveEditedNote()}
        onCancel={() => { if (!busy) setEditState(null) }}
      >
        <Input
          value={editState?.note ?? ''}
          maxLength={64}
          placeholder="备注（可选）"
          onChange={(event) => setEditState((current) => current ? { ...current, note: event.target.value } : null)}
        />
      </Modal>
    </Card>
  )
}
