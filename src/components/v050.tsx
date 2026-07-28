// v0.5.0 新增 UI 模块：性能警告弹窗 / 拦截详情弹窗 / 改造横条 / 非 MP3 引导横条
// 设计稿：Claude Design hash FuYQ7RjwZi0eIzZjVndPIw (v0.5.0-spec.html)

import { useEffect, useMemo, useState } from 'react'
import { analytics } from '../lib/analytics'
import { useImpression } from '../lib/useImpression'

// ── 类型 ────────────────────────────────────────────────────────────────────
export type RejectReason = 'FORMAT_UNSUPPORTED' | 'SIZE_EXCEEDED'
export type RejectedItem = {
  fileName: string
  size: number
  reason: RejectReason
}

const REASON_LABEL: Record<RejectReason, string> = {
  FORMAT_UNSUPPORTED: '格式不支持',
  SIZE_EXCEEDED: '超过 200MB',
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

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

// ── M1：大批量性能警告弹窗（阻塞） ──────────────────────────────────────────
export function LargeBatchWarningModal({
  currentCount,
  addedCount,
  total,
  onContinue,
  onReselect,
}: {
  currentCount: number
  addedCount: number
  total: number
  onContinue: () => void
  onReselect: () => void
}) {
  // 仅 Esc / 重新选择关；点遮罩不关（阻塞式）
  useEscClose(true, onReselect)

  useEffect(() => {
    analytics.track('dialog_large_batch_view', {
      queue_size: total,
      count: addedCount,
    })
  }, [total, addedCount])

  // 注：两个按钮的曝光以「dialog_large_batch_view」整弹窗为口径，
  // 不单独埋按钮级 _view，避免孤立曝光（没有对应 _click）拉低按钮埋点页 CTR
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3"
      style={{ background: 'rgba(28,26,24,0.42)', backdropFilter: 'blur(2px)' }}
    >
      <div
        className="modal-in rounded-2xl relative w-full"
        style={{
          background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
          boxShadow:
            '0 32px 64px -16px rgba(28,26,24,0.32), 0 12px 24px -8px rgba(28,26,24,0.18), 0 0 0 1px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.95)',
          maxWidth: 440,
        }}
      >
        <div className="px-6 pt-6 pb-5 sm:px-6">
          <div className="flex items-start gap-3 mb-3">
            <div
              className="shrink-0 inline-flex items-center justify-center rounded-lg mt-0.5"
              style={{
                width: 36,
                height: 36,
                background: 'linear-gradient(180deg, #FBF0D8 0%, #F4E4B8 100%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 0 0 1px rgba(180,130,40,0.2)',
                color: '#7B5A14',
              }}
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 9v4" />
                <path d="M12 17h.01" />
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <div className="flex-1 pt-1">
              <h3
                className="text-[16px] font-medium leading-tight"
                style={{ color: '#1C1A18' }}
              >
                性能提醒
              </h3>
            </div>
          </div>

          <p
            className="text-[13px] leading-relaxed mb-4"
            style={{ color: '#1C1A18' }}
          >
            一次性处理超过 50 个音频文件，浏览器内存压力较大，可能出现卡顿或闪退，建议分批上传。
          </p>

          <div
            className="rounded-lg px-3 py-2.5 mb-5 flex items-center flex-wrap gap-x-2 gap-y-1"
            style={{
              background: 'rgba(0,0,0,0.04)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.06)',
              color: '#6A6460',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
            }}
          >
            <span>
              当前队列{' '}
              <b style={{ color: '#1C1A18', fontWeight: 500 }}>
                {currentCount}
              </b>{' '}
              个
            </span>
            <span className="opacity-50">·</span>
            <span>
              本次新增{' '}
              <b style={{ color: '#1C1A18', fontWeight: 500 }}>{addedCount}</b>{' '}
              个
            </span>
            <span className="opacity-50">·</span>
            <span>
              合计 <b style={{ color: '#B83020', fontWeight: 500 }}>{total}</b>{' '}
              个
            </span>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-2.5">
            <button
              onClick={() => {
                analytics.track('dialog_large_batch_confirm', {
                  action: 'reselect',
                  queue_size: total,
                  count: addedCount,
                })
                onReselect()
              }}
              className="w-full sm:w-auto px-4 py-2 text-[13px] rounded-md font-medium transition active:scale-[0.97] hover:-translate-y-px"
              style={{
                background: 'linear-gradient(180deg, #F8F6F2 0%, #EAE8E4 100%)',
                color: '#1C1A18',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.06)',
              }}
            >
              重新选择
            </button>
            <button
              onClick={() => {
                analytics.track('dialog_large_batch_confirm', {
                  action: 'continue',
                  queue_size: total,
                  count: addedCount,
                })
                onContinue()
              }}
              className="w-full sm:w-auto px-4 py-2 text-[13px] rounded-md font-medium text-white transition active:scale-[0.97] hover:-translate-y-px"
              style={{
                background: 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
                boxShadow:
                  'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2), 0 1px 3px rgba(232,67,26,0.35)',
              }}
            >
              仍要继续
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── M2：拦截详情弹窗（可关闭，>50 条启用分页） ──────────────────────────────
const PAGE_SIZE = 50

export function RejectDetailsModal({
  items,
  onClose,
}: {
  items: RejectedItem[]
  onClose: () => void
}) {
  const [page, setPage] = useState(1)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const needsPager = total > PAGE_SIZE
  const pageItems = useMemo(
    () =>
      needsPager
        ? items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
        : items,
    [items, page, needsPager],
  )

  useEscClose(true, onClose)

  useEffect(() => {
    analytics.track('dialog_reject_details_view', { count: total })
    // 仅在 mount 时埋一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-3"
      style={{ background: 'rgba(28,26,24,0.42)', backdropFilter: 'blur(2px)' }}
      onClick={() => {
        analytics.track('dialog_reject_details_close', { count: total })
        onClose()
      }}
    >
      <div
        className="modal-in rounded-2xl relative w-full"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
          boxShadow:
            '0 32px 64px -16px rgba(28,26,24,0.32), 0 12px 24px -8px rgba(28,26,24,0.18), 0 0 0 1px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.95)',
          maxWidth: 560,
        }}
      >
        {/* 头 */}
        <div
          className="flex items-center justify-between px-5 pt-4 pb-3"
          style={{ borderBottom: '1px solid rgba(0,0,0,0.06)' }}
        >
          <div className="flex items-baseline gap-2">
            <h3
              className="text-[15px] font-medium"
              style={{ color: '#1C1A18' }}
            >
              被跳过的文件
            </h3>
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                color: '#8A8680',
              }}
            >
              {total} 个
            </span>
          </div>
          <button
            onClick={() => {
              analytics.track('dialog_reject_details_close', { count: total })
              onClose()
            }}
            aria-label="关闭"
            className="rounded transition hover:bg-black/5 active:scale-90 inline-flex items-center justify-center"
            style={{ width: 26, height: 26, color: '#8A8680' }}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 表头 */}
        <div
          className="px-5 py-2 flex items-center gap-3 uppercase"
          style={{
            color: '#8A8680',
            background: 'rgba(0,0,0,0.025)',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 10,
            letterSpacing: '0.05em',
          }}
        >
          <span className="flex-1 min-w-0">文件名</span>
          <span className="w-20 text-right shrink-0">大小</span>
          <span className="w-24 shrink-0">拦截原因</span>
        </div>

        {/* 表体 */}
        <div className="overflow-y-auto" style={{ maxHeight: 320 }}>
          {pageItems.map((row, i) => (
            <div
              key={`${row.fileName}-${i}`}
              className="px-5 py-2.5 flex items-center gap-3 text-[12.5px]"
              style={{
                borderTop: i === 0 ? 'none' : '1px solid rgba(0,0,0,0.04)',
                color: '#1C1A18',
              }}
            >
              <span
                className="flex-1 min-w-0 truncate"
                title={row.fileName}
              >
                {row.fileName}
              </span>
              <span
                className="w-20 text-right shrink-0"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: '#8A8680',
                }}
              >
                {fmtSize(row.size)}
              </span>
              <span className="w-24 shrink-0">
                <ReasonPill reason={row.reason} />
              </span>
            </div>
          ))}
        </div>

        {/* 分页器（仅 > PAGE_SIZE） */}
        {needsPager && (
          <div
            className="px-5 py-2.5 flex items-center justify-center gap-2 overflow-x-auto"
            style={{
              borderTop: '1px solid rgba(0,0,0,0.04)',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 11,
            }}
          >
            <PagerBtn
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              ‹
            </PagerBtn>
            <span style={{ color: '#6A6460' }}>
              {page} / {totalPages}
            </span>
            <PagerBtn
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              ›
            </PagerBtn>
          </div>
        )}

        {/* 底部 */}
        <div
          className="px-5 py-3.5 flex justify-end gap-2"
          style={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}
        >
          <button
            onClick={() => {
              analytics.track('dialog_reject_details_close', { count: total })
              onClose()
            }}
            className="px-3 py-1.5 text-[12px] rounded-md font-medium transition active:scale-[0.97]"
            style={{
              background: 'linear-gradient(180deg, #F8F6F2 0%, #EAE8E4 100%)',
              color: '#1C1A18',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.06)',
            }}
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}

function ReasonPill({ reason }: { reason: RejectReason }) {
  const isFormat = reason === 'FORMAT_UNSUPPORTED'
  return (
    <span
      className="uppercase px-1.5 py-0.5 rounded inline-flex items-center"
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 10,
        background: isFormat ? 'rgba(184,48,32,0.10)' : 'rgba(123,90,20,0.10)',
        color: isFormat ? '#8C2418' : '#7B5A14',
        boxShadow: isFormat
          ? 'inset 0 0 0 1px rgba(184,48,32,0.18)'
          : 'inset 0 0 0 1px rgba(123,90,20,0.18)',
      }}
    >
      {REASON_LABEL[reason]}
    </span>
  )
}

function PagerBtn({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-0.5 rounded transition active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        background: disabled
          ? 'transparent'
          : 'linear-gradient(180deg, #F8F6F2 0%, #EAE8E4 100%)',
        color: '#1C1A18',
        boxShadow: disabled
          ? 'none'
          : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.06)',
        minWidth: 24,
      }}
    >
      {children}
    </button>
  )
}

// ── M3：改造版 WarningBanner（加「查看详情」） ─────────────────────────────
export function WarningBannerV2({
  rejected,
  onViewDetails,
  onDismiss,
}: {
  rejected: RejectedItem[]
  onViewDetails: () => void
  onDismiss: () => void
}) {
  const total = rejected.length
  const byFormat = rejected.filter(
    (x) => x.reason === 'FORMAT_UNSUPPORTED',
  ).length
  const byOversize = rejected.filter((x) => x.reason === 'SIZE_EXCEEDED').length

  const parts: string[] = []
  if (byFormat) parts.push(`格式不支持 ${byFormat} 个`)
  if (byOversize) parts.push(`超过 200MB ${byOversize} 个`)
  const reasonsText = parts.join(' / ')

  const detailsRef = useImpression<HTMLButtonElement>(
    'btn_reject_details_view',
    { count: total },
  )

  return (
    <div
      className="rounded-2xl pl-4 pr-2 py-2.5 text-[12px] flex items-center gap-3 fade-in-up"
      style={{
        background: 'linear-gradient(180deg, #FBF0D8 0%, #F4E4B8 100%)',
        color: '#7B5A14',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.5), inset 0 0 0 1px rgba(180,130,40,0.2)',
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-3.5 h-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>

      <span className="flex-1 min-w-0 truncate">
        <span className="font-medium">已跳过 {total} 个文件</span>
        {reasonsText && (
          <>
            <span className="opacity-50 mx-1.5">·</span>
            <span>{reasonsText}</span>
          </>
        )}
      </span>

      <div className="flex items-center gap-1 shrink-0">
        <button
          ref={detailsRef}
          onClick={() => {
            analytics.track('btn_reject_details_click', { count: total })
            onViewDetails()
          }}
          className="inline-flex items-center gap-1 text-[12px] font-medium rounded px-1.5 py-0.5 transition hover:bg-black/5 active:scale-[0.97]"
          style={{ color: '#7B5A14' }}
        >
          <span>查看详情</span>
          <svg
            viewBox="0 0 24 24"
            className="w-3 h-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <button
          onClick={onDismiss}
          aria-label="关闭"
          className="rounded transition hover:bg-black/5 active:scale-90 inline-flex items-center justify-center"
          style={{ width: 24, height: 24, color: '#7B5A14' }}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── M4：FLAC / OGG / M4A 一键转 MP3 引导横条 ─────────────────────────────
export function FlacBatchPromptBanner({
  flacCount,
  onConvert,
  onDismiss,
}: {
  flacCount: number
  onConvert: () => void
  onDismiss: () => void
}) {
  const bannerRef = useImpression<HTMLDivElement>('banner_flac_prompt_view', {
    count: flacCount,
  })
  const convertBtnRef = useImpression<HTMLButtonElement>(
    'btn_flac_batch_transcode_view',
    { count: flacCount },
  )

  return (
    <div
      ref={bannerRef}
      className="rounded-2xl pl-4 pr-2 py-2.5 text-[12px] flex items-center gap-3 fade-in-up"
      style={{
        background: 'linear-gradient(180deg, #EBE9E3 0%, #DFDCD4 100%)',
        color: '#3A2E20',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 0 0 1px rgba(60,46,32,0.12)',
      }}
    >
      <div
        className="shrink-0 inline-flex items-center justify-center rounded-md"
        style={{
          width: 22,
          height: 22,
          background: 'linear-gradient(180deg, #F4F2EE 0%, #E4E2DC 100%)',
          boxShadow:
            'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.08)',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          className="w-3 h-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 12h3M9 7v10M14 4v16M19 9v6" />
        </svg>
      </div>

      <span className="flex-1 min-w-0 truncate">
        <span className="font-medium">列表中有 {flacCount} 个 FLAC / OGG / M4A 文件</span>
        <span className="opacity-50 mx-1.5">·</span>
        <span>转为 MP3 兼容更广</span>
      </span>

      <div className="flex items-center gap-2 shrink-0">
        <button
          ref={convertBtnRef}
          onClick={() => {
            analytics.track('btn_flac_batch_transcode_click', {
              count: flacCount,
            })
            onConvert()
          }}
          className="px-3 py-1.5 rounded-md font-medium text-white transition active:scale-[0.97] hover:-translate-y-px"
          style={{
            fontSize: 12,
            background: 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
            boxShadow:
              'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2), 0 1px 3px rgba(232,67,26,0.35)',
          }}
        >
          一键转 MP3
        </button>
        <button
          onClick={() => {
            analytics.track('banner_flac_prompt_dismiss', { count: flacCount })
            onDismiss()
          }}
          aria-label="关闭"
          className="rounded transition hover:bg-black/5 active:scale-90 inline-flex items-center justify-center"
          style={{ width: 24, height: 24, color: '#3A2E20' }}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
