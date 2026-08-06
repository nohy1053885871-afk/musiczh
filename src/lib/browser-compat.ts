export const BROWSER_MINIMUM_VERSIONS = {
  chromium: '111',
  edge: '111',
  firefox: '114',
  safari: '16.4',
  ios_webkit: '16.4',
} as const

export type SupportedBrowserFamily = keyof typeof BROWSER_MINIMUM_VERSIONS
export type BrowserFamily = SupportedBrowserFamily | 'unknown'
export type BrowserCompatibilityStatus = 'supported' | 'unsupported' | 'unknown'

export type BrowserCompatibility = {
  status: BrowserCompatibilityStatus
  family: BrowserFamily
  detectedVersion?: string
  requiredVersion?: string
}

export type BrowserNavigatorInfo = {
  userAgent?: string
  platform?: string
  maxTouchPoints?: number
  userAgentData?: {
    brands?: readonly { brand: string; version: string }[]
  }
}

function normalizeVersion(raw: string | undefined): string | null {
  if (!raw) return null
  const normalized = raw.replaceAll('_', '.')
  if (!/^\d+(?:\.\d+)*$/.test(normalized)) return null
  return normalized
    .split('.')
    .map((part) => String(Number.parseInt(part, 10)))
    .join('.')
}

export function compareBrowserVersions(left: string, right: string): number | null {
  const leftVersion = normalizeVersion(left)
  const rightVersion = normalizeVersion(right)
  if (!leftVersion || !rightVersion) return null

  const leftParts = leftVersion.split('.').map(Number)
  const rightParts = rightVersion.split('.').map(Number)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) return delta > 0 ? 1 : -1
  }
  return 0
}

function evaluateKnownBrowser(
  family: SupportedBrowserFamily,
  rawVersion: string | undefined,
): BrowserCompatibility {
  const requiredVersion = BROWSER_MINIMUM_VERSIONS[family]
  const detectedVersion = normalizeVersion(rawVersion)
  if (!detectedVersion) return { status: 'unknown', family, requiredVersion }

  const comparison = compareBrowserVersions(detectedVersion, requiredVersion)
  if (comparison === null) return { status: 'unknown', family, requiredVersion }
  return {
    status: comparison >= 0 ? 'supported' : 'unsupported',
    family,
    detectedVersion,
    requiredVersion,
  }
}

function extractVersion(userAgent: string, pattern: RegExp): string | undefined {
  return userAgent.match(pattern)?.[1]
}

function detectIosWebKit(info: BrowserNavigatorInfo): BrowserCompatibility | null {
  const userAgent = info.userAgent ?? ''
  const isIosDevice = /iPhone|iPad|iPod/i.test(userAgent)
  const isDesktopModeIpad =
    (info.platform === 'MacIntel' && (info.maxTouchPoints ?? 0) > 1) ||
    (/Macintosh/i.test(userAgent) && /Mobile\//i.test(userAgent))
  if (!isIosDevice && !isDesktopModeIpad) return null

  const osVersion = extractVersion(userAgent, /(?:CPU(?: iPhone)? OS|iPhone OS|OS) ([0-9_]+)/i)
  const safariVersion = extractVersion(userAgent, /Version\/([0-9.]+)/i)
  return evaluateKnownBrowser('ios_webkit', osVersion ?? safariVersion)
}

function detectFromBrands(info: BrowserNavigatorInfo): BrowserCompatibility | null {
  const brands = info.userAgentData?.brands ?? []
  const edge = brands.find((item) => /Microsoft Edge/i.test(item.brand))
  if (edge) return evaluateKnownBrowser('edge', edge.version)

  const chromium = brands.find((item) => /Google Chrome|Chromium/i.test(item.brand))
  return chromium ? evaluateKnownBrowser('chromium', chromium.version) : null
}

export function detectBrowserCompatibility(
  info: BrowserNavigatorInfo = typeof navigator === 'undefined'
    ? {}
    : {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
        userAgentData: (navigator as Navigator & {
          userAgentData?: BrowserNavigatorInfo['userAgentData']
        }).userAgentData,
      },
): BrowserCompatibility {
  const ios = detectIosWebKit(info)
  if (ios) return ios

  const fromBrands = detectFromBrands(info)
  if (fromBrands) return fromBrands

  const userAgent = info.userAgent ?? ''
  const edgeVersion = extractVersion(userAgent, /Edg(?:A|iOS)?\/([0-9.]+)/i)
  if (edgeVersion) return evaluateKnownBrowser('edge', edgeVersion)

  const firefoxVersion = extractVersion(userAgent, /Firefox\/([0-9.]+)/i)
  if (firefoxVersion) return evaluateKnownBrowser('firefox', firefoxVersion)

  const chromiumVersion = extractVersion(userAgent, /(?:HeadlessChrome|Chrome|Chromium)\/([0-9.]+)/i)
  if (chromiumVersion) return evaluateKnownBrowser('chromium', chromiumVersion)

  if (/Safari\//i.test(userAgent)) {
    const safariVersion = extractVersion(userAgent, /Version\/([0-9.]+)/i)
    if (safariVersion) return evaluateKnownBrowser('safari', safariVersion)
  }

  return { status: 'unknown', family: 'unknown' }
}
