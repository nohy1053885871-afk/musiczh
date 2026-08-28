export const TRACKED_SITE_HOSTS = ['sleepno.cn', 'shiyinmp3.com'] as const

export type TrackedSiteHost = typeof TRACKED_SITE_HOSTS[number]

function isTrackedSiteHost(host: string): host is TrackedSiteHost {
  return TRACKED_SITE_HOSTS.some((candidate) => candidate === host)
}

export function normalizeSiteHost(raw: string | null | undefined): string | null {
  const candidate = raw?.split(',')[0]?.trim().toLowerCase() ?? ''
  if (!candidate) return null
  try {
    const hostname = new URL(`http://${candidate}`).hostname
      .replace(/^\[|\]$/g, '')
      .replace(/\.$/, '')
      .toLowerCase()
    return hostname || null
  } catch {
    return null
  }
}

export function resolveEventSiteHost(input: {
  requestHost: string | null | undefined
  forwardedHost: string | null | undefined
  trustForwardedHost: boolean
  reportedHost: string | null | undefined
}): string | null {
  const ingressHost = normalizeSiteHost(
    input.trustForwardedHost ? input.forwardedHost : input.requestHost,
  )
  if (ingressHost && isTrackedSiteHost(ingressHost)) return ingressHost

  const reportedHost = normalizeSiteHost(input.reportedHost)
  if (reportedHost && !isTrackedSiteHost(reportedHost)) return reportedHost
  return ingressHost
}
