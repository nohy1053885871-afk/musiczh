import { useCallback, useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
  decryptAudioFile,
  DecryptError,
  SUPPORTED_EXT_REGEX,
  type DecryptResult,
  type DecryptErrorCode,
} from './lib/decrypt'
import { transcodeToMp3 } from './lib/transcode'
import { sniffRealFormat } from './lib/sniff'
import { stripFileExtensions } from './lib/filename'
import { analytics } from './lib/analytics'

function fileExtOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// 给元素绑定曝光埋点：元素挂载且进入视口 >=50%、停留 >=300ms 时触发一次 *_view
// callback ref：旧版用 useRef + useEffect([event])，但 FileRow 内按钮随 status 切换才挂载，
// effect 首跑时 ref.current 还是 null，且 deps 不含 ref，observer 永远绑不上。
// 改用 callback ref + useState 触发 effect 重跑：node 从 null 变成 DOM 元素时重绑。
function useImpression<T extends HTMLElement>(event: string, props?: Record<string, unknown>) {
  const [node, setNode] = useState<T | null>(null)
  useEffect(() => {
    if (!node) return
    return analytics.observeImpression(node, event, props)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node, event])
  return setNode
}

const MAX_FILES = 50
const MAX_FILE_SIZE = 200 * 1024 * 1024

type FileStatus = 'pending' | 'decrypting' | 'done' | 'failed' | 'transcoding'

type TrackedFile = {
  id: string
  file: File
  status: FileStatus
  progress: number
  result?: DecryptResult
  coverUrl?: string
  errorCode?: DecryptErrorCode
  errorMessage?: string
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function todayStamp() {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function dedupeName(name: string, used: Set<string>): string {
  if (!used.has(name)) { used.add(name); return name }
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 2
  while (used.has(`${base} (${i})${ext}`)) i++
  const final = `${base} (${i})${ext}`
  used.add(final)
  return final
}

// ── VinylRecord ────────────────────────────────────────────────────────────
function VinylRecord({
  spinning,
  size = 340,
  currentCoverUrl,
  currentTitle,
}: {
  spinning: boolean
  size?: number
  currentCoverUrl: string | null
  currentTitle: string
}) {
  const labelBg = 'radial-gradient(circle at 35% 30%, #D42B10, #8A1A08 95%)'
  const labelShadow =
    'inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -3px 8px rgba(0,0,0,0.35), 0 0 0 2px rgba(0,0,0,0.5)'

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {/* drop shadow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle at 50% 55%, rgba(0,0,0,0.18), rgba(0,0,0,0) 65%)',
          filter: 'blur(8px)',
          transform: 'translateY(8px) scale(0.96)',
        }}
      />
      {/* disc */}
      <div
        className={`absolute inset-0 rounded-full ${spinning ? 'vinyl-spin' : ''}`}
        style={{
          background:
            'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 28%), radial-gradient(circle at 50% 50%, #1a1a1a 0%, #0a0a0a 100%)',
          boxShadow:
            'inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 -10px 30px rgba(0,0,0,0.6), 0 14px 30px -10px rgba(0,0,0,0.45), 0 2px 0 rgba(255,255,255,0.08)',
        }}
      >
        {/* groove rings */}
        <svg
          viewBox="0 0 200 200"
          className="absolute inset-0 w-full h-full"
          aria-hidden
        >
          <defs>
            <radialGradient id="grooveSheen" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(255,255,255,0)" />
              <stop offset="48%" stopColor="rgba(255,255,255,0.04)" />
              <stop offset="50%" stopColor="rgba(255,255,255,0.10)" />
              <stop offset="52%" stopColor="rgba(255,255,255,0.04)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0)" />
            </radialGradient>
          </defs>
          {Array.from({ length: 32 }).map((_, i) => (
            <circle
              key={i}
              cx="100"
              cy="100"
              r={38 + i * 1.6}
              fill="none"
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="0.3"
            />
          ))}
          <circle cx="100" cy="100" r="92" fill="url(#grooveSheen)" />
        </svg>

        {/* center label */}
        {currentCoverUrl ? (
          <div
            className="absolute rounded-full overflow-hidden"
            style={{ inset: '32%', background: labelBg, boxShadow: labelShadow }}
          >
            <img
              src={currentCoverUrl}
              alt={currentTitle}
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full z-10"
              style={{
                width: size * 0.05,
                height: size * 0.05,
                background: '#0a0a0a',
                boxShadow:
                  'inset 0 1px 2px rgba(255,255,255,0.4), 0 0 0 1px rgba(0,0,0,0.6)',
              }}
            />
          </div>
        ) : (
          <div
            className="absolute rounded-full flex items-center justify-center"
            style={{ inset: '32%', background: labelBg, boxShadow: labelShadow }}
          >
            <div className="text-center" style={{ color: '#F4E0D8' }}>
              <div
                className="leading-none"
                style={{
                  fontSize: size * 0.085,
                  fontFamily: "'Noto Serif SC', serif",
                  fontWeight: 600,
                }}
              >
                拾音
              </div>
              <div
                className="mt-1.5 uppercase opacity-70"
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: size * 0.022,
                  letterSpacing: '0.3em',
                }}
              >
                music_X → mp3
              </div>
              <div
                className="mt-2 mx-auto rounded-full"
                style={{
                  width: size * 0.05,
                  height: size * 0.05,
                  background: '#0a0a0a',
                  boxShadow:
                    'inset 0 1px 2px rgba(255,255,255,0.4), 0 0 0 1px rgba(0,0,0,0.6)',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── DropZone ───────────────────────────────────────────────────────────────
function DropZone({
  onFiles,
  isDragging,
  setIsDragging,
  queueLeft,
}: {
  onFiles: (files: FileList | File[]) => void
  isDragging: boolean
  setIsDragging: (v: boolean) => void
  queueLeft: number
}) {
  const embossedShadow =
    'inset 0 2px 6px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.06)'
  const dragShadow =
    'inset 0 2px 8px rgba(232,67,26,0.15), inset 0 0 0 2px rgba(232,67,26,0.4), 0 0 0 6px rgba(232,67,26,0.1)'

  const labelRef = useImpression<HTMLLabelElement>('upload_zone_view')

  return (
    <label
      ref={labelRef}
      onClick={() => {
        analytics.track('upload_zone_click')
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragging(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        setIsDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        if (e.dataTransfer.files?.length) {
          const arr = Array.from(e.dataTransfer.files)
          analytics.track('upload_drop', {
            count: arr.length,
            total_size: arr.reduce((s, f) => s + f.size, 0),
          })
          onFiles(e.dataTransfer.files)
        }
      }}
      className="relative rounded-2xl cursor-pointer transition-all duration-300 select-none group flex flex-col items-center justify-center w-full"
      style={{
        background: isDragging
          ? 'linear-gradient(180deg, #E2E0DA 0%, #DAD8D2 100%)'
          : 'linear-gradient(180deg, #ECEAE6 0%, #E4E2DC 100%)',
        boxShadow: isDragging ? dragShadow : embossedShadow,
        padding: '40px 28px',
        minHeight: '260px',
      }}
    >
      <input
        type="file"
        multiple
        accept=".ncm,.kgm,.vpr,.flac"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            analytics.track('upload_pick', { count: e.target.files.length })
            onFiles(e.target.files)
          }
          e.target.value = ''
        }}
      />
      <div className="flex flex-col items-center justify-center text-center gap-3.5">
        <div
          className="w-14 h-14 rounded-lg flex items-center justify-center transition-transform group-hover:-translate-y-0.5"
          style={{
            background: isDragging
              ? 'linear-gradient(180deg, #E8431A 0%, #C4310E 100%)'
              : 'linear-gradient(180deg, #F8F6F2 0%, #EAE8E4 100%)',
            boxShadow: isDragging
              ? 'inset 0 1px 0 rgba(255,255,255,0.3), inset 0 -2px 4px rgba(0,0,0,0.2), 0 4px 12px rgba(232,67,26,0.35)'
              : 'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -2px 4px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          {/* upload arrow */}
          <svg
            viewBox="0 0 24 24"
            className="w-7 h-7"
            fill="none"
            stroke={isDragging ? '#FFF' : '#1C1A18'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 16V4" />
            <path d="M6 10l6-6 6 6" />
            <path d="M4 20h16" />
          </svg>
        </div>
        <div>
          <div
            className="text-lg sm:text-xl font-medium mb-0.5"
            style={{ color: '#1C1A18' }}
          >
            {isDragging
              ? '松手即可开始转换'
              : '把音频文件拖到这里或点击上传，转为 MP3'}
          </div>
          <div
            className="text-[12px]"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: '#8A8680',
            }}
          >
            支持多文件 · 单个最大 200MB ·{' '}
            {queueLeft === MAX_FILES ? '每次最多 50 个' : `还可上传 ${queueLeft} 个`}
          </div>
        </div>
      </div>
    </label>
  )
}

// ── FileRow ────────────────────────────────────────────────────────────────
function FileRow({
  file,
  onRetry,
  onRemove,
  onNotify,
  onTranscode,
}: {
  file: TrackedFile
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onNotify: (msg: string) => void
  onTranscode: (id: string) => void
}) {
  const meta = file.result?.meta
  const title = meta?.musicName || file.file.name.replace(SUPPORTED_EXT_REGEX, '')
  const artist = meta?.artist?.map((a) => a[0]).join(', ')
  const isFailed = file.status === 'failed'
  const isDecrypting = file.status === 'decrypting'
  const isTranscoding = file.status === 'transcoding'
  const isDone = file.status === 'done'
  const format = file.result?.format
  const canTranscode = isDone && format && format !== 'mp3'
  const [justDownloaded, setJustDownloaded] = useState(false)

  useEffect(() => {
    if (!justDownloaded) return
    const t = setTimeout(() => setJustDownloaded(false), 1500)
    return () => clearTimeout(t)
  }, [justDownloaded])

  const transcodeBtnRef = useImpression<HTMLButtonElement>('btn_transcode_view')
  const downloadBtnRef = useImpression<HTMLButtonElement>('row_download_view')
  const retryBtnRef = useImpression<HTMLButtonElement>('row_retry_view')
  const removeBtnRef = useImpression<HTMLButtonElement>('row_remove_view')

  return (
    <div
      className="px-4 py-3 rounded-xl flex items-center gap-3 sm:gap-4 transition-all"
      style={{
        background: isDone
          ? 'linear-gradient(180deg, #F0EEE9 0%, #E8E6E0 100%)'
          : isFailed
            ? 'linear-gradient(180deg, #F4EEEC 0%, #EBE4E2 100%)'
            : 'linear-gradient(180deg, #F8F6F2 0%, #F0EEE9 100%)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 0 rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.07)',
      }}
    >
      {/* cover / placeholder / mini disc */}
      <div className="relative shrink-0">
        {isDone && file.coverUrl ? (
          <img
            src={file.coverUrl}
            alt=""
            className="w-12 h-12 rounded object-cover"
            style={{
              boxShadow:
                'inset 0 0 0 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.15)',
            }}
          />
        ) : isDone ? (
          // 完成态但没拿到封面（如 KGM/VPR）：用音符占位，外形和封面一致
          <div
            className="w-12 h-12 rounded flex items-center justify-center"
            style={{
              background: 'linear-gradient(180deg, #ECEAE6 0%, #DDDAD3 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.08)',
            }}
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6"
              fill="none"
              stroke="#1C1A18"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 17V5l12-2v12" />
              <circle cx="6" cy="17" r="3" />
              <circle cx="18" cy="15" r="3" />
            </svg>
          </div>
        ) : (
          <div
            className={`w-12 h-12 rounded-full relative ${isDecrypting || isTranscoding ? 'vinyl-spin-fast' : ''}`}
            style={{
              background: 'radial-gradient(circle at 35% 30%, #2a2a2a, #0a0a0a 80%)',
              boxShadow:
                'inset 0 -2px 4px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.2)',
            }}
          >
            <div
              className="absolute rounded-full"
              style={{
                inset: '28%',
                background: isFailed
                  ? 'radial-gradient(circle at 35% 30%, #B85A4A, #6B2A22)'
                  : 'radial-gradient(circle at 35% 30%, #D42B10, #8A1A08)',
              }}
            />
            <div
              className="absolute rounded-full"
              style={{ inset: '44%', background: '#0a0a0a' }}
            />
          </div>
        )}
      </div>

      {/* title + meta */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <div
            className="text-[14px] font-medium truncate"
            style={{ color: '#1C1A18' }}
          >
            {title}
          </div>
          {format && (
            <span
              className="text-[10px] uppercase px-1.5 py-0.5 rounded shrink-0"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                background: 'rgba(232,67,26,0.10)',
                color: '#C4310E',
              }}
            >
              {format}
            </span>
          )}
        </div>
        {isDecrypting || isTranscoding ? (
          <div className="mt-1.5 flex items-center gap-2">
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{
                background: 'rgba(0,0,0,0.08)',
                boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.1)',
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{
                  width: `${file.progress * 100}%`,
                  background: 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                }}
              />
            </div>
            <span
              className="text-[11px] shrink-0 w-14 text-right"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: '#8A8680',
              }}
            >
              {isTranscoding && '转码 '}
              {Math.round(file.progress * 100)}%
            </span>
          </div>
        ) : isFailed ? (
          <div
            className="mt-0.5 text-[11px] truncate"
            style={{ color: '#B83020' }}
          >
            {file.errorMessage || '解析失败'}
          </div>
        ) : (
          <div
            className="mt-0.5 flex items-center gap-1.5 text-[11px] truncate"
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              color: '#8A8680',
            }}
          >
            {artist && (
              <span className="truncate" style={{ color: '#8A8680' }}>
                {artist}
              </span>
            )}
            {artist && <span style={{ color: 'rgba(28,26,24,0.2)' }}>·</span>}
            <span>{formatSize(file.file.size)}</span>
            {file.status === 'pending' && (
              <>
                <span style={{ color: 'rgba(28,26,24,0.2)' }}>·</span>
                <span style={{ color: '#A0988E' }}>排队中</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* actions */}
      <div className="shrink-0 flex items-center gap-1.5">
        {canTranscode && (
          <button
            ref={transcodeBtnRef}
            onClick={(e) => {
              e.stopPropagation()
              analytics.track('btn_transcode_click', {
                file_name: file.file.name,
                file_ext: fileExtOf(file.file.name),
                file_size: file.file.size,
                format,
              })
              onTranscode(file.id)
            }}
            className="px-3 py-1.5 rounded-md text-xs font-medium transition-all hover:-translate-y-0.5 active:translate-y-0"
            style={{
              color: '#1C1A18',
              background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.1)',
            }}
            title={`将当前 ${format} 强制转码为 MP3（有损）`}
          >
            转 MP3
          </button>
        )}
        {isDone && file.result && (
          <button
            ref={downloadBtnRef}
            onClick={(e) => {
              e.stopPropagation()
              analytics.track('row_download_click', {
                file_name: file.result!.suggestedName,
                format: file.result!.format,
                file_size: file.result!.audio.size,
              })
              try {
                triggerDownload(file.result!.audio, file.result!.suggestedName)
                analytics.track('download_done', {
                  file_name: file.result!.suggestedName,
                  file_ext: file.result!.format,
                  file_size: file.result!.audio.size,
                  download_kind: 'single',
                })
                onNotify('已开始下载')
                setJustDownloaded(true)
              } catch (err) {
                const msg = err instanceof Error ? err.message : '下载失败'
                analytics.trackFailure('download', {
                  error_code: 'DOWNLOAD_FAILED',
                  error_msg: msg,
                  error_stack: err instanceof Error ? err.stack : undefined,
                  file_name: file.result!.suggestedName,
                  file_ext: file.result!.format,
                  file_size: file.result!.audio.size,
                  download_kind: 'single',
                })
                onNotify('下载失败')
              }
            }}
            className="px-3 py-1.5 rounded-md text-xs font-medium text-white transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
            style={{
              background: justDownloaded
                ? 'linear-gradient(180deg, #3A9B5C 0%, #236B3A 100%)'
                : 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
              boxShadow: justDownloaded
                ? 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2), 0 1px 3px rgba(58,107,74,0.4)'
                : 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.2), 0 1px 3px rgba(232,67,26,0.35)',
            }}
          >
            <span className="inline-flex items-center gap-1">
              {justDownloaded ? (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                  已下载
                </>
              ) : (
                <>
                  <svg
                    viewBox="0 0 24 24"
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 4v12" />
                    <path d="M6 10l6 6 6-6" />
                    <path d="M4 20h16" />
                  </svg>
                  下载
                </>
              )}
            </span>
          </button>
        )}
        {isFailed && (
          <button
            ref={retryBtnRef}
            onClick={(e) => {
              e.stopPropagation()
              analytics.track('row_retry_click', {
                file_name: file.file.name,
                error_code: file.errorCode,
              })
              onRetry(file.id)
            }}
            className="px-3 py-1.5 rounded-md text-xs font-medium"
            style={{
              color: '#B83020',
              background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            重试
          </button>
        )}
        <button
          ref={removeBtnRef}
          onClick={(e) => {
            e.stopPropagation()
            analytics.track('row_remove_click', {
              file_name: file.file.name,
              status: file.status,
            })
            onRemove(file.id)
          }}
          className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
          style={{ color: '#A0988E' }}
          aria-label="移除"
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
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── ClearAllButton ─────────────────────────────────────────────────────────
function ClearAllButton({ onConfirm }: { onConfirm: () => void }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => setOpen(false), 4000)
    return () => clearTimeout(t)
  }, [open])

  const clearAllRef = useImpression<HTMLButtonElement>('btn_clear_all_view')

  return (
    <div className="relative">
      <button
        ref={clearAllRef}
        onClick={() => {
          analytics.track('btn_clear_all_click')
          setOpen(true)
        }}
        className="px-3 py-1.5 rounded-md text-xs font-medium transition"
        style={{ color: '#8A8680' }}
      >
        全部清空
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-20 mt-2 w-48 rounded-xl p-3"
            style={{
              background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
              boxShadow:
                '0 12px 32px -8px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)',
            }}
          >
            <div className="text-xs" style={{ color: '#1C1A18' }}>
              确认清空所有文件？
            </div>
            <div className="mt-2.5 flex justify-end gap-3">
              <button
                onClick={() => {
                  analytics.track('dialog_clear_confirm', { action: 'cancel' })
                  setOpen(false)
                }}
                className="text-xs"
                style={{ color: '#8A8680' }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  analytics.track('dialog_clear_confirm', { action: 'confirm' })
                  onConfirm()
                  setOpen(false)
                }}
                className="text-xs font-medium"
                style={{ color: '#B83020' }}
              >
                清空
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────
function App() {
  const [files, setFiles] = useState<TrackedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isZipping, setIsZipping] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)
  const [warning, setWarning] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const notify = useCallback((msg: string) => setToast(msg), [])

  const filesRef = useRef(files)
  filesRef.current = files
  const isProcessingRef = useRef(false)

  const updateFile = useCallback(
    (id: string, patch: Partial<TrackedFile>) => {
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
    },
    [],
  )

  // override 参数：调用方直接传入待转码的 result，避免依赖 filesRef.current（React state 未 commit 时是 stale 的）
  // 原始 flac 上传走 override 路径——processQueue 同步调用，filesRef 还是 pending 状态读不到 result
  const transcodeFile = useCallback(
    async (id: string, override?: DecryptResult) => {
      const target = filesRef.current.find((f) => f.id === id)
      if (!target) return
      const result = override ?? target.result
      if (!result) return
      if (result.format === 'mp3') return
      // 仅手动按钮路径（无 override）需要 status === 'done' 校验；override 路径由 caller 保证状态
      if (!override && target.status !== 'done') return
      updateFile(id, { status: 'transcoding', progress: 0 })
      const fromFormat = result.format
      analytics.track('transcode_start', {
        file_id: id,
        file_name: result.suggestedName,
        from_format: fromFormat,
        file_size: result.audio.size,
      })
      // register inflight：若用户在转码过程中关页（auto-FLAC 大文件易触发 Safari OOM）
      // pagehide 会发 transcode_abandon，含最近一次 progress；本次的核心定位手段
      analytics.registerInflight(id, 'transcode', {
        file_name: result.suggestedName,
        file_ext: fromFormat,
        file_size: result.audio.size,
        from_format: fromFormat,
      })
      try {
        const mp3Blob = await transcodeToMp3(result.audio, (p) => {
          updateFile(id, { progress: p })
          // 心跳：跨越 0.1 / 0.3 / 0.5 / 0.7 / 0.9 时各 emit 一次 transcode_progress
          // SDK 内部自带 bucket 去重，安全调用
          analytics.trackTranscodeProgress(id, p, {
            file_name: result.suggestedName,
            file_ext: fromFormat,
            file_size: result.audio.size,
            from_format: fromFormat,
          })
        })
        const newName = result.suggestedName.replace(
          /\.(flac|ogg)$/i,
          '.mp3',
        )
        updateFile(id, {
          status: 'done',
          progress: 1,
          result: {
            ...result,
            audio: mp3Blob,
            format: 'mp3',
            suggestedName: newName,
          },
        })
        analytics.track('transcode_done', {
          file_id: id,
          file_name: newName,
          file_ext: fromFormat,
          file_size: result.audio.size,
          source: result.meta?.source,
          from_format: fromFormat,
        })
        analytics.unregisterInflight(id)
        notify('已转为 MP3')
      } catch (err) {
        let message = '转码失败'
        if (err instanceof DecryptError) message = err.message
        else if (err instanceof Error) message = `转码失败：${err.message}`
        // 失败时保留 source result（原始 flac 上传失败时让用户至少能下载原 .flac 兜底）
        updateFile(id, {
          status: 'done',
          progress: 1,
          result,
        })
        analytics.trackFailure('transcode', {
          error_code: err instanceof DecryptError ? err.code : undefined,
          error_msg: message,
          error_stack: err instanceof Error ? err.stack : undefined,
          file_id: id,
          file_name: result.suggestedName,
          file_ext: fromFormat,
          file_size: result.audio.size,
          source: result.meta?.source,
        })
        analytics.unregisterInflight(id)
        setWarning(message)
      }
    },
    [updateFile, notify],
  )

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    try {
      while (true) {
        const next = filesRef.current.find((f) => f.status === 'pending')
        if (!next) break
        const fileExt = fileExtOf(next.file.name)

        // 嗅探真实格式：以文件头 magic 为权威，覆盖用户瞎改的扩展名
        // 例：「xxx.kgm.flac」内容是真 KGM v2 → realFormat='kgm' → 自动走解密路径
        const realFormat = await sniffRealFormat(next.file)

        // 文件名里若带 xxx.kgm.flac / xxx (1).flac 之类的脏后缀链，剥成纯 base 再拼真实格式
        const cleanBase = stripFileExtensions(next.file.name)

        // 1) 原始 FLAC / OGG → 自动转码到 MP3
        if (realFormat === 'flac' || realFormat === 'ogg') {
          await transcodeFile(next.id, {
            audio: next.file,
            format: realFormat,
            meta: {},
            cover: null,
            suggestedName: `${cleanBase}.${realFormat}`,
          })
          continue
        }

        // 2) 已经是 MP3 → 直接 done（用户可能误传，给个友好兜底）
        if (realFormat === 'mp3') {
          updateFile(next.id, {
            status: 'done',
            progress: 1,
            result: {
              audio: next.file,
              format: 'mp3',
              meta: {},
              cover: null,
              suggestedName: `${cleanBase}.mp3`,
            },
          })
          continue
        }

        // 3) KGG / KGM v4：本工具不支持（联网密钥协议），给精准错误
        if (realFormat === 'kgg_or_kgmv4') {
          const code: DecryptErrorCode = 'KGM_V4_UNSUPPORTED'
          const message = '这可能是酷狗新版加密格式（v4），本工具暂不支持'
          updateFile(next.id, {
            status: 'failed',
            errorCode: code,
            errorMessage: message,
          })
          analytics.trackFailure('decrypt', {
            error_code: code,
            error_msg: message,
            file_id: next.id,
            file_name: next.file.name,
            file_ext: fileExt,
            file_size: next.file.size,
          })
          continue
        }

        // 4) 完全不识别 → 上传准入已经放行（因为后缀是 .flac/.ncm/.kgm 等），
        // 但内容头不匹配，给精准错误
        if (
          realFormat !== 'ncm' &&
          realFormat !== 'kgm' &&
          realFormat !== 'vpr'
        ) {
          const code: DecryptErrorCode = 'INVALID_HEADER'
          const message =
            '无法识别这个文件，请确认是网易云 .ncm / 酷狗 .kgm / .vpr 或原始 .flac / .ogg / .mp3'
          updateFile(next.id, {
            status: 'failed',
            errorCode: code,
            errorMessage: message,
          })
          analytics.trackFailure('decrypt', {
            error_code: code,
            error_msg: message,
            file_id: next.id,
            file_name: next.file.name,
            file_ext: fileExt,
            file_size: next.file.size,
          })
          continue
        }

        // 5) NCM / KGM / VPR：正常解密路径（按 sniff 真实格式分发，绕过扩展名）
        updateFile(next.id, { status: 'decrypting', progress: 0 })
        analytics.track('decrypt_start', {
          file_id: next.id,
          file_name: next.file.name,
          file_ext: fileExt,
          file_size: next.file.size,
        })
        // register inflight：若用户在解密过程中关页，pagehide 会发 decrypt_abandon
        analytics.registerInflight(next.id, 'decrypt', {
          file_name: next.file.name,
          file_ext: fileExt,
          file_size: next.file.size,
        })
        try {
          const result = await decryptAudioFile(
            next.file,
            (p) => updateFile(next.id, { progress: p }),
            realFormat,
          )
          const coverUrl = result.cover
            ? URL.createObjectURL(result.cover)
            : result.meta.albumPic || undefined
          updateFile(next.id, { status: 'done', result, coverUrl, progress: 1 })
          analytics.track('decrypt_done', {
            file_id: next.id,
            file_name: next.file.name,
            file_ext: fileExt,
            file_size: next.file.size,
            source: result.meta?.source,
            format: result.format,
          })
          analytics.unregisterInflight(next.id)
        } catch (err) {
          let code: DecryptErrorCode = 'UNKNOWN'
          let message = '未知错误'
          if (err instanceof DecryptError) {
            code = err.code
            message = err.message
          } else if (err instanceof Error) {
            message = `出错了：${err.message}`
          }
          updateFile(next.id, { status: 'failed', errorCode: code, errorMessage: message })
          analytics.trackFailure('decrypt', {
            error_code: code,
            error_msg: message,
            error_stack: err instanceof Error ? err.stack : undefined,
            file_id: next.id,
            file_name: next.file.name,
            file_ext: fileExt,
            file_size: next.file.size,
            source: realFormat,
          })
          analytics.unregisterInflight(next.id)
        }
      }
    } finally {
      isProcessingRef.current = false
    }
  }, [updateFile, transcodeFile])

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const reasons: string[] = []
      let candidates = Array.from(incoming)

      const trackReject = (f: File, reject_reason: 'FORMAT_UNSUPPORTED' | 'SIZE_EXCEEDED' | 'QUEUE_FULL') => {
        analytics.track('upload_reject', {
          file_name: f.name,
          file_ext: fileExtOf(f.name),
          file_size: f.size,
          reject_reason,
        })
      }

      const wrongExt = candidates.filter((f) => !SUPPORTED_EXT_REGEX.test(f.name))
      if (wrongExt.length) reasons.push(`${wrongExt.length} 个文件格式不支持`)
      wrongExt.forEach((f) => trackReject(f, 'FORMAT_UNSUPPORTED'))
      candidates = candidates.filter((f) => SUPPORTED_EXT_REGEX.test(f.name))

      const oversize = candidates.filter((f) => f.size > MAX_FILE_SIZE)
      if (oversize.length) reasons.push(`${oversize.length} 个文件超过 200MB`)
      oversize.forEach((f) => trackReject(f, 'SIZE_EXCEEDED'))
      candidates = candidates.filter((f) => f.size <= MAX_FILE_SIZE)

      const currentCount = filesRef.current.length
      const remaining = MAX_FILES - currentCount
      let hitLimit = false
      if (candidates.length > remaining) {
        hitLimit = true
        reasons.push(`${candidates.length - remaining} 个文件超过 50 个上限`)
        const dropped = candidates.slice(Math.max(0, remaining))
        dropped.forEach((f) => trackReject(f, 'QUEUE_FULL'))
        candidates = candidates.slice(0, Math.max(0, remaining))
      }
      if (reasons.length) {
        const suffix = hitLimit ? '，请下载并清空当前列表后继续' : ''
        setWarning(`已跳过：${reasons.join('；')}${suffix}`)
      } else setWarning(null)
      if (candidates.length === 0) return

      const list: TrackedFile[] = candidates.map((f) => ({
        // file_id 用 UUID v4，全程透传埋点；同时复用为 React key 和 state 索引
        id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `f-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        file: f,
        status: 'pending' as FileStatus,
        progress: 0,
      }))
      list.forEach((tf) => {
        analytics.track('upload_attempt', {
          file_id: tf.id,
          file_name: tf.file.name,
          file_ext: fileExtOf(tf.file.name),
          file_size: tf.file.size,
        })
      })
      // 新批次插到列表最前，processQueue 会先处理最新意图，符合用户认知
      setFiles((prev) => [...list, ...prev])
      setTimeout(() => processQueue(), 0)
    },
    [processQueue],
  )

  // warning 不自动消失，由用户点关闭按钮（×）手动关；toast 仍 2s 自动消失
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  const retryFile = useCallback(
    (id: string) => {
      updateFile(id, {
        status: 'pending',
        progress: 0,
        errorCode: undefined,
        errorMessage: undefined,
      })
      setTimeout(() => processQueue(), 0)
    },
    [updateFile, processQueue],
  )

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id)
      if (target?.coverUrl) URL.revokeObjectURL(target.coverUrl)
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => {
        if (f.coverUrl) URL.revokeObjectURL(f.coverUrl)
      })
    }
  }, [])

  const doneCount = files.filter((f) => f.status === 'done').length
  const failedCount = files.filter((f) => f.status === 'failed').length
  const total = files.length
  const overallProgress = total === 0 ? 0 : (doneCount + failedCount) / total
  const allDone = total > 0 && doneCount + failedCount === total

  const downloadAllRef = useImpression<HTMLButtonElement>('btn_download_all_view')
  const downloadZipRef = useImpression<HTMLButtonElement>('btn_download_zip_view')

  const downloadAllSeparate = async () => {
    const doneFiles = files.filter((f) => f.status === 'done' && f.result)
    if (doneFiles.length === 0) return
    notify(`已开始下载 ${doneFiles.length} 首`)
    for (const f of doneFiles) {
      try {
        triggerDownload(f.result!.audio, f.result!.suggestedName)
        analytics.track('download_done', {
          file_name: f.result!.suggestedName,
          file_ext: f.result!.format,
          file_size: f.result!.audio.size,
          download_kind: 'all_separate',
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : '下载失败'
        analytics.trackFailure('download', {
          error_code: 'DOWNLOAD_FAILED',
          error_msg: msg,
          error_stack: err instanceof Error ? err.stack : undefined,
          file_name: f.result!.suggestedName,
          file_ext: f.result!.format,
          file_size: f.result!.audio.size,
          download_kind: 'all_separate',
        })
      }
      await new Promise((r) => setTimeout(r, 150))
    }
  }

  const downloadAllAsZip = async () => {
    const doneFiles = files.filter((f) => f.status === 'done' && f.result)
    if (doneFiles.length === 0) return
    setIsZipping(true)
    setZipProgress(0)
    try {
      const zip = new JSZip()
      const used = new Set<string>()
      for (const f of doneFiles) {
        const name = dedupeName(f.result!.suggestedName, used)
        zip.file(name, await f.result!.audio.arrayBuffer())
      }
      const blob = await zip.generateAsync(
        { type: 'blob', compression: 'STORE' },
        (m) => setZipProgress(m.percent / 100),
      )
      triggerDownload(blob, `音乐转换_${doneFiles.length}首_${todayStamp()}.zip`)
      // ZIP 整批成功：按文件数批量发 download_done
      for (const f of doneFiles) {
        analytics.track('download_done', {
          file_name: f.result!.suggestedName,
          file_ext: f.result!.format,
          file_size: f.result!.audio.size,
          download_kind: 'zip',
        })
      }
      notify('ZIP 已开始下载')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ZIP 打包失败'
      analytics.trackFailure('download', {
        error_code: 'ZIP_FAILED',
        error_msg: msg,
        error_stack: err instanceof Error ? err.stack : undefined,
        file_size: doneFiles.reduce((sum, f) => sum + f.result!.audio.size, 0),
        download_kind: 'zip',
      })
      setWarning(msg)
    } finally {
      setIsZipping(false)
      setZipProgress(0)
    }
  }

  const handleClearAll = () => {
    files.forEach((f) => {
      if (f.coverUrl) URL.revokeObjectURL(f.coverUrl)
    })
    setFiles([])
  }

  const anyDecrypting = files.some((f) => f.status === 'decrypting')
  const showVinylSpin = anyDecrypting || isDragging
  const queueLeft = MAX_FILES - files.length
  const currentlyDecrypting = files.find((f) => f.status === 'decrypting')
  const currentCoverUrl = currentlyDecrypting?.coverUrl ?? null
  const currentTitle = currentlyDecrypting?.result?.meta?.musicName ?? ''

  const secondaryBtnStyle = {
    color: '#1C1A18',
    background: 'linear-gradient(180deg, #F4F2EE 0%, #EAE8E4 100%)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.9), inset 0 -1px 1px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.1)',
  }

  return (
    <div
      className="min-h-screen w-full"
      style={{
        background:
          'radial-gradient(ellipse 140% 100% at 50% -10%, #F0EEE9 0%, #ECEAE6 40%, #E4E2DC 100%)',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* paper noise texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.35]"
        aria-hidden
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' seed='3'/><feColorMatrix values='0 0 0 0 0.30 0 0 0 0 0.28 0 0 0 0 0.26 0 0 0 0.035 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
        }}
      />

      {/* Header: 全宽深色横幅 */}
      <div className="relative w-full" style={{ background: '#1C1A18' }}>
        <div className="max-w-5xl mx-auto px-5 sm:px-8">
          <header className="flex items-center justify-between gap-4 py-3.5">
            <div className="flex items-center gap-3">
              {/* mini vinyl logo */}
              <div className="relative w-10 h-10 shrink-0">
                <div
                  className="absolute inset-0 rounded-full"
                  style={{
                    background: 'radial-gradient(circle at 35% 30%, #2a2a2a, #0a0a0a 80%)',
                    boxShadow:
                      'inset 0 -1px 2px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.15)',
                  }}
                />
                <div
                  className="absolute rounded-full"
                  style={{
                    inset: '28%',
                    background: 'radial-gradient(circle at 35% 30%, #D42B10, #8A1A08)',
                  }}
                />
                <div
                  className="absolute rounded-full"
                  style={{ inset: '44%', background: '#1C1A18' }}
                />
              </div>
              <div className="min-w-0">
                <div
                  className="text-[18px] font-semibold tracking-tight leading-tight"
                  style={{ fontFamily: "'Noto Serif SC', serif", color: '#F4F2EE' }}
                >
                  拾音
                </div>
                <div className="text-[12px] leading-snug" style={{ color: '#8A8680' }}>
                  打破音频格式壁垒 ·{' '}
                  <span style={{ color: 'rgba(138,134,128,0.85)' }}>
                    永无广告 · 永久免费
                  </span>
                </div>
              </div>
            </div>
            <div
              className="text-[11px] shrink-0"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: '#6A6460',
              }}
            >
              v{import.meta.env.VITE_APP_VERSION ?? 'dev'}
            </div>
          </header>
        </div>
      </div>

      <div className="relative max-w-5xl mx-auto px-5 sm:px-8 pt-8 pb-16">
        {/* Hero: vinyl left, drop zone right */}
        <section className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-8 sm:gap-12 items-stretch mb-8 sm:mb-12">
          <div className="flex justify-center md:justify-start items-center">
            <div className="block sm:hidden">
              <VinylRecord
                spinning={showVinylSpin}
                size={220}
                currentCoverUrl={currentCoverUrl}
                currentTitle={currentTitle}
              />
            </div>
            <div className="hidden sm:block md:hidden">
              <VinylRecord
                spinning={showVinylSpin}
                size={300}
                currentCoverUrl={currentCoverUrl}
                currentTitle={currentTitle}
              />
            </div>
            <div className="hidden md:block">
              <VinylRecord
                spinning={showVinylSpin}
                size={340}
                currentCoverUrl={currentCoverUrl}
                currentTitle={currentTitle}
              />
            </div>
          </div>

          <div className="flex flex-col gap-3 max-w-xl w-full">
            <div className="flex-1 flex">
              <DropZone
                onFiles={addFiles}
                isDragging={isDragging}
                setIsDragging={setIsDragging}
                queueLeft={queueLeft}
              />
            </div>
            <div
              className="flex items-center justify-between gap-3 flex-wrap text-[11px]"
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                color: '#6A6058',
              }}
            >
              <span>
                目前支持 网易云（.ncm）/ 酷狗（.kgm / .vpr）/ .flac
                <span className="mx-1.5" style={{ color: 'rgba(28,26,24,0.2)' }}>
                  ·
                </span>
                <span style={{ color: '#A0988E' }}>QQ 音乐 / 酷我 即将到来</span>
              </span>
              {currentlyDecrypting && (
                <span style={{ color: '#6A6058' }}>
                  正在转换 ·{' '}
                  <span style={{ color: '#1C1A18' }}>{currentTitle}</span>
                </span>
              )}
            </div>
          </div>
        </section>

        {/* Warning banner — 手动关闭，不自动消失 */}
        {warning && (
          <div
            className="mb-4 rounded-2xl pl-4 pr-2 py-2.5 text-[12px] flex items-start gap-3"
            style={{
              background: '#FBF0D8',
              color: '#7B5A14',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(180,130,40,0.2)',
            }}
          >
            <span className="flex-1 leading-snug pt-0.5 flex items-start gap-2">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 mt-[2px]"
                aria-hidden
              >
                <path d="M12 3l10 18H2L12 3z" />
                <path d="M12 10v5" />
                <circle cx="12" cy="18" r="0.6" fill="currentColor" />
              </svg>
              <span>{warning}</span>
            </span>
            <button
              type="button"
              onClick={() => setWarning(null)}
              aria-label="关闭"
              className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center transition-colors hover:bg-[rgba(123,90,20,0.12)]"
              style={{ color: '#7B5A14' }}
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
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </svg>
            </button>
          </div>
        )}

        {/* Batch list */}
        {files.length > 0 && (
          <section
            className="rounded-2xl p-4 sm:p-5"
            style={{
              background:
                'linear-gradient(180deg, rgba(255,255,255,0.5) 0%, rgba(0,0,0,0.02) 100%)',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.8), 0 0 0 1px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.05)',
            }}
          >
            {/* list header */}
            <div className="flex items-center justify-between mb-3 px-1 gap-2 flex-wrap">
              <div className="flex items-baseline gap-2.5 flex-wrap">
                <h2
                  className="text-sm font-medium"
                  style={{ color: '#1C1A18' }}
                >
                  转换队列
                </h2>
                <span
                  className="text-[11px]"
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    color: '#8A8680',
                  }}
                >
                  {total} 个文件 · 已完成 {doneCount}
                  {failedCount > 0 && (
                    <span style={{ color: '#B83020' }}> · {failedCount} 失败</span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {doneCount >= 2 && (
                  <>
                    <button
                      ref={downloadAllRef}
                      onClick={() => {
                        analytics.track('btn_download_all_click', { count: doneCount })
                        downloadAllSeparate()
                      }}
                      disabled={isZipping}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                      style={secondaryBtnStyle}
                    >
                      下载全部
                    </button>
                    <button
                      ref={downloadZipRef}
                      onClick={() => {
                        analytics.track('btn_download_zip_click', { count: doneCount })
                        downloadAllAsZip()
                      }}
                      disabled={isZipping}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                      style={secondaryBtnStyle}
                    >
                      {isZipping
                        ? `打包中… ${Math.round(zipProgress * 100)}%`
                        : '打包下载 (ZIP)'}
                    </button>
                  </>
                )}
                <ClearAllButton onConfirm={handleClearAll} />
              </div>
            </div>

            {/* overall progress bar */}
            <div
              className="mx-1 mb-3 h-1.5 rounded-full overflow-hidden"
              style={{
                background: 'rgba(0,0,0,0.08)',
                boxShadow: 'inset 0 1px 1px rgba(0,0,0,0.1)',
              }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${overallProgress * 100}%`,
                  background:
                    allDone && failedCount === 0
                      ? 'linear-gradient(180deg, #3A9B5C 0%, #236B3A 100%)'
                      : 'linear-gradient(180deg, #F05A2A 0%, #C4310E 100%)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3)',
                }}
              />
            </div>

            <div className="flex flex-col gap-2">
              {files.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  onRetry={retryFile}
                  onRemove={removeFile}
                  onNotify={notify}
                  onTranscode={transcodeFile}
                />
              ))}
            </div>
          </section>
        )}

        <footer
          className="mt-12 sm:mt-16 text-center text-[11px]"
          style={{ color: '#A0988E' }}
        >
          仅用于处理你合法持有的音乐文件 · 本网站不上传、不存储任何文件
        </footer>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4 py-2 rounded-lg text-sm"
          style={{
            background: '#1C1A18',
            color: '#F4F2EE',
            boxShadow:
              '0 8px 24px -4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
          }}
        >
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
