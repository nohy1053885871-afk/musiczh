import { useCallback, useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
  decryptNcm,
  NcmError,
  type DecryptResult,
  type NcmErrorCode,
} from './lib/ncm'

// ========== 限制 ==========
// 一次最多处理多少个文件（保护浏览器内存 + UI 性能）
const MAX_FILES = 50
// 单个文件最大字节数（100MB，覆盖 99% NCM 文件）
const MAX_FILE_SIZE = 100 * 1024 * 1024

type FileStatus = 'pending' | 'decrypting' | 'done' | 'failed'

type TrackedFile = {
  id: string
  file: File
  status: FileStatus
  progress: number
  result?: DecryptResult
  coverUrl?: string
  errorCode?: NcmErrorCode
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
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let i = 2
  while (used.has(`${base} (${i})${ext}`)) i++
  const final = `${base} (${i})${ext}`
  used.add(final)
  return final
}

function App() {
  const [files, setFiles] = useState<TrackedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isZipping, setIsZipping] = useState(false)
  const [zipProgress, setZipProgress] = useState(0)
  // 文件被拒绝时的提示横幅，5 秒后自动消失
  const [warning, setWarning] = useState<string | null>(null)
  // 底部 toast，2 秒后自动消失
  const [toast, setToast] = useState<string | null>(null)
  // 「全部清空」二次确认状态，4 秒后自动取消
  const [confirmingClear, setConfirmingClear] = useState(false)

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
          const result = await decryptNcm(next.file, (p) => {
            updateFile(next.id, { progress: p })
          })
          const coverUrl = result.cover
            ? URL.createObjectURL(result.cover)
            : undefined
          updateFile(next.id, {
            status: 'done',
            result,
            coverUrl,
            progress: 1,
          })
        } catch (err) {
          let code: NcmErrorCode = 'UNKNOWN'
          let message = '未知错误'
          if (err instanceof NcmError) {
            code = err.code
            message = err.message
          } else if (err instanceof Error) {
            message = `出错了：${err.message}`
          }
          updateFile(next.id, {
            status: 'failed',
            errorCode: code,
            errorMessage: message,
          })
        }
      }
    } finally {
      isProcessingRef.current = false
    }
  }, [updateFile])

  // 添加文件，应用限制规则，返回被跳过的原因
  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const reasons: string[] = []
      let candidates = Array.from(incoming)

      // 1. 过滤非 .ncm 文件
      const wrongExt = candidates.filter((f) => !/\.ncm$/i.test(f.name))
      if (wrongExt.length) reasons.push(`${wrongExt.length} 个非 .ncm 文件`)
      candidates = candidates.filter((f) => /\.ncm$/i.test(f.name))

      // 2. 过滤超大文件
      const oversize = candidates.filter((f) => f.size > MAX_FILE_SIZE)
      if (oversize.length) {
        reasons.push(`${oversize.length} 个文件超过 100MB`)
      }
      candidates = candidates.filter((f) => f.size <= MAX_FILE_SIZE)

      // 3. 限制队列总数
      const currentCount = filesRef.current.length
      const remaining = MAX_FILES - currentCount
      if (candidates.length > remaining) {
        const skipped = candidates.length - remaining
        reasons.push(`${skipped} 个文件超过 50 个上限`)
        candidates = candidates.slice(0, Math.max(0, remaining))
      }

      if (reasons.length) {
        setWarning(`已跳过：${reasons.join('；')}`)
      } else {
        setWarning(null)
      }

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

  // 警告横幅 5 秒自动消失
  useEffect(() => {
    if (!warning) return
    const t = setTimeout(() => setWarning(null), 5000)
    return () => clearTimeout(t)
  }, [warning])

  // toast 2 秒自动消失
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 2000)
    return () => clearTimeout(t)
  }, [toast])

  // 二次确认 4 秒后自动取消
  useEffect(() => {
    if (!confirmingClear) return
    const t = setTimeout(() => setConfirmingClear(false), 4000)
    return () => clearTimeout(t)
  }, [confirmingClear])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLLabelElement>) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files)
      e.target.value = ''
    },
    [addFiles],
  )

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

  // 删除单条记录
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

  // 下载全部已完成文件（每个之间留一点间隔，避免浏览器拒绝多文件下载）
  const downloadAllSeparate = async () => {
    const doneFiles = files.filter((f) => f.status === 'done' && f.result)
    if (doneFiles.length === 0) return
    notify(`已开始下载 ${doneFiles.length} 首`)
    for (const f of doneFiles) {
      triggerDownload(f.result!.audio, f.result!.suggestedName)
      await new Promise((r) => setTimeout(r, 150))
    }
  }

  // 打包成 ZIP 一次下载
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
      triggerDownload(
        blob,
        `音乐转换_${doneFiles.length}首_${todayStamp()}.zip`,
      )
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
    setConfirmingClear(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
            NCM 转 MP3 转换工具
          </h1>
          <p className="mt-3 text-sm text-slate-500 sm:text-base">
            文件全部在你的浏览器本地处理，不会上传到任何服务器。
          </p>
        </header>

        <label
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragging(true)
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={[
            'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white px-6 py-16 text-center transition',
            isDragging
              ? 'border-indigo-500 bg-indigo-50'
              : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50',
          ].join(' ')}
        >
          <input
            type="file"
            multiple
            accept=".ncm"
            className="hidden"
            onChange={handleSelect}
          />
          <div className="text-5xl">🎵</div>
          <div className="mt-4 text-base font-medium text-slate-700">
            把 .ncm 文件拖到这里，或点击选择
          </div>
          <div className="mt-1 text-xs text-slate-400">
            支持多文件 · 单个最大 100MB · 一次最多 50 个
          </div>
        </label>

        {warning && (
          <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {warning}
          </div>
        )}

        {files.length > 0 && (
          <section className="mt-8">
            <div className="mb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-medium text-slate-600">
                  {total} 个文件 · 已完成 {doneCount}
                  {failedCount > 0 && (
                    <span className="ml-1 text-rose-600">
                      · {failedCount} 失败
                    </span>
                  )}
                </h2>
                <div className="flex items-center gap-3">
                  {doneCount >= 2 && (
                    <>
                      <button
                        onClick={downloadAllSeparate}
                        disabled={isZipping}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        下载全部
                      </button>
                      <button
                        onClick={downloadAllAsZip}
                        disabled={isZipping}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-400"
                      >
                        {isZipping
                          ? `打包中… ${Math.round(zipProgress * 100)}%`
                          : '打包下载 (ZIP)'}
                      </button>
                    </>
                  )}
                  <div className="relative">
                    <button
                      onClick={() => setConfirmingClear(true)}
                      className="text-xs text-slate-500 hover:text-rose-600"
                    >
                      全部清空
                    </button>
                    {confirmingClear && (
                      <>
                        {/* 透明背景层，点击空白处关闭气泡 */}
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setConfirmingClear(false)}
                        />
                        {/* 浮出确认气泡 */}
                        <div className="absolute right-0 top-full z-20 mt-2 w-48 rounded-lg border border-slate-200 bg-white p-3 shadow-xl">
                          <div className="text-xs text-slate-700">
                            确认清空所有文件？
                          </div>
                          <div className="mt-3 flex justify-end gap-3">
                            <button
                              onClick={() => setConfirmingClear(false)}
                              className="text-xs text-slate-500 hover:text-slate-700"
                            >
                              取消
                            </button>
                            <button
                              onClick={handleClearAll}
                              className="text-xs font-medium text-rose-600 hover:text-rose-700"
                            >
                              清空
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                <div
                  className={[
                    'h-full transition-all duration-300',
                    allDone && failedCount === 0
                      ? 'bg-emerald-500'
                      : 'bg-indigo-500',
                  ].join(' ')}
                  style={{ width: `${overallProgress * 100}%` }}
                />
              </div>
            </div>

            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {files.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  onRetry={retryFile}
                  onRemove={removeFile}
                  onNotify={notify}
                />
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 text-center text-xs text-slate-400">
          仅用于处理你合法持有的音乐文件 · 本网站不上传、不存储任何文件
        </footer>
      </div>

      {/* 底部 toast */}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  )
}

function FileRow({
  file: f,
  onRetry,
  onRemove,
  onNotify,
}: {
  file: TrackedFile
  onRetry: (id: string) => void
  onRemove: (id: string) => void
  onNotify: (msg: string) => void
}) {
  const meta = f.result?.meta
  const title = meta?.musicName || f.file.name.replace(/\.ncm$/i, '')
  const artist = meta?.artist?.map((a) => a[0]).join(', ')
  const isFailed = f.status === 'failed'
  // 下载按钮点击后的"已下载"状态，1.5 秒后恢复
  const [justDownloaded, setJustDownloaded] = useState(false)
  useEffect(() => {
    if (!justDownloaded) return
    const t = setTimeout(() => setJustDownloaded(false), 1500)
    return () => clearTimeout(t)
  }, [justDownloaded])

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <div
          className={[
            'h-12 w-12 flex-shrink-0 overflow-hidden rounded',
            isFailed ? 'bg-rose-50' : 'bg-slate-100',
          ].join(' ')}
        >
          {f.coverUrl ? (
            <img
              src={f.coverUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              className={[
                'flex h-full w-full items-center justify-center text-lg',
                isFailed ? 'text-rose-400' : 'text-slate-300',
              ].join(' ')}
            >
              {isFailed ? '⚠' : '🎵'}
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-slate-800">
            {title}
          </div>
          <div className="truncate text-xs text-slate-500">
            {artist ? `${artist} · ` : ''}
            {formatSize(f.file.size)}
            {f.result?.format ? ` · ${f.result.format.toUpperCase()}` : ''}
          </div>
          {isFailed && f.errorMessage && (
            <div
              title={f.errorMessage}
              className="mt-1 truncate text-xs text-rose-600"
            >
              {f.errorMessage}
            </div>
          )}
        </div>

        {/* 主操作 + 清除按钮 */}
        <div className="flex flex-shrink-0 items-center gap-2">
          {f.status === 'pending' && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              排队中
            </span>
          )}
          {f.status === 'decrypting' && (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
              {Math.round(f.progress * 100)}%
            </span>
          )}
          {f.status === 'done' && f.result && (
            <button
              onClick={() => {
                triggerDownload(f.result!.audio, f.result!.suggestedName)
                onNotify('已开始下载')
                setJustDownloaded(true)
              }}
              className={[
                'rounded-full px-3 py-1 text-xs font-medium text-white transition-all duration-200 active:scale-95',
                justDownloaded
                  ? 'bg-emerald-500 hover:bg-emerald-500'
                  : 'bg-indigo-600 hover:bg-indigo-700',
              ].join(' ')}
            >
              {justDownloaded ? '✓ 已下载' : '下载'}
            </button>
          )}
          {isFailed && (
            <button
              onClick={() => onRetry(f.id)}
              className="rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
            >
              重试
            </button>
          )}
          {/* 清除按钮：始终显示 */}
          <button
            onClick={() => onRemove(f.id)}
            title="移除此项"
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
          >
            ✕
          </button>
        </div>
      </div>

      {f.status === 'decrypting' && (
        <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full bg-amber-400 transition-all duration-150"
            style={{ width: `${f.progress * 100}%` }}
          />
        </div>
      )}
    </li>
  )
}

export default App
