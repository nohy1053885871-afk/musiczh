import db from '../db.js'

export type BrowserCompatStatsRow = {
  browser_family: string
  detected_version: string
  required_version: string
  view_pv: number
  view_uv: number
  confirm_pv: number
  confirm_uv: number
  close_pv: number
  close_uv: number
}

export function getBrowserCompatStats(
  from: number,
  to: number,
): BrowserCompatStatsRow[] {
  return db
    .prepare(
      `SELECT COALESCE(json_extract(props,'$.browser_family'), 'unknown') AS browser_family,
              COALESCE(json_extract(props,'$.detected_version'), 'unknown') AS detected_version,
              COALESCE(json_extract(props,'$.required_version'), 'unknown') AS required_version,
              SUM(CASE WHEN event = 'dialog_browser_compat_view' THEN 1 ELSE 0 END) AS view_pv,
              COUNT(DISTINCT CASE WHEN event = 'dialog_browser_compat_view' THEN visitor_id END) AS view_uv,
              SUM(CASE WHEN event = 'dialog_browser_compat_confirm' THEN 1 ELSE 0 END) AS confirm_pv,
              COUNT(DISTINCT CASE WHEN event = 'dialog_browser_compat_confirm' THEN visitor_id END) AS confirm_uv,
              SUM(CASE WHEN event = 'dialog_browser_compat_close' THEN 1 ELSE 0 END) AS close_pv,
              COUNT(DISTINCT CASE WHEN event = 'dialog_browser_compat_close' THEN visitor_id END) AS close_uv
         FROM events
        WHERE ts >= ? AND ts <= ?
          AND event IN (
            'dialog_browser_compat_view',
            'dialog_browser_compat_confirm',
            'dialog_browser_compat_close'
          )
        GROUP BY browser_family, detected_version, required_version
        ORDER BY view_pv DESC, browser_family, detected_version`,
    )
    .all(from, to) as BrowserCompatStatsRow[]
}
