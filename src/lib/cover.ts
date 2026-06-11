/**
 * 远程封面抓取（best-effort）
 *
 * 新版网易云 NCM 不再内嵌封面图，封面只存在于元数据的 albumPic CDN 链接里。
 * 解密产物无内嵌封面但有 albumPic 时，主线程在【解密计时窗口之外】抓这张图回填嵌入。
 * 实测网易云图片 CDN（p3.music.126.net）支持 https + 返回 Access-Control-Allow-Origin:*，
 * 纯前端可跨域抓取——只取公开封面图、绝不上传用户音频。
 *
 * 任何失败（超时 / 网络 / CORS / 非图片 / 过大）都返回 null：封面是锦上添花，绝不影响主流程。
 */

import { sniffImageMime } from './sniff'

const DEFAULT_TIMEOUT_MS = 8000
const MAX_COVER_BYTES = 8 * 1024 * 1024 // 封面图体积上限（实测 albumPic ~350KB）

/** 把 http:// 升级成 https://，避免 https 站点对混合内容的拦截 */
export function upgradeToHttps(url: string): string {
  return url.replace(/^http:\/\//i, 'https://')
}

/**
 * 抓远程封面，失败一律返回 null（绝不抛）。
 * 仅接受图片响应，并按 magic 把 mime 归一化到标准值（CDN 常返回非标准的 image/jpg）。
 */
export async function fetchRemoteCover(
  url: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Blob | null> {
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(upgradeToHttps(url), {
      mode: 'cors',
      signal: controller.signal,
    })
    if (!resp.ok) return null
    const ct = resp.headers.get('content-type') || ''
    if (ct && !ct.startsWith('image/')) return null
    const blob = await resp.blob()
    if (blob.size === 0 || blob.size > MAX_COVER_BYTES) return null
    // 按 magic 确认确是图片（兼容 browser-id3-writer 白名单）并归一化 mime
    const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer())
    const mime = sniffImageMime(head)
    if (!mime) return null
    return blob.type === mime ? blob : blob.slice(0, blob.size, mime)
  } catch {
    return null // 超时 / 网络 / CORS / abort 一律静默
  } finally {
    clearTimeout(timer)
  }
}
