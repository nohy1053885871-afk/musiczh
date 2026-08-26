import { Hono, type Context } from 'hono'
import { z } from 'zod'
import {
  siteAccessStore,
  type SiteAccessStore,
} from '../lib/siteAccess.js'
import { requireAdmin } from '../middleware/auth.js'
import {
  getTrustedClientIp,
  siteAccessErrorResponse,
} from './siteAccessShared.js'

const NoteSchema = z.string().max(64).nullable()

const CreateRuleSchema = z
  .object({
    address: z.string().min(1).max(64),
    rule: z.enum(['allow', 'deny']),
    note: NoteSchema.optional(),
  })
  .strict()

const UpdateRuleSchema = z
  .object({
    rule: z.enum(['allow', 'deny']).optional(),
    note: NoteSchema.optional(),
    confirmCurrentIp: z.boolean().optional(),
  })
  .strict()
  .refine((body) => body.rule !== undefined || body.note !== undefined, {
    message: 'rule_or_note_required',
  })

const UpdateModeSchema = z.object({ enabled: z.boolean() }).strict()

async function parseBody(c: Context) {
  try {
    return { ok: true as const, body: await c.req.json() as unknown }
  } catch {
    return { ok: false as const }
  }
}

function parseRuleId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

export function createAdminSiteAccessRouter(
  store: SiteAccessStore = siteAccessStore,
) {
  const router = new Hono()
  router.use('*', requireAdmin)

  router.get('/', (c) => c.json(store.snapshot(getTrustedClientIp(c))))

  router.post('/ip-rules/current', (c) => {
    try {
      return c.json(store.ensureCurrentIp(getTrustedClientIp(c)))
    } catch (error) {
      return siteAccessErrorResponse(c, error)
    }
  })

  router.post('/ip-rules', async (c) => {
    const input = await parseBody(c)
    if (!input.ok) return c.json({ error: 'invalid_json' }, 400)
    const parsed = CreateRuleSchema.safeParse(input.body)
    if (!parsed.success) {
      return c.json({ error: 'invalid_payload', detail: parsed.error.issues }, 400)
    }
    try {
      const data = parsed.data
      return c.json(
        store.createRule(
          data.address,
          data.rule,
          data.note ?? null,
          getTrustedClientIp(c),
        ),
        201,
      )
    } catch (error) {
      return siteAccessErrorResponse(c, error)
    }
  })

  router.patch('/ip-rules/:id', async (c) => {
    const id = parseRuleId(c.req.param('id'))
    if (id === null) return c.json({ error: 'invalid_rule_id' }, 400)
    const input = await parseBody(c)
    if (!input.ok) return c.json({ error: 'invalid_json' }, 400)
    const parsed = UpdateRuleSchema.safeParse(input.body)
    if (!parsed.success) {
      return c.json({ error: 'invalid_payload', detail: parsed.error.issues }, 400)
    }
    try {
      return c.json(store.updateRule(id, parsed.data, getTrustedClientIp(c)))
    } catch (error) {
      return siteAccessErrorResponse(c, error)
    }
  })

  router.delete('/ip-rules/:id', (c) => {
    const id = parseRuleId(c.req.param('id'))
    if (id === null) return c.json({ error: 'invalid_rule_id' }, 400)
    try {
      return c.json(store.deleteRule(id, getTrustedClientIp(c)))
    } catch (error) {
      return siteAccessErrorResponse(c, error)
    }
  })

  router.put('/mode', async (c) => {
    const input = await parseBody(c)
    if (!input.ok) return c.json({ error: 'invalid_json' }, 400)
    const parsed = UpdateModeSchema.safeParse(input.body)
    if (!parsed.success) {
      return c.json({ error: 'invalid_payload', detail: parsed.error.issues }, 400)
    }
    try {
      return c.json(store.setMode(parsed.data.enabled, getTrustedClientIp(c)))
    } catch (error) {
      return siteAccessErrorResponse(c, error)
    }
  })

  return router
}

export default createAdminSiteAccessRouter()
