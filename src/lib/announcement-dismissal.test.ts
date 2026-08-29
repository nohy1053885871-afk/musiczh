import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dismissHomepageAnnouncement,
  isHomepageAnnouncementDismissed,
} from './announcement-dismissal'
import type { PublicHomepageAnnouncement } from './public-config'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

function announcement(
  siteHost: PublicHomepageAnnouncement['siteHost'],
  updatedAt: number,
): PublicHomepageAnnouncement {
  return { siteHost, updatedAt, message: '公告', action: null }
}

test('关闭状态只匹配同一域名的同一公告版本', () => {
  const storage = memoryStorage()
  const current = announcement('shiyinmp3.com', 100)
  dismissHomepageAnnouncement(storage, current)

  assert.equal(isHomepageAnnouncementDismissed(storage, current), true)
  assert.equal(isHomepageAnnouncementDismissed(
    storage,
    announcement('shiyinmp3.com', 101),
  ), false)
  assert.equal(isHomepageAnnouncementDismissed(
    storage,
    announcement('sleepno.cn', 100),
  ), false)
})

test('Storage 不可用时公告保持显示且关闭操作不抛错', () => {
  const current = announcement('sleepno.cn', 100)
  assert.equal(isHomepageAnnouncementDismissed(null, current), false)
  assert.doesNotThrow(() => dismissHomepageAnnouncement(null, current))
})
