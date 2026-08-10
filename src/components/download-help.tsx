import { lazy, Suspense, useState } from 'react'
import { analytics } from '../lib/analytics'
import { useImpression } from '../lib/useImpression'

const LazyDownloadHelpModal = lazy(() =>
  import('./download-help-modal').then((module) => ({
    default: module.DownloadHelpModal,
  })),
)

export function DownloadHelp() {
  const [open, setOpen] = useState(false)
  const [openId, setOpenId] = useState(0)
  const entryRef = useImpression<HTMLButtonElement>('download_help_entry_view')

  return (
    <>
      <button
        ref={entryRef}
        type="button"
        onClick={() => {
          analytics.track('download_help_entry_click')
          setOpenId((current) => current + 1)
          setOpen(true)
        }}
        className="group inline-flex items-center whitespace-nowrap rounded-sm py-px text-[11px] outline-none transition-colors focus-visible:outline-2"
        style={{
          color: '#6A6460',
          fontFamily: "'JetBrains Mono', monospace",
          textUnderlineOffset: '2px',
          outlineColor: 'rgba(240,90,42,0.55)',
          outlineOffset: '2px',
        }}
      >
        <span
          aria-hidden
          className="px-1.5"
          style={{ color: 'rgba(28,26,24,0.35)', userSelect: 'none' }}
        >
          ·
        </span>
        <span className="px-0.5 group-hover:underline">下载后找不到文件？</span>
      </button>

      {open && (
        <Suspense fallback={null}>
          <LazyDownloadHelpModal openId={openId} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  )
}
