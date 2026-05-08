import { useCallback, useEffect, useState } from 'react'
import { api, type FailureRow, type FailureDetail } from '../lib/api'
import { PanelCard } from '../components/Card'
import { Drawer } from '../components/Drawer'
import { formatBytes, formatTime } from '../lib/format'

export function FailuresPage() {
  const [stage, setStage] = useState<'' | 'decrypt' | 'transcode'>('')
  const [code, setCode] = useState<string>('')
  const [page, setPage] = useState(1)
  const [size] = useState(50)
  const [rows, setRows] = useState<FailureRow[]>([])
  const [total, setTotal] = useState(0)
  const [codeAgg, setCodeAgg] = useState<{ error_code: string | null; n: number }[]>([])
  const [loading, setLoading] = useState(false)
  const [detail, setDetail] = useState<FailureDetail | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    api.failures({ stage: stage || undefined, code: code || undefined, page, size })
      .then((d) => { setRows(d.rows); setTotal(d.total); setCodeAgg(d.code_agg) })
      .finally(() => setLoading(false))
  }, [stage, code, page, size])

  useEffect(() => { load() }, [load])

  const openDetail = async (id: number) => {
    setCopied(false)
    const d = await api.failureDetail(id)
    setDetail(d)
  }

  const copyJson = async () => {
    if (!detail) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(detail, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 退化方案：选中 textarea
      alert('复制失败，请手动选择文本')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">失败日志</div>
        <div className="text-xs mt-1" style={{ color: '#8A8680' }}>
          解密 / 转码失败详情 · 点开任意一条获取「复制 JSON」用于排查 {loading && '· 加载中…'}
        </div>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-6">
        {/* 左侧过滤 */}
        <PanelCard title="过滤">
          <div className="space-y-4">
            <div>
              <div className="text-xs mb-2" style={{ color: '#8A8680' }}>阶段</div>
              <div className="flex gap-2 flex-wrap">
                {[
                  { v: '', label: '全部' },
                  { v: 'decrypt', label: '解密' },
                  { v: 'transcode', label: '转码' },
                ].map((o) => (
                  <button
                    key={o.v}
                    onClick={() => { setStage(o.v as typeof stage); setPage(1) }}
                    className="px-2.5 py-1 rounded text-xs"
                    style={stage === o.v ? { background: '#1C1A18', color: '#fff' } : { background: '#ECEAE6', color: '#1C1A18' }}
                  >{o.label}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs mb-2" style={{ color: '#8A8680' }}>错误码</div>
              <div className="flex flex-col gap-1.5 max-h-[300px] overflow-auto">
                <button
                  onClick={() => { setCode(''); setPage(1) }}
                  className="text-left px-2.5 py-1.5 rounded text-xs flex justify-between items-center"
                  style={code === '' ? { background: '#1C1A18', color: '#fff' } : { background: '#ECEAE6' }}
                >
                  <span>全部</span>
                  <span style={{ color: code === '' ? 'rgba(255,255,255,0.5)' : '#8A8680' }}>{total}</span>
                </button>
                {codeAgg.map((c) => (
                  <button
                    key={c.error_code ?? '__null'}
                    onClick={() => { setCode(c.error_code ?? ''); setPage(1) }}
                    className="text-left px-2.5 py-1.5 rounded text-xs flex justify-between items-center"
                    style={code === c.error_code ? { background: '#1C1A18', color: '#fff' } : { background: '#ECEAE6' }}
                  >
                    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{c.error_code ?? '(无错误码)'}</span>
                    <span style={{ color: code === c.error_code ? 'rgba(255,255,255,0.5)' : '#8A8680' }}>{c.n}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </PanelCard>

        {/* 右侧列表 */}
        <PanelCard title={`失败列表（共 ${total} 条）`}>
          <div className="overflow-auto">
            <table className="data">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>阶段</th>
                  <th>错误码</th>
                  <th>文件名</th>
                  <th className="text-right">大小</th>
                  <th>来源</th>
                  <th>错误信息</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="text-center" style={{ color: '#A0988E' }}>暂无失败记录</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r.id)}>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{formatTime(r.ts)}</td>
                    <td>{r.stage === 'decrypt' ? '解密' : '转码'}</td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{r.error_code ?? '-'}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.file_name ?? ''}>
                      {r.file_name ?? '-'}
                    </td>
                    <td className="text-right">{formatBytes(r.file_size)}</td>
                    <td>{r.source ?? '-'}</td>
                    <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.error_msg ?? ''}>
                      {r.error_msg ?? '-'}
                    </td>
                    <td>
                      <button className="text-xs underline" style={{ color: '#F05A2A' }} onClick={(e) => { e.stopPropagation(); openDetail(r.id) }}>查看</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 分页 */}
          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs" style={{ color: '#8A8680' }}>
              第 {page} 页 / 共 {Math.max(1, Math.ceil(total / size))} 页
            </div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn-secondary px-3 py-1.5 rounded text-xs"
              >上一页</button>
              <button
                disabled={page >= Math.ceil(total / size)}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary px-3 py-1.5 rounded text-xs"
              >下一页</button>
            </div>
          </div>
        </PanelCard>
      </div>

      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={`失败详情 #${detail?.id ?? ''}`}
        width={680}
      >
        {detail && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button className="btn-primary px-3 py-1.5 rounded-lg text-xs font-medium" onClick={copyJson}>
                {copied ? '已复制 ✓' : '复制 JSON 给 Claude 排查'}
              </button>
              <span className="text-xs" style={{ color: '#8A8680' }}>
                直接粘贴到 Claude Code 即可定位
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <KV k="时间" v={formatTime(detail.ts)} />
              <KV k="阶段" v={detail.stage === 'decrypt' ? '解密' : '转码'} />
              <KV k="错误码" v={detail.error_code ?? '-'} mono />
              <KV k="来源" v={detail.source ?? '-'} />
              <KV k="文件名" v={detail.file_name ?? '-'} />
              <KV k="文件大小" v={formatBytes(detail.file_size)} />
              <KV k="visitor_id" v={detail.visitor_id} mono />
              <KV k="App 版本" v={detail.app_ver ?? '-'} mono />
              <KV k="IP" v={detail.ip ?? '-'} mono />
              <KV k="UA" v={detail.ua ?? '-'} />
            </div>

            <div>
              <div className="text-xs mb-2" style={{ color: '#8A8680' }}>错误信息</div>
              <div className="neumo-inset p-3 text-xs whitespace-pre-wrap break-words" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                {detail.error_msg ?? '-'}
              </div>
            </div>
            {detail.error_stack && (
              <div>
                <div className="text-xs mb-2" style={{ color: '#8A8680' }}>错误堆栈</div>
                <div className="neumo-inset p-3 text-xs whitespace-pre-wrap break-all" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                  {detail.error_stack}
                </div>
              </div>
            )}

            <details>
              <summary className="text-xs cursor-pointer" style={{ color: '#8A8680' }}>原始 JSON</summary>
              <pre className="neumo-inset p-3 text-xs overflow-auto" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
{JSON.stringify(detail, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </Drawer>
    </div>
  )
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ color: '#8A8680' }}>{k}</div>
      <div style={mono ? { fontFamily: 'JetBrains Mono, monospace', fontSize: 12 } : undefined}>{v}</div>
    </div>
  )
}
