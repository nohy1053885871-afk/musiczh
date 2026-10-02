import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { analytics } from '../lib/analytics'
import type { PublicFooterHoverCard } from '../lib/public-config'
import { useImpression } from '../lib/useImpression'

type RevealTrigger = 'hover' | 'focus' | 'click'

function useTouchPresentation(): boolean {
  const query = '(max-width: 639px), (hover: none), (pointer: coarse)'
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  )

  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setMatches(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return matches
}

export function FooterHoverCard({
  config,
}: {
  config: PublicFooterHoverCard
}) {
  const panelId = useId()
  const touchPresentation = useTouchPresentation()
  const impressionRef = useImpression<HTMLButtonElement>(
    'footer_hover_entry_view',
  )
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const openRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [imageFailed, setImageFailed] = useState(false)
  const [desktopMaxHeight, setDesktopMaxHeight] = useState(480)

  const setTriggerRef = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node
    impressionRef(node)
  }, [impressionRef])

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const show = useCallback((trigger: RevealTrigger) => {
    cancelClose()
    const triggerNode = triggerRef.current
    if (triggerNode) {
      setDesktopMaxHeight(Math.max(
        160,
        Math.floor(triggerNode.getBoundingClientRect().top - 24),
      ))
    }
    if (!openRef.current) {
      openRef.current = true
      setRequested(true)
      setOpen(true)
      analytics.track('footer_hover_card_view', { trigger })
    }
  }, [cancelClose])

  const hide = useCallback((delayMs = 0) => {
    cancelClose()
    const close = () => {
      openRef.current = false
      setOpen(false)
      closeTimerRef.current = null
    }
    if (delayMs > 0) closeTimerRef.current = window.setTimeout(close, delayMs)
    else close()
  }, [cancelClose])

  useEffect(() => () => cancelClose(), [cancelClose])

  useEffect(() => {
    if (!open || !touchPresentation) return
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [hide, open, touchPresentation])

  useEffect(() => {
    hide()
  }, [config.updatedAt, hide, touchPresentation])

  if (imageFailed) return null

  const image = requested ? (
    <div
      className="relative grid min-h-32 place-items-center overflow-hidden rounded-lg"
      style={{
        background: '#E4E2DC',
        boxShadow:
          'inset 0 2px 5px rgba(58,48,38,0.16), inset 0 -1px 0 rgba(255,255,255,0.8)',
      }}
    >
      {!loaded && (
        <span className="pulse-soft text-xs" style={{ color: '#8B8278' }}>
          图片加载中…
        </span>
      )}
      <img
        src={config.imageUrl}
        width={config.imageWidth}
        height={config.imageHeight}
        alt={`${config.label}图片`}
        className={`block h-auto w-full rounded-md transition-opacity duration-200 ${loaded ? 'opacity-100' : 'absolute opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          hide()
          setImageFailed(true)
        }}
      />
    </div>
  ) : null

  return (
    <div
      className="relative mb-2 inline-flex justify-center"
      onMouseLeave={() => {
        if (!touchPresentation) hide(120)
      }}
      onBlur={(event) => {
        if (
          !touchPresentation &&
          !event.currentTarget.contains(event.relatedTarget)
        ) hide(120)
      }}
    >
      <button
        ref={setTriggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        className="rounded px-2 py-1 text-[12px] font-medium underline decoration-dotted underline-offset-[3px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D94B20]/35"
        style={{ color: open ? '#9E3518' : '#766E66' }}
        onMouseEnter={() => {
          if (!touchPresentation) show('hover')
        }}
        onFocus={() => {
          if (!touchPresentation) show('focus')
        }}
        onClick={() => {
          analytics.track('footer_hover_entry_click', {
            trigger: 'click',
          })
          if (open) hide()
          else show('click')
        }}
      >
        {config.label}
      </button>

      {!touchPresentation && requested && (
        <div
          id={panelId}
          role="dialog"
          aria-label={config.label}
          aria-hidden={!open}
          className={`absolute bottom-full left-1/2 z-50 mb-3 w-[min(320px,calc(100vw-32px))] -translate-x-1/2 rounded-xl p-2.5 transition duration-200 ${open ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-1.5 opacity-0'}`}
          style={{
            background: '#F4F2EE',
            border: '1px solid rgba(255,255,255,0.78)',
            boxShadow:
              '0 16px 34px -12px rgba(48,40,32,0.38), inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(92,78,64,0.1)',
          }}
        >
          <div
            className="overflow-y-auto rounded-lg"
            style={{ maxHeight: Math.max(120, desktopMaxHeight - 20) }}
          >
            {image}
          </div>
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45"
            style={{
              background: '#F4F2EE',
              borderBottom: '1px solid rgba(92,78,64,0.12)',
              borderRight: '1px solid rgba(92,78,64,0.12)',
            }}
          />
        </div>
      )}

      {touchPresentation && open && (
        <div
          id={panelId}
          role="dialog"
          aria-modal="true"
          aria-label={config.label}
          className="fixed inset-0 z-[70] overflow-y-auto bg-black/30"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) hide()
          }}
        >
          <div
            className="flex min-h-full items-end px-3 pt-10"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) hide()
            }}
          >
            <div
              className="fade-in-up mx-auto w-full max-w-md shrink-0 rounded-t-[20px] p-3 pb-[max(16px,env(safe-area-inset-bottom))]"
              style={{
                background: '#F4F2EE',
                border: '1px solid rgba(255,255,255,0.82)',
                boxShadow:
                  '0 -14px 34px -12px rgba(48,40,32,0.45), inset 0 1px 0 rgba(255,255,255,0.9)',
              }}
            >
              <div
                className="mx-auto mb-3 h-1 w-10 rounded-full"
                style={{ background: '#C8C2BA' }}
              />
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="text-sm font-medium" style={{ color: '#3B3733' }}>
                  {config.label}
                </span>
                <button
                  type="button"
                  className="rounded-md px-2.5 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D94B20]/35"
                  style={{
                    color: '#5E5750',
                    background: '#ECEAE6',
                    boxShadow:
                      'inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 2px rgba(58,48,38,0.14)',
                  }}
                  onClick={() => hide()}
                >
                  关闭
                </button>
              </div>
              {image}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
