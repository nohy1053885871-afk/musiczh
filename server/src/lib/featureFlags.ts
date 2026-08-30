import type Database from 'better-sqlite3'
import db from '../db.js'
import {
  TRACKED_SITE_HOSTS,
  type TrackedSiteHost,
} from './siteHost.js'

export const HOMEPAGE_GUIDANCE_FLAG_KEY = 'homepage_guidance_visible'
export const HOMEPAGE_ANNOUNCEMENT_KEYS: Record<TrackedSiteHost, string> = {
  'sleepno.cn': 'homepage_announcement_sleepno_cn',
  'shiyinmp3.com': 'homepage_announcement_shiyinmp3_com',
}
export const QQ_INSTALLER_LINK_KEYS: Record<TrackedSiteHost, string> = {
  'sleepno.cn': 'qq_installer_link_sleepno_cn',
  'shiyinmp3.com': 'qq_installer_link_shiyinmp3_com',
}

export type HomepageGuidanceFlag = {
  enabled: boolean
  updatedAt: number | null
}

export type HomepageAnnouncementConfig = {
  siteHost: TrackedSiteHost
  enabled: boolean
  message: string
  actionLabel: string | null
  actionUrl: string | null
  updatedAt: number | null
}

export type HomepageAnnouncementInput = Pick<
  HomepageAnnouncementConfig,
  'enabled' | 'message' | 'actionLabel' | 'actionUrl'
>

export type QqInstallerLinkConfig = {
  siteHost: TrackedSiteHost
  url: string | null
  updatedAt: number | null
}

export type QqInstallerLinkInput = Pick<QqInstallerLinkConfig, 'url'>

export type FeatureFlagStore = {
  getHomepageGuidance: () => HomepageGuidanceFlag
  setHomepageGuidance: (enabled: boolean) => HomepageGuidanceFlag
  getHomepageAnnouncement: (
    siteHost: TrackedSiteHost,
  ) => HomepageAnnouncementConfig
  listHomepageAnnouncements: () => HomepageAnnouncementConfig[]
  setHomepageAnnouncement: (
    siteHost: TrackedSiteHost,
    input: HomepageAnnouncementInput,
  ) => HomepageAnnouncementConfig
  getQqInstallerLink: (siteHost: TrackedSiteHost) => QqInstallerLinkConfig
  listQqInstallerLinks: () => QqInstallerLinkConfig[]
  setQqInstallerLink: (
    siteHost: TrackedSiteHost,
    input: QqInstallerLinkInput,
  ) => QqInstallerLinkConfig
}

type FeatureFlagDatabase = Pick<Database.Database, 'prepare'>

function parseHomepageGuidanceValue(value: string | undefined): boolean {
  if (value === 'false') return false
  return true
}

const DEFAULT_ANNOUNCEMENT: HomepageAnnouncementInput = {
  enabled: false,
  message: '',
  actionLabel: null,
  actionUrl: null,
}

export function isSafeHomepageAnnouncementUrl(value: string): boolean {
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

export function isSafeQqInstallerUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function parseQqInstallerLinkValue(raw: string | undefined): string | null {
  const value = raw?.trim() ?? ''
  if (
    value.length === 0 ||
    value.length > 2048 ||
    !isSafeQqInstallerUrl(value)
  ) return null
  return value
}

function parseHomepageAnnouncementValue(
  raw: string | undefined,
): HomepageAnnouncementInput {
  if (!raw) return DEFAULT_ANNOUNCEMENT
  try {
    const decoded: unknown = JSON.parse(raw)
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
      return DEFAULT_ANNOUNCEMENT
    }
    const parsed = decoded as Record<string, unknown>
    const message = typeof parsed.message === 'string'
      ? parsed.message.trim()
      : ''
    const actionLabel = typeof parsed.actionLabel === 'string'
      ? parsed.actionLabel.trim()
      : null
    const actionUrl = typeof parsed.actionUrl === 'string'
      ? parsed.actionUrl.trim()
      : null
    const validAction =
      actionLabel !== null &&
      actionUrl !== null &&
      actionLabel.length > 0 &&
      actionLabel.length <= 5 &&
      actionUrl.length <= 2048 &&
      isSafeHomepageAnnouncementUrl(actionUrl)

    return {
      enabled:
        parsed.enabled === true &&
        message.length > 0 &&
        message.length <= 300,
      message: message.length <= 300 ? message : '',
      actionLabel: validAction ? actionLabel : null,
      actionUrl: validAction ? actionUrl : null,
    }
  } catch {
    return DEFAULT_ANNOUNCEMENT
  }
}

export function createFeatureFlagStore(
  database: FeatureFlagDatabase,
): FeatureFlagStore {
  const getHomepageAnnouncement = (
    siteHost: TrackedSiteHost,
  ): HomepageAnnouncementConfig => {
    const row = database
      .prepare('SELECT value, updated_at FROM feature_flags WHERE key = ?')
      .get(HOMEPAGE_ANNOUNCEMENT_KEYS[siteHost]) as
      | { value: string; updated_at: number }
      | undefined
    return {
      siteHost,
      ...parseHomepageAnnouncementValue(row?.value),
      updatedAt: row?.updated_at ?? null,
    }
  }

  const getQqInstallerLink = (
    siteHost: TrackedSiteHost,
  ): QqInstallerLinkConfig => {
    const row = database
      .prepare('SELECT value, updated_at FROM feature_flags WHERE key = ?')
      .get(QQ_INSTALLER_LINK_KEYS[siteHost]) as
      | { value: string; updated_at: number }
      | undefined
    return {
      siteHost,
      url: parseQqInstallerLinkValue(row?.value),
      updatedAt: row?.updated_at ?? null,
    }
  }

  return {
    getHomepageGuidance() {
      const row = database
        .prepare('SELECT value, updated_at FROM feature_flags WHERE key = ?')
        .get(HOMEPAGE_GUIDANCE_FLAG_KEY) as
        | { value: string; updated_at: number }
        | undefined

      return {
        enabled: parseHomepageGuidanceValue(row?.value),
        updatedAt: row?.updated_at ?? null,
      }
    },

    setHomepageGuidance(enabled) {
      const updatedAt = Date.now()
      database
        .prepare(
          `INSERT INTO feature_flags (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`,
        )
        .run(
          HOMEPAGE_GUIDANCE_FLAG_KEY,
          enabled ? 'true' : 'false',
          updatedAt,
        )

      return { enabled, updatedAt }
    },

    getHomepageAnnouncement,

    listHomepageAnnouncements() {
      return TRACKED_SITE_HOSTS.map(getHomepageAnnouncement)
    },

    setHomepageAnnouncement(siteHost, input) {
      const previous = getHomepageAnnouncement(siteHost)
      const updatedAt = Math.max(Date.now(), (previous.updatedAt ?? 0) + 1)
      const normalized: HomepageAnnouncementInput = {
        enabled: input.enabled,
        message: input.message.trim(),
        actionLabel: input.actionLabel?.trim() || null,
        actionUrl: input.actionUrl?.trim() || null,
      }
      database
        .prepare(
          `INSERT INTO feature_flags (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`,
        )
        .run(
          HOMEPAGE_ANNOUNCEMENT_KEYS[siteHost],
          JSON.stringify(normalized),
          updatedAt,
        )
      return { siteHost, ...normalized, updatedAt }
    },

    getQqInstallerLink,

    listQqInstallerLinks() {
      return TRACKED_SITE_HOSTS.map(getQqInstallerLink)
    },

    setQqInstallerLink(siteHost, input) {
      const previous = getQqInstallerLink(siteHost)
      const updatedAt = Math.max(Date.now(), (previous.updatedAt ?? 0) + 1)
      const candidate = input.url?.trim() || null
      const url = candidate &&
        candidate.length <= 2048 &&
        isSafeQqInstallerUrl(candidate)
        ? candidate
        : null
      database
        .prepare(
          `INSERT INTO feature_flags (key, value, updated_at)
           VALUES (?, ?, ?)
           ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             updated_at = excluded.updated_at`,
        )
        .run(QQ_INSTALLER_LINK_KEYS[siteHost], url ?? '', updatedAt)
      return { siteHost, url, updatedAt }
    },
  }
}

export const featureFlagStore = createFeatureFlagStore(db)
