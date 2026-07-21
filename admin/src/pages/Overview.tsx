import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Card, Row, Col, Statistic, Button, Space, Typography, Tag, Tooltip as AntTooltip } from 'antd'
import { ReloadOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { api, type OverviewBundleResp } from '../lib/api'
import { AppRangePicker, DEFAULT_RANGE, type Range, rangeQueryString } from '../components/biz/AppRangePicker'
import { ratioLabel } from '../lib/format'
import { OverviewDetails } from './overview/OverviewDetails'

const { Title, Text } = Typography

export function OverviewPage() {
  const [range, setRange] = useState<Range>(DEFAULT_RANGE)
  const [bundle, setBundle] = useState<OverviewBundleResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  const rq = useMemo(() => rangeQueryString(range), [range])

  const loadBundle = useCallback(async (refresh = false) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setLoading(true)
    setLoadError(null)
    try {
      const result = await api.overviewBundle(rq, refresh, controller.signal)
      if (!controller.signal.aborted) setBundle(result)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setLoadError('首页数据加载失败，请点击刷新重试')
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setLoading(false)
      }
    }
  }, [rq])

  useEffect(() => {
    void loadBundle(false)
    return () => requestRef.current?.abort()
  }, [loadBundle])

  const overview = bundle?.overview ?? null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <Title level={4} style={{ margin: 0 }}>数据概览</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>
            站点 PV / UV、人维度、件维度核心 8 指标
          </Text>
        </div>
        <Space>
          <AppRangePicker value={range} onChange={setRange} />
          <Button icon={<ReloadOutlined />} onClick={() => void loadBundle(true)} loading={loading}>刷新</Button>
        </Space>
      </div>

      {bundle && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          数据更新于 {new Date(bundle.generated_at).toLocaleTimeString('zh-CN', { hour12: false })}
          {bundle.data_source === 'raw_fallback' && (
            <Tag color="warning" style={{ marginLeft: 8 }}>汇总暂不可用，已自动读取原始数据</Tag>
          )}
        </Text>
      )}
      {loadError && <Alert type="error" showIcon message={loadError} />}

      {/* 第一组：流量 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}><Card><Statistic title="PV（页面访问）" value={overview?.pv ?? 0} /></Card></Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={
                <Space size={6}>
                  <span>UV（独立访客）</span>
                  <AntTooltip
                    title={(
                      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                        UV 口径 = <code>pageview</code> 事件去重 visitor_id。
                        <br />⚠️ 与「访客日志」可能对不上：访客日志按<b>任意事件</b>去重，
                        包含那些只发了 upload/decrypt 等业务事件但 pageview 因网络/SDK 早期路径丢失的访客。
                        <br />差值 = 业务事件先于 pageview 上报或 pageview 发送失败的访客数，正常时趋近 0。
                      </div>
                    )}
                  >
                    <InfoCircleOutlined style={{ color: '#999' }} />
                  </AntTooltip>
                </Space>
              }
              value={overview?.uv ?? 0}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}><Card><Statistic title="上传过的人 UV" value={overview?.upload_uv ?? 0} /></Card></Col>
        <Col xs={12} md={6}><Card><Statistic title="下载过的人 UV" value={overview?.download_uv ?? 0} /></Card></Col>
      </Row>

      {/* 第二组：件维度 - 成功口径（上传 → 确认上传 → 转换 → 解密 → 转码） */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={
                <Space size={6}>
                  <span>上传文件总数（件）</span>
                  <AntTooltip
                    title={(
                      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                        用户尝试上传的总件数 = upload_attempt（进队列）+ upload_reject（被拒）+ 主动取消。
                        v0.4.8 起拆解为 7 段，按 file_id 关联下游事件，加和严格等于上方主数字：
                        <br />· <b>成功</b>：file_id 下游有 decrypt_done / transcode_done
                        <br />· <b>失败</b>：file_id 下游有 decrypt_fail / transcode_fail（无 done）
                        <br />· <b>中止</b>：file_id 下游有 *_abandon（无 done / fail）—— auto-FLAC OOM 主嫌疑
                        <br />· <b>被拒</b>：upload_reject 中校验失败（格式/大小/队列），<b>不含主动取消</b>
                        <br />· <b>主动取消</b>：用户在 ≥50 文件警告弹窗里反悔（v0.4.8 起独立）
                        <br />· <b>未完成</b>：upload_attempt 有 file_id 但无任何下游事件（兜底，应趋近 0）
                        <br />· <b>历史</b>：v0.4.1 前埋点无 file_id，无法追溯下游
                      </div>
                    )}
                  >
                    <InfoCircleOutlined style={{ color: '#999' }} />
                  </AntTooltip>
                </Space>
              }
              value={overview?.upload_files ?? 0}
            />
            {(() => {
              // 7 段口径：按 file_id 关联 upload_attempt 的下游状态，互斥且穷举
              // v0.4.8 把主动取消从「被拒」里抠出来，独立成第 7 段
              // 加和 = upload_attempt + upload_reject(狭义) + 主动取消 = upload_files，仍与卡片主数字严格自洽
              const success = overview?.success_files ?? 0
              const fail = overview?.failed_files ?? 0
              const abandon = overview?.abandoned_files ?? 0
              const reject = overview?.upload_reject ?? 0      // 后端已剔除主动取消
              const dismiss = overview?.dismissed_files ?? 0   // 主动取消
              const pending = overview?.pending_files ?? 0
              const legacy = overview?.legacy_files ?? 0
              const sum = success + fail + abandon + reject + dismiss + pending + legacy
              const total = overview?.upload_files ?? 0
              const detail = `成功 ${success} + 失败 ${fail} + 中止 ${abandon} + 被拒 ${reject} + 主动取消 ${dismiss} + 未完成 ${pending} + 历史 ${legacy} = ${sum}（应等于上方 ${total}）`
              return (
                <div style={{ marginTop: 4, fontSize: 12, color: 'rgba(0,0,0,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <AntTooltip title={detail}>
                    <span>
                      成功 {success} · 失败 {fail} · 中止 {abandon} · 被拒 {reject} · 主动取消 {dismiss} · 未完成 {pending} · 历史 {legacy}
                    </span>
                  </AntTooltip>
                </div>
              )
            })()}
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={
                <Space size={6}>
                  <span>确认上传数（件）</span>
                  <AntTooltip
                    title={(
                      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                        = 上传文件总数 − 主动取消件数<br />
                        「主动取消」= 用户在 ≥50 文件警告弹窗里点「重新选择」或按 ESC 被丢弃的文件
                        （<code>reject_reason=LARGE_BATCH_DISMISSED</code>）<br />
                        其他被拒原因（格式 / 超大小 / 队列上限）属上传失败，见下方「上传失败（件）」<br />
                        件维度漏斗的第二层就是它
                      </div>
                    )}
                  >
                    <InfoCircleOutlined style={{ color: '#999' }} />
                  </AntTooltip>
                </Space>
              }
              value={overview?.confirmed_upload_files ?? 0}
              valueStyle={{ color: '#1677FF' }}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {`主动取消 ${overview?.dismissed_files ?? 0}`}
                </Text>
              }
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={
                <Space size={6}>
                  <span>转换成功数（件）</span>
                  <AntTooltip title="解密成功（件） + 原始 .flac / .ogg 直接转码成功（件）。同一个文件先解密再转码不会被双计数。">
                    <InfoCircleOutlined style={{ color: '#999' }} />
                  </AntTooltip>
                </Space>
              }
              value={overview?.convert_done ?? 0}
              valueStyle={{ color: '#1677FF' }}
              suffix={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {`= 解密 ${overview?.decrypt_done ?? 0} + 原 flac/ogg 转 ${overview?.raw_flac_transcode_done ?? 0}`}
                </Text>
              }
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="解密成功（件）"
              value={overview?.decrypt_done ?? 0}
              valueStyle={{ color: '#389E0D' }}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>{ratioLabel('成功率', overview?.decrypt_done, overview?.decrypt_fail, overview?.decrypt_success_rate)}</Text>}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="转码成功（件）"
              value={overview?.transcode_done ?? 0}
              valueStyle={{ color: '#389E0D' }}
              suffix={<Text type="secondary" style={{ fontSize: 12 }}>{ratioLabel('成功率', overview?.transcode_done, overview?.transcode_fail, overview?.transcode_success_rate)}</Text>}
            />
          </Card>
        </Col>
      </Row>

      {/* v0.4.3 观察期临时卡片：「上传文件总数（旧口径）」与新口径并列做新旧对比 */}
      {/* 预计 2026-07 评估，新口径稳定后整行删除 */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={
                <Space size={6}>
                  <span>上传文件总数（旧口径）</span>
                  <AntTooltip
                    title={(
                      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
                        旧口径 = <code>SUM(upload_drop / upload_pick 的 count)</code>，v0.4.1 之前的算法。
                        <br />部分上传路径（剪贴板、API 测试等）不发 drop/pick 事件 → 总数偏低。
                        <br />本卡片为 <b>v0.4.3 临时观察用</b>，新口径稳定后（预计 2026-07）移除。
                      </div>
                    )}
                  >
                    <InfoCircleOutlined style={{ color: '#999' }} />
                  </AntTooltip>
                </Space>
              }
              value={overview?.upload_files_legacy ?? 0}
              valueStyle={{ color: 'rgba(0,0,0,0.55)' }}
            />
            {(() => {
              const cur = overview?.upload_files ?? 0
              const legacy = overview?.upload_files_legacy ?? 0
              const delta = cur - legacy
              const pct = cur > 0 ? (delta / cur * 100) : null
              const anomaly = delta < 0
              const text = pct == null
                ? `Δ = 新 ${cur} − 旧 ${legacy} = ${delta}`
                : `Δ = 新 ${cur} − 旧 ${legacy} = ${delta}（占新口径 ${pct.toFixed(1)}%）`
              return (
                <div style={{
                  marginTop: 4, fontSize: 12,
                  color: anomaly ? '#F5222D' : 'rgba(0,0,0,0.45)',
                }}>
                  {anomaly && '⚠️ '}{text}
                </div>
              )
            })()}
          </Card>
        </Col>
      </Row>

      {/* 第三组：件维度 - 失败口径（上传 / 解密 / 转码） */}
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title={
                <Space size={6}>
                  <span>上传失败（件）</span>
                  <AntTooltip title="上传校验阶段被拒的文件件数：格式不支持 / 超出 200MB / 超过 50 个队列上限。v0.4.8 起已剔除「主动取消」（用户在 ≥50 文件警告弹窗反悔的文件），主动取消件数见上方「确认上传数」卡片副字。明细见「解密分析 → 上传日志」按状态筛选。">
                    <InfoCircleOutlined style={{ color: '#999' }} />
                  </AntTooltip>
                </Space>
              }
              value={overview?.upload_reject ?? 0}
              valueStyle={overview && overview.upload_reject > 0 ? { color: '#F5222D' } : undefined}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="解密失败（件）"
              value={overview?.decrypt_fail ?? 0}
              valueStyle={overview && overview.decrypt_fail > 0 ? { color: '#F5222D' } : undefined}
            />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic
              title="转码失败（件）"
              value={overview?.transcode_fail ?? 0}
              valueStyle={overview && overview.transcode_fail > 0 ? { color: '#F5222D' } : undefined}
            />
          </Card>
        </Col>
      </Row>

      <OverviewDetails bundle={bundle} loading={loading} />
    </div>
  )
}
