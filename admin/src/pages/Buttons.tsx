import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, type ButtonsResp } from '../lib/api'
import { PanelCard } from '../components/Card'
import { RangePicker, type Range, rangeQueryString } from '../components/RangePicker'
import { RefreshButton } from '../components/RefreshButton'
import { eventLabel, formatPct } from '../lib/format'

export function ButtonsPage() {
  const [range, setRange] = useState<Range>({ kind: 'preset', preset: '30d' })
  const [data, setData] = useState<ButtonsResp | null>(null)
  const [loading, setLoading] = useState(false)
  const [keyword, setKeyword] = useState('')

  const rq = useMemo(() => rangeQueryString(range), [range])

  const reload = useCallback(() => {
    setLoading(true)
    api.buttons(rq).then(setData).finally(() => setLoading(false))
  }, [rq])

  useEffect(() => { reload() }, [reload])

  const lowered = keyword.trim().toLowerCase()
  const matches = (event: string) => {
    if (!lowered) return true
    const label = eventLabel(event).toLowerCase()
    return event.toLowerCase().includes(lowered) || label.includes(lowered)
  }
  const filteredButtons = (data?.buttons ?? []).filter((b) => matches(b.base) || matches(`${b.base}_click`) || matches(`${b.base}_view`))
  const filteredRaw = (data?.raw ?? []).filter((r) => matches(r.event))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xl font-semibold">按钮埋点</div>
          <div className="text-xs mt-1" style={{ color: '#8A8680' }}>
            各按钮的曝光与点击 PV / UV，以及对应 CTR {loading && '· 加载中…'}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <RangePicker value={range} onChange={setRange} />
          <RefreshButton onClick={reload} loading={loading} />
        </div>
      </div>

      <PanelCard
        title="搜索"
        extra={
          keyword && (
            <button
              onClick={() => setKeyword('')}
              className="text-xs"
              style={{ color: '#8A8680' }}
            >清除</button>
          )
        }
      >
        <input
          type="text"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="按事件名（如 btn_transcode）或中文描述（如 转 MP3）搜索"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        />
        {keyword && (
          <div className="text-xs mt-2" style={{ color: '#8A8680' }}>
            过滤后：聚合行 {filteredButtons.length} / {data?.buttons.length ?? 0}，原始行 {filteredRaw.length} / {data?.raw.length ?? 0}
          </div>
        )}
      </PanelCard>

      <PanelCard title="按钮聚合（曝光 vs 点击）">
        <div className="overflow-auto">
          <table className="data">
            <thead>
              <tr>
                <th>事件名</th>
                <th>中文描述</th>
                <th className="text-right">曝光 PV</th>
                <th className="text-right">曝光 UV</th>
                <th className="text-right">点击 PV</th>
                <th className="text-right">点击 UV</th>
                <th className="text-right">CTR (PV)</th>
                <th className="text-right">CTR (UV)</th>
              </tr>
            </thead>
            <tbody>
              {filteredButtons.length === 0 && (
                <tr><td colSpan={8} className="text-center" style={{ color: '#A0988E' }}>{keyword ? '没有匹配的按钮' : '暂无数据'}</td></tr>
              )}
              {filteredButtons.map((b) => (
                <tr key={b.base}>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{b.base}</td>
                  <td>{eventLabel(`${b.base}_click`)}</td>
                  <td className="text-right">{b.view_pv}</td>
                  <td className="text-right">{b.view_uv}</td>
                  <td className="text-right" style={{ fontWeight: 600 }}>{b.click_pv}</td>
                  <td className="text-right">{b.click_uv}</td>
                  <td className="text-right">{formatPct(b.ctr)}</td>
                  <td className="text-right">{formatPct(b.ctr_uv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>

      <PanelCard title="原始事件计数（含所有 *_click / *_view）">
        <div className="overflow-auto">
          <table className="data">
            <thead>
              <tr>
                <th>事件名</th>
                <th>中文描述</th>
                <th className="text-right">PV</th>
                <th className="text-right">UV</th>
              </tr>
            </thead>
            <tbody>
              {filteredRaw.length === 0 && (
                <tr><td colSpan={4} className="text-center" style={{ color: '#A0988E' }}>{keyword ? '没有匹配的事件' : '暂无数据'}</td></tr>
              )}
              {filteredRaw.map((r) => (
                <tr key={r.event}>
                  <td style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>{r.event}</td>
                  <td>{eventLabel(r.event)}</td>
                  <td className="text-right">{r.pv}</td>
                  <td className="text-right">{r.uv}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>
    </div>
  )
}
