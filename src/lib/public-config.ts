import { useEffect, useState } from 'react'

const CONFIG_URL = '/api/config'
const CONFIG_TIMEOUT_MS = 3_000
const DEFAULT_HOMEPAGE_GUIDANCE_VISIBLE = true

export type PublicHomepageAnnouncement = {
  siteHost: 'sleepno.cn' | 'shiyinmp3.com'
  message: string
  action: {
    label: string
    href: string
  } | null
  updatedAt: number
}

export type PublicConfig = {
  homepageGuidanceVisible: boolean
  homepageAnnouncement: PublicHomepageAnnouncement | null
  qqInstallerUrl: string | null
}

type FetchPublicConfigOptions = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

const DEFAULT_PUBLIC_CONFIG: PublicConfig = {
  homepageGuidanceVisible: DEFAULT_HOMEPAGE_GUIDANCE_VISIBLE,
  homepageAnnouncement: null,
  qqInstallerUrl: null,
}

function safeActionUrl(value: string): boolean {
  if (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\')
  ) return true
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function parseHomepageAnnouncement(
  value: unknown,
): PublicHomepageAnnouncement | null {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (
    item.siteHost !== 'sleepno.cn' &&
    item.siteHost !== 'shiyinmp3.com'
  ) return null
  if (
    typeof item.message !== 'string' ||
    item.message.length === 0 ||
    item.message.length > 300 ||
    typeof item.updatedAt !== 'number' ||
    !Number.isSafeInteger(item.updatedAt) ||
    item.updatedAt <= 0
  ) return null

  let action: PublicHomepageAnnouncement['action'] = null
  if (typeof item.action === 'object' && item.action !== null) {
    const candidate = item.action as Record<string, unknown>
    if (
      typeof candidate.label === 'string' &&
      candidate.label.length > 0 &&
      candidate.label.length <= 5 &&
      typeof candidate.href === 'string' &&
      candidate.href.length <= 2048 &&
      safeActionUrl(candidate.href)
    ) {
      action = { label: candidate.label, href: candidate.href }
    }
  }
  return {
    siteHost: item.siteHost,
    message: item.message,
    action,
    updatedAt: item.updatedAt,
  }
}

function parseQqInstallerUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0 || value.length > 2048) {
    return null
  }
  try {
    return new URL(value).protocol === 'https:' ? value : null
  } catch {
    return null
  }
}

export async function fetchPublicConfig({
  fetchImpl = fetch,
  timeoutMs = CONFIG_TIMEOUT_MS,
}: FetchPublicConfigOptions = {}): Promise<PublicConfig> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(CONFIG_URL, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return DEFAULT_PUBLIC_CONFIG

    const body: unknown = await response.json()
    if (typeof body !== 'object' || body === null) return DEFAULT_PUBLIC_CONFIG
    const config = body as Record<string, unknown>
    if (typeof config.homepageGuidanceVisible !== 'boolean') {
      return DEFAULT_PUBLIC_CONFIG
    }
    return {
      homepageGuidanceVisible: config.homepageGuidanceVisible,
      homepageAnnouncement: parseHomepageAnnouncement(
        config.homepageAnnouncement,
      ),
      qqInstallerUrl: parseQqInstallerUrl(config.qqInstallerUrl),
    }
  } catch {
    return DEFAULT_PUBLIC_CONFIG
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export async function fetchHomepageGuidanceVisible(
  options: FetchPublicConfigOptions = {},
): Promise<boolean> {
  return (await fetchPublicConfig(options)).homepageGuidanceVisible
}

export function usePublicConfig(): PublicConfig | null {
  const [config, setConfig] = useState<PublicConfig | null>(null)

  useEffect(() => {
    let active = true
    void fetchPublicConfig().then((nextConfig) => {
      if (active) setConfig(nextConfig)
    })
    return () => {
      active = false
    }
  }, [])

  return config
}
