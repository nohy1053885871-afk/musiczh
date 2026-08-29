import { TRACKED_SITE_HOSTS } from './siteHost.js'

function isInternalSiteHost(host: string): boolean {
  return TRACKED_SITE_HOSTS.some((siteHost) =>
    host === siteHost || host.endsWith(`.${siteHost}`),
  )
}

export function classifyChannel(referrer: string | null): string {
  if (!referrer) return '直接访问'
  let host = ''
  try {
    host = new URL(referrer).hostname.toLowerCase()
  } catch {
    return '其他'
  }
  if (isInternalSiteHost(host)) return '站内'
  if (/(google|baidu|bing|sogou|so\.com|duckduckgo|yandex|yahoo)\./i.test(host)) {
    return '搜索引擎'
  }
  if (/(weibo|twitter|x\.com|facebook|qq\.com|wx|reddit|mp\.weixin|zhihu|douyin|bilibili)/i.test(host)) {
    return '社交'
  }
  return '外部网站'
}
