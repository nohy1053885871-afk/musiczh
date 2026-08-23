import type Database from 'better-sqlite3'
import db from '../db.js'

export const HOMEPAGE_GUIDANCE_FLAG_KEY = 'homepage_guidance_visible'

export type HomepageGuidanceFlag = {
  enabled: boolean
  updatedAt: number | null
}

export type FeatureFlagStore = {
  getHomepageGuidance: () => HomepageGuidanceFlag
  setHomepageGuidance: (enabled: boolean) => HomepageGuidanceFlag
}

type FeatureFlagDatabase = Pick<Database.Database, 'prepare'>

function parseHomepageGuidanceValue(value: string | undefined): boolean {
  if (value === 'false') return false
  return true
}

export function createFeatureFlagStore(
  database: FeatureFlagDatabase,
): FeatureFlagStore {
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
  }
}

export const featureFlagStore = createFeatureFlagStore(db)
