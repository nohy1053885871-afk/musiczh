import type Database from 'better-sqlite3'
import db from '../db.js'

export const RESTRICTED_PAGE_VIEW = 'restricted_page_view'

export type SiteAccessEvent = typeof RESTRICTED_PAGE_VIEW

export type SiteAccessAnalytics = {
  views: number
  uniqueIps: number
}

export type SiteAccessAnalyticsStore = ReturnType<typeof createSiteAccessAnalyticsStore>

export function createSiteAccessAnalyticsStore(database: Database.Database) {
  const insert = database.prepare(
    `INSERT INTO site_access_events (ts, event, ip, ua)
     VALUES (?, ?, ?, ?)`,
  )
  const aggregate = database.prepare(
    `SELECT
       SUM(event = ?) AS views,
       COUNT(DISTINCT CASE WHEN event = ? THEN ip END) AS unique_ips
     FROM site_access_events
     WHERE ts >= ? AND ts <= ?`,
  )

  return {
    record(event: SiteAccessEvent, ip: string | null, ua: string | null) {
      insert.run(Date.now(), event, ip, ua)
    },

    summarize(from: number, to: number): SiteAccessAnalytics {
      const row = aggregate.get(
        RESTRICTED_PAGE_VIEW,
        RESTRICTED_PAGE_VIEW,
        from,
        to,
      ) as {
        views: number | null
        unique_ips: number
      }
      return {
        views: row.views ?? 0,
        uniqueIps: row.unique_ips,
      }
    },
  }
}

export const siteAccessAnalyticsStore = createSiteAccessAnalyticsStore(db)
