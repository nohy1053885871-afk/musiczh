import { useEffect, useState } from 'react'

const CONFIG_URL = '/api/config'
const CONFIG_TIMEOUT_MS = 3_000
const DEFAULT_HOMEPAGE_GUIDANCE_VISIBLE = true

export type PublicConfig = {
  homepageGuidanceVisible: boolean
}

type FetchPublicConfigOptions = {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

function isPublicConfig(value: unknown): value is PublicConfig {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { homepageGuidanceVisible?: unknown })
      .homepageGuidanceVisible === 'boolean'
  )
}

export async function fetchHomepageGuidanceVisible({
  fetchImpl = fetch,
  timeoutMs = CONFIG_TIMEOUT_MS,
}: FetchPublicConfigOptions = {}): Promise<boolean> {
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(CONFIG_URL, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) return DEFAULT_HOMEPAGE_GUIDANCE_VISIBLE

    const body: unknown = await response.json()
    if (!isPublicConfig(body)) return DEFAULT_HOMEPAGE_GUIDANCE_VISIBLE
    return body.homepageGuidanceVisible
  } catch {
    return DEFAULT_HOMEPAGE_GUIDANCE_VISIBLE
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export function useHomepageGuidanceVisible(): boolean | null {
  const [visible, setVisible] = useState<boolean | null>(null)

  useEffect(() => {
    let active = true
    void fetchHomepageGuidanceVisible().then((nextVisible) => {
      if (active) setVisible(nextVisible)
    })
    return () => {
      active = false
    }
  }, [])

  return visible
}
