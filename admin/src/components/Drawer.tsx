import { useEffect, type ReactNode } from 'react'

export function Drawer({
  open,
  onClose,
  title,
  children,
  width = 600,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  width?: number
}) {
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(28,26,24,0.35)' }}
        onClick={onClose}
      />
      <div
        className="absolute right-0 top-0 h-full overflow-auto"
        style={{
          width,
          maxWidth: '90vw',
          background: '#F4F2EE',
          boxShadow: '-12px 0 32px -8px rgba(0,0,0,0.2)',
        }}
      >
        <div className="px-5 py-4 sticky top-0 z-10" style={{ background: '#F4F2EE', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{title}</div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5"
              aria-label="关闭"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
