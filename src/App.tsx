import { useCallback, useState } from 'react'

type DroppedFile = {
  id: string
  name: string
  size: number
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function App() {
  const [files, setFiles] = useState<DroppedFile[]>([])
  const [isDragging, setIsDragging] = useState(false)

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming).map((f) => ({
      id: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      size: f.size,
    }))
    setFiles((prev) => [...prev, ...list])
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragging(false)
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  const handleSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) addFiles(e.target.files)
      e.target.value = '' // 允许重复选同一个文件
    },
    [addFiles],
  )

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
            支持多文件，处理完后可下载
          </div>
        </label>

        {files.length > 0 && (
          <section className="mt-8">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium text-slate-600">
                已添加 {files.length} 个文件
              </h2>
              <button
                onClick={() => setFiles([])}
                className="text-xs text-slate-500 hover:text-rose-600"
              >
                全部清空
              </button>
            </div>
            <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {files.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-slate-800">
                      {f.name}
                    </div>
                    <div className="text-xs text-slate-400">
                      {formatSize(f.size)}
                    </div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                    待处理
                  </span>
                </li>
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

export default App
