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

const MAX_FILES = 50
const MAX_FILE_SIZE = 100 * 1024 * 1024

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

  return (
    <label
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
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
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
        accept=".ncm,.kgm,.vpr"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files)
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
            支持多文件 · 单个最大 100MB ·{' '}
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
                  : 'radial-gradient(circle at 35% 30%, #C8662C, #7B3A14)',
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
            onClick={(e) => {
              e.stopPropagation()
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
            onClick={(e) => {
              e.stopPropagation()
              triggerDownload(file.result!.audio, file.result!.suggestedName)
              onNotify('已开始下载')
              setJustDownloaded(true)
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
            onClick={(e) => {
              e.stopPropagation()
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
          onClick={(e) => {
            e.stopPropagation()
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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(true)}
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
                onClick={() => setOpen(false)}
                className="text-xs"
                style={{ color: '#8A8680' }}
              >
                取消
              </button>
              <button
                onClick={() => {
                  onConfirm()
                  setOpen(false)
                }}
                className="text-xs font-semibold"
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

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    try {
      while (true) {
        const next = filesRef.current.find((f) => f.status === 'pending')
        if (!next) break
        updateFile(next.id, { status: 'decrypting', progress: 0 })
        try {
          const result = await decryptAudioFile(next.file, (p) => {
            updateFile(next.id, { progress: p })
          })
          const coverUrl = result.cover
            ? URL.createObjectURL(result.cover)
            : result.meta.albumPic || undefined
          updateFile(next.id, { status: 'done', result, coverUrl, progress: 1 })
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
        }
      }
    } finally {
      isProcessingRef.current = false
    }
  }, [updateFile])

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const reasons: string[] = []
      let candidates = Array.from(incoming)
      const wrongExt = candidates.filter((f) => !SUPPORTED_EXT_REGEX.test(f.name))
      if (wrongExt.length) reasons.push(`${wrongExt.length} 个文件格式不支持`)
      candidates = candidates.filter((f) => SUPPORTED_EXT_REGEX.test(f.name))
      const oversize = candidates.filter((f) => f.size > MAX_FILE_SIZE)
      if (oversize.length) reasons.push(`${oversize.length} 个文件超过 100MB`)
      candidates = candidates.filter((f) => f.size <= MAX_FILE_SIZE)
      const currentCount = filesRef.current.length
      const remaining = MAX_FILES - currentCount
      let hitLimit = false
      if (candidates.length > remaining) {
        hitLimit = true
        reasons.push(`${candidates.length - remaining} 个文件超过 50 个上限`)
        candidates = candidates.slice(0, Math.max(0, remaining))
      }
      if (reasons.length) {
        const suffix = hitLimit ? '，请下载并清空当前列表后继续' : ''
        setWarning(`已跳过：${reasons.join('；')}${suffix}`)
      } else setWarning(null)
      if (candidates.length === 0) return
      const list: TrackedFile[] = candidates.map((f) => ({
        id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: 'pending' as FileStatus,
        progress: 0,
      }))
      setFiles((prev) => [...prev, ...list])
      setTimeout(() => processQueue(), 0)
    },
    [processQueue],
  )

  useEffect(() => {
    if (!warning) return
    const t = setTimeout(() => setWarning(null), 5000)
    return () => clearTimeout(t)
  }, [warning])

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

  const transcodeFile = useCallback(
    async (id: string) => {
      const target = filesRef.current.find((f) => f.id === id)
      if (!target?.result || target.status !== 'done') return
      if (target.result.format === 'mp3') return
      updateFile(id, { status: 'transcoding', progress: 0 })
      try {
        const mp3Blob = await transcodeToMp3(target.result.audio, (p) => {
          updateFile(id, { progress: p })
        })
        const newName = target.result.suggestedName.replace(
          /\.(flac|ogg)$/i,
          '.mp3',
        )
        updateFile(id, {
          status: 'done',
          progress: 1,
          result: {
            ...target.result,
            audio: mp3Blob,
            format: 'mp3',
            suggestedName: newName,
          },
        })
        notify('已转为 MP3')
      } catch (err) {
        let message = '转码失败'
        if (err instanceof DecryptError) message = err.message
        else if (err instanceof Error) message = `转码失败：${err.message}`
        updateFile(id, {
          status: 'done',
          progress: 1,
        })
        setWarning(message)
      }
    },
    [updateFile, notify],
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

  const downloadAllSeparate = async () => {
    const doneFiles = files.filter((f) => f.status === 'done' && f.result)
    if (doneFiles.length === 0) return
    notify(`已开始下载 ${doneFiles.length} 首`)
    for (const f of doneFiles) {
      triggerDownload(f.result!.audio, f.result!.suggestedName)
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
      notify('ZIP 已开始下载')
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
                    background: 'radial-gradient(circle at 35% 30%, #E8431A, #A82C08)',
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
              v0.1.1
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
                目前支持 网易云 .ncm / 酷狗 .kgm / .vpr
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

        {/* Warning banner */}
        {warning && (
          <div
            className="mb-4 rounded-2xl px-4 py-2.5 text-[12px]"
            style={{
              background: 'linear-gradient(180deg, #FBF0D8 0%, #F4E4B8 100%)',
              color: '#7B5A14',
              boxShadow:
                'inset 0 1px 0 rgba(255,255,255,0.05), inset 0 0 0 1px rgba(180,130,40,0.2)',
            }}
          >
            ⚠ {warning}
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
                      onClick={downloadAllSeparate}
                      disabled={isZipping}
                      className="px-3 py-1.5 rounded-md text-xs font-medium transition-all hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50"
                      style={secondaryBtnStyle}
                    >
                      下载全部
                    </button>
                    <button
                      onClick={downloadAllAsZip}
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
