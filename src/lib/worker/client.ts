/**
 * 拾音 · Worker 主线程代理
 *
 * 对 App 保持 decryptAudioFile / transcodeToMp3 原签名，内部转发到常驻 Worker。
 * Worker 懒创建、跨任务复用；未捕获崩溃（WASM OOM 等）时 reject 全部在途任务并销毁重建。
 */

import {
  DecryptError,
  type DecryptResult,
  type ProgressCallback,
} from '../types'
import type { SupportedExt } from '../decrypt'
import {
  reviveWorkerError,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol'

export { TRANSCODE_ENCODER } from '../transcode'

type DoneMessage = Extract<
  WorkerResponse,
  { kind: 'decrypt-done' | 'transcode-done' }
>

interface Pending {
  onProgress?: ProgressCallback
  resolve: (msg: DoneMessage) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, Pending>()

function rejectAll(err: Error) {
  for (const entry of pending.values()) entry.reject(err)
  pending.clear()
}

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./audio.worker.ts', import.meta.url), {
    type: 'module',
  })
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
    const msg = e.data
    const entry = pending.get(msg.id)
    if (!entry) return
    if (msg.kind === 'progress') {
      entry.onProgress?.(msg.value)
      return
    }
    pending.delete(msg.id)
    if (msg.kind === 'fail') {
      entry.reject(reviveWorkerError(msg.error))
    } else {
      entry.resolve(msg)
    }
  }
  // 未捕获异常（脚本加载失败 / WASM OOM 杀进程）：在途任务全部失败，销毁实例下次重建
  worker.onerror = () => {
    rejectAll(new DecryptError('UNKNOWN', '处理进程异常退出，请重试'))
    worker?.terminate()
    worker = null
  }
  return worker
}

function dispatch(
  req: WorkerRequest,
  onProgress?: ProgressCallback,
): Promise<DoneMessage> {
  return new Promise<DoneMessage>((resolve, reject) => {
    pending.set(req.id, { onProgress, resolve, reject })
    getWorker().postMessage(req)
  })
}

export async function decryptAudioFile(
  file: File,
  onProgress?: ProgressCallback,
  formatOverride?: SupportedExt | 'qmc',
): Promise<DecryptResult> {
  const msg = await dispatch(
    { kind: 'decrypt', id: nextId++, file, formatOverride },
    onProgress,
  )
  if (msg.kind !== 'decrypt-done') {
    throw new DecryptError('UNKNOWN', '内部错误：worker 返回类型不匹配')
  }
  return msg.result
}

export async function transcodeToMp3(
  source: Blob,
  onProgress?: ProgressCallback,
): Promise<Blob> {
  const msg = await dispatch(
    { kind: 'transcode', id: nextId++, source },
    onProgress,
  )
  if (msg.kind !== 'transcode-done') {
    throw new DecryptError('UNKNOWN', '内部错误：worker 返回类型不匹配')
  }
  return msg.blob
}
