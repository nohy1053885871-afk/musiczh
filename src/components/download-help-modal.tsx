import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { analytics } from '../lib/analytics'

type CloseAction = 'button' | 'close_x' | 'esc' | 'overlay'
const trackedOpenIds = new Set<number>()
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.offsetParent !== null)
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 7.5h6l2-2h9v13h-17z" />
      <path d="M3.5 9.5h17" />
      <path d="M12 12v4m0 0-2-2m2 2 2-2" />
    </svg>
  )
}

function MultipleDownloadsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3.5v8m0 0-3-3m3 3 3-3" />
      <path d="M16 3.5v8m0 0-3-3m3 3 3-3" />
      <path d="M4 15.5v4h16v-4" />
    </svg>
  )
}

function StepCard({
  number,
  title,
  icon,
  children,
}: {
  number: number
  title: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <section
      className="rounded-xl p-4 sm:p-[18px]"
      style={{
        background: 'linear-gradient(180deg, #F8F6F2 0%, #ECE9E3 100%)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.92), inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.07)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
          style={{
            color: '#C4310E',
            background: 'linear-gradient(180deg, #FFF7F2 0%, #F3DED4 100%)',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.07)',
          }}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-baseline gap-2">
            <span
              className="text-[10px]"
              style={{ color: '#C4310E', fontFamily: "'JetBrains Mono', monospace" }}
            >
              0{number}
            </span>
            <h3 className="text-[14px] font-medium leading-5" style={{ color: '#1C1A18' }}>
              {title}
            </h3>
          </div>
          <div className="space-y-2 text-[13px] font-normal leading-[1.7]" style={{ color: '#6A6460' }}>
            {children}
          </div>
        </div>
      </div>
    </section>
  )
}

export function DownloadHelpModal({ openId, onClose }: { openId: number; onClose: () => void }) {
  const dialogRef = useRef<HTMLElement | null>(null)
  const dismissedRef = useRef(false)

  useEffect(() => {
    if (trackedOpenIds.has(openId)) return
    trackedOpenIds.add(openId)
    analytics.track('download_help_view')
  }, [openId])

  const closeWith = useCallback((action: CloseAction) => {
    if (dismissedRef.current) return
    dismissedRef.current = true
    analytics.track('download_help_close', { action })
    onClose()
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement
    const appRoot = document.getElementById('root')
    const previousRootInert = appRoot?.inert ?? false
    const previousBodyOverflow = document.body.style.overflow
    const dialog = dialogRef.current

    if (appRoot) appRoot.inert = true
    document.body.style.overflow = 'hidden'
    dialog?.focus({ preventScroll: true })

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeWith('esc')
        return
      }
      if (event.key !== 'Tab' || !dialog) return

      const focusableElements = getFocusableElements(dialog)
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && (activeElement === firstElement || activeElement === dialog || !dialog.contains(activeElement))) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && (activeElement === lastElement || !dialog.contains(activeElement))) {
        event.preventDefault()
        firstElement.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (appRoot) appRoot.inert = previousRootInert
      document.body.style.overflow = previousBodyOverflow
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus()
    }
  }, [closeWith])

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center px-3 py-4 sm:px-4 sm:py-6"
      style={{ background: 'rgba(28,26,24,0.46)', backdropFilter: 'blur(2px)' }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeWith('overlay')
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-help-title"
        aria-describedby="download-help-description"
        className="modal-in relative flex w-full flex-col overflow-hidden rounded-2xl outline-none"
        style={{
          maxWidth: 520,
          maxHeight: 'calc(100dvh - 32px)',
          background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
          boxShadow: '0 32px 64px -16px rgba(28,26,24,0.34), 0 12px 24px -8px rgba(28,26,24,0.18), 0 0 0 1px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.96)',
        }}
      >
        <button
          type="button"
          aria-label="关闭"
          onClick={() => closeWith('close_x')}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#F05A2A]/35"
          style={{ background: 'rgba(28,26,24,0.06)', color: '#6A6460' }}
          onMouseEnter={(event) => {
            event.currentTarget.style.background = 'rgba(28,26,24,0.12)'
            event.currentTarget.style.color = '#1C1A18'
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.background = 'rgba(28,26,24,0.06)'
            event.currentTarget.style.color = '#6A6460'
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="shrink-0 px-5 pb-4 pt-6 sm:px-7 sm:pb-5 sm:pt-7">
          <div className="pr-9">
            <h2 id="download-help-title" className="text-[17px] font-medium leading-6" style={{ color: '#1C1A18' }}>
              下载的音乐文件去哪了？
            </h2>
            <p id="download-help-description" className="mt-2 text-[13px] font-normal leading-[1.7]" style={{ color: '#6A6460' }}>
              点了下载没反应、找不到文件，通常按下面两步就能解决。
            </p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-1 sm:px-7">
          <div className="space-y-3">
            <StepCard number={1} title="先找下载记录" icon={<FolderIcon />}>
              <p>点击浏览器右上角的“下载”图标，找到刚下载的音频文件，再点文件夹图标或“在文件夹中显示”。</p>
              <p>也可以进入浏览器“设置 → 下载”查看保存位置；如果没有修改过，一般就在电脑的“下载”文件夹。</p>
            </StepCard>

            <StepCard number={2} title="批量下载只出现一首？" icon={<MultipleDownloadsIcon />}>
              <p>检查地址栏附近是否有下载被拦截的提示，选择允许本站连续下载多个文件，再回到页面重新点击“下载全部”。</p>
              <div className="rounded-md px-3 py-2" style={{ background: 'rgba(28,26,24,0.045)', color: '#4A4440' }}>
                <p><span className="font-medium">Chrome：</span>设置 → 隐私和安全 → 网站设置 → 更多权限 → 自动下载</p>
                <p className="mt-1"><span className="font-medium">Edge：</span>设置 → Cookie 和网站权限 → 自动下载</p>
              </div>
              <p>不想修改权限，也可以回到页面选择“打包下载 (ZIP)”，一次只下载一个压缩包。</p>
            </StepCard>
          </div>
        </div>

        <div
          className="shrink-0 px-5 pb-5 pt-4 sm:px-7 sm:pb-6"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.72)' }}
        >
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => closeWith('button')}
              className="h-10 min-w-28 rounded-md px-5 text-[14px] font-medium text-white outline-none transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 active:scale-95 focus-visible:ring-2 focus-visible:ring-[#F05A2A]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#ECEAE6]"
              style={{
                background: 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 1px rgba(0,0,0,0.2), 0 1px 3px rgba(232,67,26,0.36)',
              }}
            >
              知道了
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}
