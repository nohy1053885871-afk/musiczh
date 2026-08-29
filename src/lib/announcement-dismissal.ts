import type { PublicHomepageAnnouncement } from './public-config'

type AnnouncementStorage = Pick<Storage, 'getItem' | 'setItem'>

function storageKey(siteHost: PublicHomepageAnnouncement['siteHost']): string {
  return `_musiczh_homepage_announcement_dismissed_${siteHost}`
}

export function isHomepageAnnouncementDismissed(
  storage: AnnouncementStorage | null,
  announcement: PublicHomepageAnnouncement,
): boolean {
  if (!storage) return false
  try {
    return storage.getItem(storageKey(announcement.siteHost)) ===
      String(announcement.updatedAt)
  } catch {
    return false
  }
}

export function dismissHomepageAnnouncement(
  storage: AnnouncementStorage | null,
  announcement: PublicHomepageAnnouncement,
): void {
  if (!storage) return
  try {
    storage.setItem(
      storageKey(announcement.siteHost),
      String(announcement.updatedAt),
    )
  } catch {
    // Storage 被禁用时仍由组件内存状态隐藏到本次页面结束。
  }
}

export function browserAnnouncementStorage(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}
