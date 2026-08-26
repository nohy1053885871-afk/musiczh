import 'dotenv/config'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serve } from '@hono/node-server'

import trackRouter from './routes/track.js'
import adminAuth from './routes/adminAuth.js'
import adminStats from './routes/adminStats.js'
import adminFailures from './routes/adminFailures.js'
import adminSuccesses from './routes/adminSuccesses.js'
import adminVisitors from './routes/adminVisitors.js'
import adminUploads from './routes/adminUploads.js'
import adminDownloads from './routes/adminDownloads.js'
import adminOverview from './routes/adminOverview.js'
import adminFeatureFlags from './routes/adminFeatureFlags.js'
import publicConfig from './routes/publicConfig.js'
import adminSiteAccess from './routes/adminSiteAccess.js'
import internalSiteAccess from './routes/internalSiteAccess.js'
import { startOverviewRollupTimer } from './lib/overview/client.js'
import { rateLimit } from './middleware/ratelimit.js'
import { seedAdmin } from './seed/admin.js'
import { startRetentionCron, runRetention } from './lib/retention.js'

seedAdmin()

const app = new Hono()

// nginx auth_request 专用；放在 logger 前，避免每个静态资源产生一条 API 日志。
app.route('/internal/site-access-check', internalSiteAccess)
app.use('*', logger())

const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return ''
      if (allowedOrigins.length === 0) return origin
      return allowedOrigins.includes(origin) ? origin : ''
    },
    credentials: true,
    allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))
app.route('/api/config', publicConfig)

// 公开埋点入口（带限流）
app.use('/api/track', rateLimit)
app.route('/api/track', trackRouter)

// 管理后台 API
app.route('/api/admin', adminAuth)
app.route('/api/admin/stats', adminOverview)
app.route('/api/admin/stats', adminStats)
app.route('/api/admin/failures', adminFailures)
app.route('/api/admin/successes', adminSuccesses)
app.route('/api/admin/visitors', adminVisitors)
app.route('/api/admin/uploads', adminUploads)
app.route('/api/admin/downloads', adminDownloads)
app.route('/api/admin/feature-flags', adminFeatureFlags)
app.route('/api/admin/site-access', adminSiteAccess)

// 启动时执行一次保留策略 + 安排每日 cron
runRetention()
startRetentionCron()
startOverviewRollupTimer()

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] listening on http://127.0.0.1:${info.port}`)
})
