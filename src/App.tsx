import { useCallback, useEffect, useRef, useState } from 'react'
import { decryptNcm, type DecryptResult } from './lib/ncm'

type FileStatus = 'pending' | 'decrypting' | 'done' | 'failed'

type TrackedFile = {
  id: string
  file: File
  status: FileStatus
  result?: DecryptResult
  coverUrl?: string // ObjectURL，用于预览封面
  error?: string
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
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

function App() {
  const [files, setFiles] = useState<TrackedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)
  // 用 ref 保存最新 files，方便在异步循环里读
  const filesRef = useRef(files)
  filesRef.current = files
  // 防止重复启动处理任务的标志
  const isProcessingRef = useRef(false)

  const updateFile = useCallback(
    (id: string, patch: Partial<TrackedFile>) => {
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))
    },
    [],
  )

  // 顺序处理所有 pending 文件（避免一次性把内存撑爆）
  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true
    try {
      // 持续找下一个 pending 文件，直到没有
      while (true) {
        const next = filesRef.current.find((f) => f.status === 'pending')
        if (!next) break
        updateFile(next.id, { status: 'decrypting' })
        try {
          const result = await decryptNcm(next.file)
          const coverUrl = result.cover ? URL.createObjectURL(result.cover) : undefined
          updateFile(next.id, { status: 'done', result, coverUrl })
        } catch (err) {
          updateFile(next.id, {
            status: 'failed',
            error: err instanceof Error ? err.message : '未知错误',
          })
        }
      }
    } finally {
      isProcessingRef.current = false
    }
  }, [updateFile])

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const list: TrackedFile[] = Array.from(incoming)
        .filter((f) => /\.ncm$/i.test(f.name))
        .map((f) => ({
          id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file: f,
          status: 'pending' as FileStatus,
        }))
      if (list.length === 0) return
      setFiles((prev) => [...prev, ...list])
      // 下一帧再启动处理（让 setFiles 生效后 ref 也是新的）
      setTimeout(() => processQueue(), 0)
    },
    [processQueue],
  )

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

  // 卸载时释放所有 ObjectURL
  useEffect(() => {
    return () => {
      filesRef.current.forEach((f) => {
        if (f.coverUrl) URL.revokeObjectURL(f.coverUrl)
      })
    }
  }, [])

  const doneCount = files.filter((f) => f.status === 'done').length

  const downloadAll = () => {
    files.forEach((f) => {
      if (f.status === 'done' && f.result) {
        triggerDownload(f.result.audio, f.result.suggestedName)
      }
    })
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <header className="mb-10 text-center">
          <h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
            NCM 转 MP3 转换器
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
            支持多文件，自动解密，完成后可下载
          </div>
        </label>

        {files.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-600">
                {files.length} 个文件 · 已完成 {doneCount}
              </h2>
              <div className="flex gap-3">
                {doneCount > 1 && (
                  <button
                    onClick={downloadAll}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    下载全部已完成
                  </button>
                )}
                <button
                  onClick={() => {
                    files.forEach((f) => {
                      if (f.coverUrl) URL.revokeObjectURL(f.coverUrl)
                    })
                    setFiles([])
                  }}
                  className="text-xs text-slate-500 hover:text-rose-600"
                >
                  全部清空
                </button>
              </div>
            </div>
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {files.map((f) => (
                <FileRow key={f.id} file={f} />
              ))}
            </ul>
          </section>
        )}

        <footer className="mt-12 text-center text-xs text-slate-400">
          仅用于处理你合法持有的音乐文件 · 本网站不上传、不存储任何文件
        </footer>
      </div>
    </div>
  )
}

function FileRow({ file: f }: { file: TrackedFile }) {
  const meta = f.result?.meta
  const title = meta?.musicName || f.file.name.replace(/\.ncm$/i, '')
  const artist = meta?.artist?.map((a) => a[0]).join(', ')

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      {/* 封面图 */}
      <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded bg-slate-100">
        {f.coverUrl ? (
          <img src={f.coverUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-300">
            🎵
          </div>
        )}
      </div>

      {/* 标题 / 歌手 / 体积 */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800">
          {title}
        </div>
        <div className="truncate text-xs text-slate-500">
          {artist ? `${artist} · ` : ''}
          {formatSize(f.file.size)}
          {f.result?.format ? ` · ${f.result.format.toUpperCase()}` : ''}
        </div>
        {f.status === 'failed' && f.error && (
          <div className="mt-1 truncate text-xs text-rose-600">{f.error}</div>
        )}
      </div>

      {/* 状态 / 操作 */}
      <div className="flex-shrink-0">
        {f.status === 'pending' && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            排队中
          </span>
        )}
        {f.status === 'decrypting' && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
            解密中…
          </span>
        )}
        {f.status === 'done' && f.result && (
          <button
            onClick={() => triggerDownload(f.result!.audio, f.result!.suggestedName)}
            className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-indigo-700"
          >
            下载
          </button>
        )}
        {f.status === 'failed' && (
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
            失败
          </span>
        )}
      </div>
    </li>
  )
}

export default App
