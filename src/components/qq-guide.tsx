// v0.6.0 新增：QQ 音乐使用说明引导（拖拽区下方入口 + Modal + FileRow 失败行 CTA + 通用图标）
// 设计稿：Claude Design 5 模块交付包（module-1 / module-2 / module-4 / module-5 of `_ (2)/`）

import { useEffect } from 'react'
import { analytics } from '../lib/analytics'
import { useImpression } from '../lib/useImpression'

// ── 触发来源（埋点 trigger 字段） ────────────────────────────────────────────
export type QqGuideTrigger = 'entry' | 'failure' | 'auto' | 'matrix'

// ── 文案常量（运营可独立调） ─────────────────────────────────────────────────
export const QQ_GUIDE_COPY = {
  title: 'QQ 音乐解密 · 使用说明',
  subtitle: '仅支持 Windows · v19.51 旧版',
  callout: '只支持旧版 QQ 音乐（v19.51 Windows）下载的文件，新版不支持。',
  steps: [
    '卸载当前版本的 QQ 音乐（如果已装）',
    '下载下方旧版安装包，解压即用',
    '用你的 QQ 会员登录，搜索想要的歌曲并「下载」',
    '把下载的音频文件上传至本站，自动解密',
  ],
  notes: [
    '仅支持 Windows',
    '本工具不解密无版权 / 未购买的歌曲，请遵守版权法规',
  ],
  downloadCta: '⬇ 下载 QQ 音乐 v19.51（约 105 MB）',
  closeCta: '关闭',
} as const

// 安装包路径与 sha256（与 [docs/QQ_INSTALLER_SHA256.md](docs/QQ_INSTALLER_SHA256.md) 同步）
export const QQ_INSTALLER_PATH = '/downloads/qq-music-v19.51-windows.zip'
export const QQ_INSTALLER_SHA256 =
  'f1e2e2e35d1ffa6caadd8dea528c4b6120c5130e73260b3a73635d30531557cb'

// ── 通用：弹窗 Esc 关闭 hook ────────────────────────────────────────────────
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

// ── 单色 stroke 图标（移植自模块 5） ────────────────────────────────────────
export function MusicNoteIcon({ size = 20, className }: { size?: number; className?: string }) {
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
      className={className}
      aria-hidden
    >
      <path d="M9 18.5V7.5" />
      <path d="M9 7.5c3.5-1.5 7.5-1 8.5 1.5" />
      <ellipse cx="7" cy="19" rx="2.8" ry="1.8" transform="rotate(-12 7 19)" />
    </svg>
  )
}

export function QuestionIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M6.3 6.3a2 2 0 0 1 3.9.7c0 1.4-1.8 1.8-1.8 3" />
      <path d="M8 12v.5" strokeWidth="2.2" />
    </svg>
  )
}

// ── 模块 1：拖拽区下方文字按钮入口（不含周围文案行，让 App.tsx 自己组合） ──
export function QqGuideEntry({ onOpen }: { onOpen: (trigger: QqGuideTrigger) => void }) {
  const btnRef = useImpression<HTMLButtonElement>('qq_guide_entry_view')
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={() => {
        analytics.track('qq_guide_entry_click')
        onOpen('entry')
      }}
      className="text-[11px] outline-none transition-colors rounded-sm hover:underline focus-visible:outline-2"
      style={{
        color: '#6A6460',
        fontFamily: "'JetBrains Mono', monospace",
        textUnderlineOffset: '2px',
        padding: '1px 2px',
        outlineColor: 'rgba(240,90,42,0.55)',
        outlineOffset: '2px',
      }}
    >
      如何转换 QQ 音乐文件 →
    </button>
  )
}

// ── 模块 4：FileRow 失败行内的「为什么？怎么办？」CTA ──────────────────────
export function QqWhyCta({ onOpen }: { onOpen: (trigger: QqGuideTrigger) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        analytics.track('qq_guide_entry_click', { from: 'failure' })
        onOpen('failure')
      }}
      className="inline-flex items-center gap-[3px] text-[11px] outline-none transition-colors rounded-sm hover:underline shrink-0 whitespace-nowrap"
      style={{
        color: 'rgba(196,49,14,0.72)',
        padding: '1px 2px',
        textUnderlineOffset: '2px',
        outlineColor: 'rgba(240,90,42,0.55)',
        outlineOffset: '2px',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#C4310E')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(196,49,14,0.72)')}
    >
      <QuestionIcon size={11} />
      为什么？怎么办？
    </button>
  )
}

// ── 模块 2：QqGuideModal ─────────────────────────────────────────────────
export function QqGuideModal({
  trigger,
  onClose,
}: {
  trigger: QqGuideTrigger
  onClose: () => void
}) {
  useEscClose(true, () => {
    analytics.track('qq_guide_dismiss', { trigger, method: 'esc' })
    onClose()
  })

  useEffect(() => {
    analytics.track('qq_guide_view', { trigger })
  }, [trigger])

  const closeWith = (method: 'overlay' | 'btn' | 'close_x') => {
    analytics.track('qq_guide_dismiss', { trigger, method })
    onClose()
  }

  const onDownload = () => {
    analytics.track('qq_download_click', {
      trigger,
      sha256: QQ_INSTALLER_SHA256,
    })
    // 让浏览器按 path 触发原生下载（含 Content-Disposition / Content-Type 由 nginx 决定）
    window.location.href = QQ_INSTALLER_PATH
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3"
      style={{ background: 'rgba(28,26,24,0.48)', backdropFilter: 'blur(2px)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeWith('overlay')
      }}
    >
      <div
        className="modal-in relative rounded-2xl w-full"
        style={{
          maxWidth: 440,
          background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
          padding: 28,
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
            <MusicNoteIcon size={20} />
          </div>
          <div>
            <h2
              id="qq-guide-title"
              className="leading-tight"
              style={{ fontSize: 15, fontWeight: 500, color: '#1C1A18' }}
            >
              {QQ_GUIDE_COPY.title}
            </h2>
            <div
              className="mt-0.5"
              style={{
                fontSize: 11,
                color: '#8A8680',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {QQ_GUIDE_COPY.subtitle}
            </div>
          </div>
        </div>

        {/* 红色 callout */}
        <div
          className="rounded-md mb-5"
          style={{
            padding: '10px 14px',
            background: 'rgba(184,48,32,0.07)',
            borderLeft: '2.5px solid #B83020',
            color: '#B83020',
            fontSize: 12.5,
            lineHeight: 1.65,
          }}
        >
          {QQ_GUIDE_COPY.callout}
        </div>

        {/* 操作步骤 */}
        <div
          className="mb-2.5"
          style={{
            fontSize: 10.5,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
            color: '#6A6460',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          操作步骤
        </div>
        <ol className="flex flex-col gap-2 mb-5 list-none p-0">
          {QQ_GUIDE_COPY.steps.map((text, idx) => (
            <li key={idx} className="flex gap-2.5 items-start">
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: '#C4310E',
                  lineHeight: 1.7,
                  width: 16,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {idx + 1}.
              </span>
              <span
                style={{ fontSize: 13, color: '#1C1A18', lineHeight: 1.65 }}
              >
                {text}
              </span>
            </li>
          ))}
        </ol>

        {/* 注意 */}
        <div
          className="mb-2.5"
          style={{
            fontSize: 10.5,
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 500,
            color: '#6A6460',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          注意
        </div>
        <ul className="flex flex-col gap-1.5 mb-6 list-none p-0">
          {QQ_GUIDE_COPY.notes.map((text, idx) => (
            <li key={idx} className="flex gap-2 items-start">
              <span style={{ color: 'rgba(28,26,24,0.35)', lineHeight: 1.75, flexShrink: 0 }}>·</span>
              <span
                style={{
                  fontSize: 11.5,
                  color: '#8A8680',
                  lineHeight: 1.7,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                {text}
              </span>
            </li>
          ))}
        </ul>

        {/* 底部按钮 */}
        <div className="flex justify-end gap-2 flex-wrap">
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
            {QQ_GUIDE_COPY.closeCta}
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
            {QQ_GUIDE_COPY.downloadCta}
          </button>
        </div>
      </div>
    </div>
  )
}
