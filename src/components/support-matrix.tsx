// v0.6.0 新增：平台与格式总览弹窗（拖拽区下方入口 + Modal）
// 设计稿：Claude Design 5 模块交付包（module-3 of `_ (2)/`）

import { useEffect } from 'react'
import { analytics } from '../lib/analytics'
import { useImpression } from '../lib/useImpression'
import {
  QQ_INSTALLER_PATH,
  QQ_INSTALLER_SHA256,
  type QqGuideTrigger,
} from './qq-guide'

// ── 表格数据（与 src/lib/decrypt.ts SUPPORTED_EXTS / qmc/handler-map.ts 同步） ─
// 用 React 渲染 rowspan 表格，3 列结构：平台 / 加密扩展名 / 备注与限制
// （v0.6.0 用户反馈：「解密后」列冗余，删除）
type Row = {
  platform: string
  extsCell: string
  /** 备注列：可选的"内联按钮"——QQ 行的「查看 QQ 使用说明 →」走这里 */
  noteCell?: string
  noteAction?: 'open-qq-guide'
  parity: 'odd' | 'even'
  /** 该行所在平台 group 的第一行（用来渲染 rowspan 单元） */
  isPlatformHead?: boolean
  /** 该 group 总共几行（仅 head 有值，用来设 rowSpan） */
  platformRowspan?: number
  /** 该行是 group 的非首行，则不渲染 platform 单元（rowspan 已经覆盖到这里） */
  skipPlatformCell?: boolean
}

const ROWS: Row[] = [
  // 网易云
  { platform: '网易云', extsCell: '.ncm', noteCell: '全平台 · 单文件 ≤200MB', parity: 'odd', isPlatformHead: true, platformRowspan: 1 },
  // 酷狗
  { platform: '酷狗', extsCell: '.kgm / .vpr', noteCell: '仅支持密钥内置版本 · 单文件 ≤100MB', parity: 'even', isPlatformHead: true, platformRowspan: 1 },
  // QQ 音乐（3 行 rowspan）
  { platform: 'QQ 音乐', extsCell: '.mflac / .mflac0 / .mflach', noteCell: '仅 Windows 需下载旧版QQ客户端', parity: 'odd', isPlatformHead: true, platformRowspan: 3 },
  { platform: 'QQ 音乐', extsCell: '.mgg / .mgg0 / .mgg1 / .mggl', noteAction: 'open-qq-guide', parity: 'even', skipPlatformCell: true },
  { platform: 'QQ 音乐', extsCell: '.qmcflac / .qmcogg / .qmc0/2/3/…', parity: 'odd', skipPlatformCell: true },
  // 喜马拉雅
  { platform: '喜马拉雅', extsCell: '.xm', noteCell: 'v2 · 保持原格式，非 MP3 可一键转码', parity: 'even', isPlatformHead: true, platformRowspan: 1 },
  // 通用音频（3 行 rowspan）
  { platform: '通用音频', extsCell: '.flac / .ogg', noteCell: '上传后自动转 MP3', parity: 'odd', isPlatformHead: true, platformRowspan: 3 },
  { platform: '通用音频', extsCell: '.m4a', noteCell: '上传后自动转 MP3', parity: 'even', skipPlatformCell: true },
  { platform: '通用音频', extsCell: '.mp3', noteCell: '已是目标格式', parity: 'odd', skipPlatformCell: true },
]

// ── Esc 关闭 hook（与 qq-guide.tsx 同源逻辑；本组件独立持有一份避免相互依赖） ──
function useEscClose(active: boolean, onClose: () => void) {
  useEffect(() => {
    if (!active) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [active, onClose])
}

// ── 网格 / 列表 SVG 图标（模块 5） ───────────────────────────────────────────
function GridIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18" />
      <path d="M9 9v12" />
    </svg>
  )
}

// ── 拖拽区下方入口 ─────────────────────────────────────────────────────────
export function SupportMatrixEntry({ onOpen }: { onOpen: () => void }) {
  const btnRef = useImpression<HTMLButtonElement>('support_matrix_entry_view')
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => {
        analytics.track('support_matrix_entry_click')
        onOpen()
      }}
      className="text-[11px] outline-none transition-colors rounded-sm hover:underline"
      style={{
        color: '#6A6460',
        fontFamily: "'JetBrains Mono', monospace",
        textUnderlineOffset: '2px',
        padding: '1px 2px',
        outlineColor: 'rgba(240,90,42,0.55)',
        outlineOffset: '2px',
      }}
    >
      查看全部支持的格式 →
    </button>
  )
}

// ── 主 Modal ──────────────────────────────────────────────────────────────
export function SupportMatrixModal({
  onClose,
  onJumpToQqGuide,
}: {
  onClose: () => void
  /** 点击 QQ 行内联按钮：关闭本弹窗 + 打开 QqGuideModal（trigger='matrix'） */
  onJumpToQqGuide: (trigger: QqGuideTrigger) => void
}) {
  useEscClose(true, () => {
    analytics.track('support_matrix_dismiss', { method: 'esc' })
    onClose()
  })

  useEffect(() => {
    analytics.track('support_matrix_view')
  }, [])

  const closeWith = (method: 'overlay' | 'btn' | 'close_x') => {
    analytics.track('support_matrix_dismiss', { method })
    onClose()
  }

  const onDownload = () => {
    analytics.track('qq_download_click', {
      trigger: 'matrix' as QqGuideTrigger,
      sha256: QQ_INSTALLER_SHA256,
    })
    window.location.href = QQ_INSTALLER_PATH
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto"
      style={{ background: 'rgba(28,26,24,0.48)', backdropFilter: 'blur(2px)', padding: 20 }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWith('overlay')
      }}
    >
      <div
        className="modal-in relative rounded-2xl w-full"
        style={{
          maxWidth: 560,
          background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
          padding: 28,
          margin: 'auto',
          boxShadow:
            '0 2px 4px rgba(0,0,0,0.04), 0 8px 20px rgba(0,0,0,0.08), 0 24px 48px rgba(0,0,0,0.10), 0 48px 96px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.80)',
        }}
      >
        {/* 关闭按钮 */}
        <button
          type="button"
          aria-label="关闭"
          onClick={() => closeWith('close_x')}
          className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center transition-colors outline-none"
          style={{
            background: 'rgba(28,26,24,0.06)',
            color: '#6A6460',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(28,26,24,0.12)'
            e.currentTarget.style.color = '#1C1A18'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(28,26,24,0.06)'
            e.currentTarget.style.color = '#6A6460'
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width={14}
            height={14}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* 标题区 */}
        <div className="flex items-center gap-3 mb-5" style={{ paddingRight: 32 }}>
          <div
            className="flex items-center justify-center rounded-lg shrink-0"
            style={{
              width: 40,
              height: 40,
              background: 'linear-gradient(180deg, #FDFCFA 0%, #E4E1DC 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.10), 0 2px 6px rgba(0,0,0,0.05)',
              color: '#4A4240',
            }}
          >
            <GridIcon size={20} />
          </div>
          <div>
            <h2
              className="leading-tight"
              style={{ fontSize: 15, fontWeight: 500, color: '#1C1A18' }}
            >
              支持的平台与格式
            </h2>
            <div
              className="mt-0.5"
              style={{
                fontSize: 11,
                color: '#8A8680',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              当前版本支持的加密格式一览
            </div>
          </div>
        </div>

        {/* 表格 */}
        <div
          className="rounded-lg overflow-hidden"
          style={{ boxShadow: 'inset 0 0 0 1px rgba(28,26,24,0.08)' }}
        >
          <table className="w-full border-collapse">
            <thead>
              <tr style={{ background: 'rgba(28,26,24,0.04)' }}>
                <th style={thStyle('22%')}>平台</th>
                <th style={thStyle('42%')}>加密扩展名</th>
                <th style={thStyle()}>备注与限制</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, idx) => (
                <tr
                  key={idx}
                  style={{
                    background:
                      row.parity === 'odd'
                        ? 'rgba(255,255,255,0.32)'
                        : 'rgba(0,0,0,0.015)',
                  }}
                >
                  {!row.skipPlatformCell && (
                    <td
                      rowSpan={row.platformRowspan}
                      style={{
                        ...tdStyle,
                        fontFamily:
                          "system-ui, -apple-system, 'PingFang SC', sans-serif",
                        fontSize: 12,
                        fontWeight: 500,
                        color: '#2A2826',
                        verticalAlign: 'middle',
                        borderRight: '1px solid rgba(28,26,24,0.06)',
                      }}
                    >
                      {row.platform}
                    </td>
                  )}
                  <td style={tdStyle}>{row.extsCell}</td>
                  <td style={tdStyle}>
                    {row.noteAction === 'open-qq-guide' ? (
                      <button
                        type="button"
                        className="outline-none transition-opacity"
                        onClick={() => {
                          closeWith('btn') // 关闭本弹窗
                          onJumpToQqGuide('matrix')
                        }}
                        style={{
                          color: '#C4310E',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          fontSize: 11,
                          fontFamily: "'JetBrains Mono', monospace",
                          cursor: 'pointer',
                          textUnderlineOffset: '2px',
                          outlineColor: 'rgba(240,90,42,0.5)',
                          outlineOffset: '2px',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.textDecoration = 'underline')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.textDecoration = 'none')
                        }
                      >
                        查看 QQ 使用说明 →
                      </button>
                    ) : (
                      row.noteCell ?? ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 绿色 callout */}
        <div
          className="rounded-md"
          style={{
            marginTop: 12,
            padding: '10px 14px',
            background: 'rgba(35,107,58,0.07)',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            color: '#236B3A',
            lineHeight: 1.65,
          }}
        >
          所有解密在浏览器本地完成，文件不会上传到任何服务器。
        </div>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 flex-wrap" style={{ marginTop: 24 }}>
          <button
            type="button"
            onClick={() => closeWith('btn')}
            className="rounded-md transition-transform active:scale-[0.97] hover:-translate-y-px outline-none"
            style={{
              padding: '8px 16px',
              fontSize: 13,
              color: '#4A4440',
              background: 'linear-gradient(180deg, #F2F0EC 0%, #E0DDD7 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.90), inset 0 -1px 1px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.10)',
              outlineColor: 'rgba(240,90,42,0.5)',
              outlineOffset: '2px',
            }}
          >
            关闭
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="rounded-md text-white transition-transform active:scale-[0.97] hover:-translate-y-px outline-none"
            style={{
              padding: '8px 16px',
              fontSize: 13,
              background: 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 1px rgba(0,0,0,0.20), 0 1px 3px rgba(232,67,26,0.38)',
              outlineColor: 'rgba(240,90,42,0.6)',
              outlineOffset: '2px',
            }}
          >
            下载旧版 QQ 音乐客户端
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 内联样式工具 ───────────────────────────────────────────────────────────
function thStyle(width?: string): React.CSSProperties {
  return {
    width,
    padding: '8px 12px',
    textAlign: 'left',
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    fontWeight: 500,
    color: '#6A6460',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    borderBottom: '1px solid rgba(28,26,24,0.08)',
  }
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 11.5,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#1C1A18',
  verticalAlign: 'middle',
  borderBottom: '1px solid rgba(28,26,24,0.045)',
  lineHeight: 1.55,
}
