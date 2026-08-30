import { analytics } from './analytics'

export type QqGuideTrigger = 'entry' | 'failure' | 'auto' | 'matrix'

// 安装包路径与 sha256（与 docs/QQ_INSTALLER_SHA256.md 同步）
export const QQ_INSTALLER_PATH = '/downloads/qq-music-v19.51-windows.zip'
export const QQ_INSTALLER_SHA256 =
  'f1e2e2e35d1ffa6caadd8dea528c4b6120c5130e73260b3a73635d30531557cb'
// 外部链接为空时：阿里云构建继续使用既有同源安装包，Cloudflare 构建失败安全为不可用。
export const QQ_INSTALLER_AVAILABLE =
  Boolean(import.meta.env?.VITE_QQ_INSTALLER_AVAILABLE)
export const QQ_INSTALLER_UNAVAILABLE_COPY = '暂不支持，敬请期待'

export type QqInstallerTarget = {
  url: string
  sha256?: string
}

function isSafeExternalUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function resolveQqInstallerTarget(
  configuredUrl: string | null,
  selfHostedAvailable = Boolean(QQ_INSTALLER_AVAILABLE),
): QqInstallerTarget | null {
  if (configuredUrl && isSafeExternalUrl(configuredUrl)) {
    return { url: configuredUrl }
  }
  if (!selfHostedAvailable) return null
  return { url: QQ_INSTALLER_PATH, sha256: QQ_INSTALLER_SHA256 }
}

export function requestQqInstallerDownload(
  trigger: QqGuideTrigger,
  configuredUrl: string | null,
  onUnavailable: (message: string) => void,
) {
  const target = resolveQqInstallerTarget(configuredUrl)
  analytics.track('qq_download_click', {
    trigger,
    sha256: target?.sha256,
  })

  if (!target) {
    onUnavailable(QQ_INSTALLER_UNAVAILABLE_COPY)
    return
  }

  window.location.href = target.url
}
