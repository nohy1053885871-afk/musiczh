export const MIGRATION_SOURCE_QUERY_KEY = 'migration_source'

export type MigrationSource = 'sleepno'

export type MigrationSourceResult = {
  source: MigrationSource | null
  cleanedRelativeUrl: string | null
}

export function readMigrationSource(
  href: string,
  allowLocalhost = false,
): MigrationSourceResult {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { source: null, cleanedRelativeUrl: null }
  }

  const isAllowedHost = url.hostname === 'shiyinmp3.com' || (
    allowLocalhost &&
    (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
  )
  const values = url.searchParams.getAll(MIGRATION_SOURCE_QUERY_KEY)
  if (!isAllowedHost || !values.includes('sleepno')) {
    return { source: null, cleanedRelativeUrl: null }
  }

  url.searchParams.delete(MIGRATION_SOURCE_QUERY_KEY)
  return {
    source: 'sleepno',
    cleanedRelativeUrl: `${url.pathname}${url.search}${url.hash}`,
  }
}
