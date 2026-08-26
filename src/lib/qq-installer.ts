import { analytics } from './analytics'

export type QqGuideTrigger = 'entry' | 'failure' | 'auto' | 'matrix'

// 安装包路径与 sha256（与 docs/QQ_INSTALLER_SHA256.md 同步）
export const QQ_INSTALLER_PATH = '/downloads/qq-music-v19.51-windows.zip'
export const QQ_INSTALLER_SHA256 =
  'f1e2e2e35d1ffa6caadd8dea528c4b6120c5130e73260b3a73635d30531557cb'
// 阿里云构建继续使用既有同源安装包；Cloudflare 构建在 R2 迁移前关闭跳转。
export const QQ_INSTALLER_AVAILABLE =
  import.meta.env.VITE_QQ_INSTALLER_AVAILABLE
export const QQ_INSTALLER_UNAVAILABLE_COPY = '暂不支持，敬请期待'

export function requestQqInstallerDownload(
  trigger: QqGuideTrigger,
  onUnavailable: (message: string) => void,
) {
  analytics.track('qq_download_click', {
    trigger,
    sha256: QQ_INSTALLER_SHA256,
  })

  if (!QQ_INSTALLER_AVAILABLE) {
    onUnavailable(QQ_INSTALLER_UNAVAILABLE_COPY)
    return
  }

  // 安装包恢复托管后只需开启上方开关；浏览器继续按 path 触发原生下载。
  window.location.href = QQ_INSTALLER_PATH
}
