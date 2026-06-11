/**
 * 拾音 · 解密/转码 Worker 入口（module worker）
 *
 * 把 CPU 密集的解密（AES/RC4/XOR）与转码（WASM 解码 + LAME 编码）全部挪出主线程，
 * 主线程只收进度、画 UI。请求按到达顺序串行消化（App 队列本就串行，链式只是防御）。
 */

import { decryptAudioFile } from '../decrypt'
import { transcodeToMp3 } from '../transcode'
import {
  serializeWorkerError,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol'

const PROGRESS_INTERVAL_MS = 100

function post(msg: WorkerResponse) {
  self.postMessage(msg)
}

/** 100ms 节流：RC4 每 256KB 回调一次，不节流会洪泛主线程；终值 1 始终放行 */
function throttledProgress(id: number) {
  let last = 0
  return (value: number) => {
    const now = Date.now()
    if (value < 1 && now - last < PROGRESS_INTERVAL_MS) return
    last = now
    post({ kind: 'progress', id, value })
  }
}

async function handle(req: WorkerRequest) {
  try {
    if (req.kind === 'decrypt') {
      const result = await decryptAudioFile(
        req.file,
        throttledProgress(req.id),
        req.formatOverride,
      )
      post({ kind: 'decrypt-done', id: req.id, result })
    } else {
      const blob = await transcodeToMp3(req.source, throttledProgress(req.id))
      post({ kind: 'transcode-done', id: req.id, blob })
    }
  } catch (err) {
    post({ kind: 'fail', id: req.id, error: serializeWorkerError(err) })
  }
}

let chain: Promise<void> = Promise.resolve()

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  chain = chain.then(() => handle(req))
}
