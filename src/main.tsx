import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { analytics } from './lib/analytics'
import { readMigrationSource } from './lib/migration-source'

analytics.init()
const migration = readMigrationSource(
  window.location.href,
  import.meta.env.DEV,
)
analytics.pageview(
  migration.source ? { migration_source: migration.source } : undefined,
)
if (migration.cleanedRelativeUrl) {
  window.history.replaceState(
    window.history.state,
    '',
    migration.cleanedRelativeUrl,
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
