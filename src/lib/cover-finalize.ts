import { fetchRemoteCover } from './cover'
import {
  REMOTE_COVER_CONCURRENCY,
  REMOTE_COVER_DEADLINE_MS,
  type CoverFailureCode,
} from './cover-policy'
import {
  readMetaFromBlob,
  writeFlacMeta,
  writeId3ToMp3,
  writeM4aMeta,
} from './metadata'
import { sniffAudioFormat } from './sniff'
import type { DecryptResult } from './types'

export type CoverFinalizeOutcome =
  | { ok: true; result: DecryptResult }
  | { ok: false; result: DecryptResult; errorCode: CoverFailureCode }

type CoverWorker = (
  result: DecryptResult,
  remainingMs: number,
) => Promise<CoverFinalizeOutcome>

type QueueJob = {
  result: DecryptResult
  deadlineAt: number
  settled: boolean
  timer?: ReturnType<typeof setTimeout>
  resolve: (outcome: CoverFinalizeOutcome) => void
}

/** 所有带远程地址的无封面产物都进入收尾；不支持写标签时也必须明确降级。 */
export function needsRemoteCoverFinalization(result: DecryptResult): boolean {
  return !result.cover && !!result.meta.albumPic
}

export class CoverFinalizer {
  private readonly queue: QueueJob[] = []
  private active = 0
  private readonly worker: CoverWorker
  private readonly concurrency: number
  private readonly deadlineMs: number

  constructor(
    worker: CoverWorker = finalizeRemoteCover,
    concurrency = REMOTE_COVER_CONCURRENCY,
    deadlineMs = REMOTE_COVER_DEADLINE_MS,
  ) {
    this.worker = worker
    this.concurrency = concurrency
    this.deadlineMs = deadlineMs
  }

  enqueue(result: DecryptResult): Promise<CoverFinalizeOutcome> {
    return new Promise((resolve) => {
      const job: QueueJob = {
        result,
        deadlineAt: Date.now() + this.deadlineMs,
        settled: false,
        resolve,
      }
      job.timer = setTimeout(() => {
        this.settle(job, {
          ok: false,
          result: job.result,
          errorCode: 'COVER_TIMEOUT',
        })
        const queuedIndex = this.queue.indexOf(job)
        if (queuedIndex >= 0) this.queue.splice(queuedIndex, 1)
      }, this.deadlineMs)
      this.queue.push(job)
      this.drain()
    })
  }

  private drain(): void {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()
      if (!job || job.settled) continue
      const remainingMs = job.deadlineAt - Date.now()
      if (remainingMs <= 0) {
        this.settle(job, {
          ok: false,
          result: job.result,
          errorCode: 'COVER_TIMEOUT',
        })
        continue
      }
      this.active += 1
      void this.run(job, remainingMs)
    }
  }

  private async run(job: QueueJob, remainingMs: number): Promise<void> {
    try {
      const outcome = await this.worker(job.result, remainingMs)
      this.settle(
        job,
        Date.now() >= job.deadlineAt
          ? {
              ok: false,
              result: job.result,
              errorCode: 'COVER_TIMEOUT',
            }
          : outcome,
      )
    } catch {
      this.settle(job, {
        ok: false,
        result: job.result,
        errorCode:
          Date.now() >= job.deadlineAt
            ? 'COVER_TIMEOUT'
            : 'COVER_TAG_WRITE_FAILED',
      })
    } finally {
      this.active -= 1
      this.drain()
    }
  }

  private settle(job: QueueJob, outcome: CoverFinalizeOutcome): void {
    if (job.settled) return
    job.settled = true
    if (job.timer) clearTimeout(job.timer)
    job.resolve(outcome)
  }
}

async function finalizeRemoteCover(
  result: DecryptResult,
  remainingMs: number,
): Promise<CoverFinalizeOutcome> {
  if (result.format === 'ogg') {
    return { ok: false, result, errorCode: 'COVER_TAG_WRITE_FAILED' }
  }
  const remote = await fetchRemoteCover(result.meta.albumPic || '', remainingMs)
  if (!remote.ok) return { ok: false, result, errorCode: remote.errorCode }

  let tagged: Blob
  try {
    if (result.format === 'mp3') {
      tagged = await writeId3ToMp3(result.audio, remote.cover, result.meta)
    } else if (result.format === 'flac') {
      tagged = await writeFlacMeta(result.audio, remote.cover, result.meta)
    } else if (result.format === 'm4a') {
      tagged = await writeM4aMeta(result.audio, remote.cover, result.meta)
    } else return { ok: false, result, errorCode: 'COVER_TAG_WRITE_FAILED' }
  } catch {
    return { ok: false, result, errorCode: 'COVER_TAG_WRITE_FAILED' }
  }

  const outputHead = new Uint8Array(await tagged.slice(0, 16).arrayBuffer())
  const verified = await readMetaFromBlob(tagged, result.format)
  if (sniffAudioFormat(outputHead) !== result.format || !verified.cover) {
    return { ok: false, result, errorCode: 'COVER_EMBED_VERIFY_FAILED' }
  }
  return {
    ok: true,
    result: { ...result, audio: tagged, cover: remote.cover },
  }
}

export const coverFinalizer = new CoverFinalizer()
