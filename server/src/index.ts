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
import { rateLimit } from './middleware/ratelimit.js'
import { seedAdmin } from './seed/admin.js'
import { startRetentionCron, runRetention } from './lib/retention.js'

seedAdmin()

const app = new Hono()
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
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
)

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }))

// 公开埋点入口（带限流）
app.use('/api/track', rateLimit)
app.route('/api/track', trackRouter)

// 管理后台 API
app.route('/api/admin', adminAuth)
app.route('/api/admin/stats', adminStats)
app.route('/api/admin/failures', adminFailures)
app.route('/api/admin/successes', adminSuccesses)
app.route('/api/admin/visitors', adminVisitors)

// 启动时执行一次保留策略 + 安排每日 cron
runRetention()
startRetentionCron()

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`[server] listening on http://127.0.0.1:${info.port}`)
})
