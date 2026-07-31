/** 远程封面：按已确认的 CDN 语法缩略、限流读取，并返回可观测失败码。 */

import {
  MAX_COVER_BYTES,
  REMOTE_COVER_DEADLINE_MS,
  REMOTE_COVER_EDGE,
  type CoverFailureCode,
} from './cover-policy'
import { sniffImageMime } from './sniff'

export type RemoteCoverResult =
  | { ok: true; cover: Blob; resolvedUrl: string }
  | { ok: false; errorCode: CoverFailureCode }

const inflight = new Map<string, Promise<RemoteCoverResult>>()

/** 把 http:// 升级成 https://，避免 https 站点对混合内容的拦截 */
export function upgradeToHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://')
}

/**
 * 按真实 CDN 分流缩略语法；未知来源不猜参数。
 * 网易：https://nos.netease.com/doc/NOS-Media-Develop-API.pdf
 * 喜马拉雅：https://open.ximalaya.com/docNoHelp/detailApi?articleId=6&categoryId=1
 */
export function resolveRemoteCoverUrl(input: string): string {
  const upgraded = upgradeToHttps(input)
  let url: URL
  try {
    url = new URL(upgraded)
  } catch {
    return upgraded
  }

  if (/^p\d+\.music\.126\.net$/i.test(url.hostname)) {
    const rest = new URLSearchParams(url.search)
    rest.delete('param')
    rest.delete('imageView')
    rest.delete('thumbnail')
    const tail = rest.toString()
    url.search = `?imageView&thumbnail=${REMOTE_COVER_EDGE}y${REMOTE_COVER_EDGE}${tail ? `&${tail}` : ''}`
    return url.toString()
  }

  if (/^imagev2\.xmcdn\.com$/i.test(url.hostname)) {
    const base = url.toString().split('!')[0]
    return `${base}!op_type=3&columns=${REMOTE_COVER_EDGE}&rows=${REMOTE_COVER_EDGE}`
  }

  return url.toString()
}

/**
 * 抓远程封面，失败不抛。图片 magic 是权威信号，HTTP Content-Type 只作旁证。
 */
export async function fetchRemoteCover(
  url: string,
  timeoutMs = REMOTE_COVER_DEADLINE_MS,
): Promise<RemoteCoverResult> {
  if (!url) return { ok: false, errorCode: 'COVER_NETWORK_ERROR' }
  const resolvedUrl = resolveRemoteCoverUrl(url)
  const existing = inflight.get(resolvedUrl)
  if (existing) return existing

  const task = fetchRemoteCoverOnce(resolvedUrl, timeoutMs)
  inflight.set(resolvedUrl, task)
  void task.finally(() => {
    if (inflight.get(resolvedUrl) === task) inflight.delete(resolvedUrl)
  })
  return task
}

async function fetchRemoteCoverOnce(
  resolvedUrl: string,
  timeoutMs: number,
): Promise<RemoteCoverResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(resolvedUrl, {
      mode: 'cors',
      signal: controller.signal,
    })
    if (!resp.ok) return { ok: false, errorCode: 'COVER_HTTP_ERROR' }
    const declaredHeader = resp.headers.get('content-length')
    const declaredSize = declaredHeader === null ? null : Number(declaredHeader)
    if (
      declaredSize !== null &&
      Number.isFinite(declaredSize) &&
      declaredSize > MAX_COVER_BYTES
    ) {
      try {
        await resp.body?.cancel()
      } catch {
        // 预拒绝结论已成立；取消失败不应把错误码改成网络错误。
      }
      return { ok: false, errorCode: 'COVER_TOO_LARGE' }
    }
    const bytes = await readBodyWithLimit(resp, controller.signal)
    if (!bytes) return { ok: false, errorCode: 'COVER_TOO_LARGE' }
    if (bytes.length === 0) {
      return { ok: false, errorCode: 'COVER_UNSUPPORTED_IMAGE' }
    }
    // 按 magic 确认确是图片（兼容 browser-id3-writer 白名单）并归一化 mime
    const mime = sniffImageMime(bytes.subarray(0, 12))
    if (!mime) return { ok: false, errorCode: 'COVER_UNSUPPORTED_IMAGE' }
    return {
      ok: true,
      cover: new Blob([bytes as BlobPart], { type: mime }),
      resolvedUrl,
    }
  } catch (error) {
    return {
      ok: false,
      errorCode:
        controller.signal.aborted || isAbortError(error)
          ? 'COVER_TIMEOUT'
          : 'COVER_NETWORK_ERROR',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function readBodyWithLimit(
  response: Response,
  signal: AbortSignal,
): Promise<Uint8Array | null> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    return bytes.length <= MAX_COVER_BYTES ? bytes : null
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      if (signal.aborted) throw new Error('cover fetch aborted')
      const { done, value } = await reader.read()
      if (done) break
      total += value.length
      if (total > MAX_COVER_BYTES) {
        try {
          await reader.cancel()
        } catch {
          // 超限结论已成立。
        }
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const out = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    out.set(chunk, offset)
    offset += chunk.length
  }
  return out
}

function isAbortError(error: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError'
  )
}
