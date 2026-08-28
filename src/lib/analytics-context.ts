export function normalizeSiteHost(raw: string | undefined): string {
  const normalized = raw?.trim().toLowerCase().replace(/\.$/, '') ?? ''
  return normalized || 'unknown'
}

export function currentSiteHost(): string {
  return normalizeSiteHost(
    typeof location === 'undefined' ? undefined : location.hostname,
  )
}
