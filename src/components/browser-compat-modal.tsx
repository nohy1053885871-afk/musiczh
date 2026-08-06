import { useCallback, useEffect, useRef } from 'react'
import { analytics } from '../lib/analytics'
import type { BrowserCompatibility } from '../lib/browser-compat'

type BrowserCompatModalProps = {
  compatibility: BrowserCompatibility
  onDismiss: () => void
}

// React StrictMode 在开发环境会重复执行 mount effect；同一 document 只记一次曝光。
let viewTrackedInCurrentDocument = false

export function BrowserCompatModal({
  compatibility,
  onDismiss,
}: BrowserCompatModalProps) {
  const confirmRef = useRef<HTMLButtonElement | null>(null)
  const viewTrackedRef = useRef(false)
  const dismissedRef = useRef(false)
  const {
    family,
    detectedVersion = 'unknown',
    requiredVersion = 'unknown',
  } = compatibility

  useEffect(() => {
    if (viewTrackedRef.current || viewTrackedInCurrentDocument) return
    viewTrackedRef.current = true
    viewTrackedInCurrentDocument = true
    analytics.track('dialog_browser_compat_view', {
      browser_family: family,
      detected_version: detectedVersion,
      required_version: requiredVersion,
    })
  }, [detectedVersion, family, requiredVersion])

  const closeWith = useCallback((action: 'button' | 'esc' | 'overlay') => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    analytics.track('dialog_browser_compat_close', {
      action,
      browser_family: family,
      detected_version: detectedVersion,
      required_version: requiredVersion,
    })
    onDismiss()
  }, [detectedVersion, family, onDismiss, requiredVersion])

  const confirm = useCallback(() => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    analytics.track('dialog_browser_compat_confirm', {
      action: 'confirm',
      browser_family: family,
      detected_version: detectedVersion,
      required_version: requiredVersion,
    })
    onDismiss()
  }, [detectedVersion, family, onDismiss, requiredVersion])

  useEffect(() => {
    const previouslyFocused = document.activeElement
    confirmRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeWith('esc')
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [closeWith])

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6"
      style={{
        background: 'rgba(28,26,24,0.42)',
        backdropFilter: 'blur(2px)',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeWith('overlay')
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="browser-compat-title"
        aria-describedby="browser-compat-description"
        className="modal-in relative w-full overflow-hidden rounded-2xl"
        style={{
          maxWidth: 420,
          background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
          boxShadow:
            '0 32px 64px -16px rgba(28,26,24,0.34), 0 12px 24px -8px rgba(28,26,24,0.18), 0 0 0 1px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.96)',
        }}
      >
        <div className="px-6 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-7">
          <div className="mb-4 flex items-start gap-3.5">
            <div
              className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
              style={{
                color: '#7B5A14',
                background: 'linear-gradient(180deg, #FBF0D8 0%, #F4E4B8 100%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.07)',
              }}
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                width="21"
                height="21"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="8.5" />
                <path d="M3.8 9.5h16.4M3.8 14.5h16.4" />
                <path d="M12 3.5c2 2.3 3 5.1 3 8.5s-1 6.2-3 8.5c-2-2.3-3-5.1-3-8.5s1-6.2 3-8.5Z" />
              </svg>
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <h2
                id="browser-compat-title"
                className="text-[17px] font-medium leading-6"
                style={{ color: '#1C1A18' }}
              >
                浏览器版本过低
              </h2>
            </div>
          </div>

          <p
            id="browser-compat-description"
            className="m-0 text-[14px] font-normal leading-6"
            style={{ color: '#6A6460' }}
          >
            当前浏览器版本过低，为了给您带来更好的使用体验，请您更新浏览器版本。
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => closeWith('button')}
              className="h-10 rounded-md text-[14px] font-medium transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95"
              style={{
                color: '#3F3B37',
                background: 'linear-gradient(180deg, #F4F2EE 0%, #E4E2DC 100%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.07)',
              }}
            >
              关闭
            </button>
            <button
              ref={confirmRef}
              type="button"
              onClick={confirm}
              className="h-10 rounded-md text-[14px] font-medium outline-none transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F05A2A]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#ECEAE6]"
              style={{
                color: '#FFF9F5',
                background: 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2), 0 1px 3px rgba(232,67,26,0.35)',
              }}
            >
              确定
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
