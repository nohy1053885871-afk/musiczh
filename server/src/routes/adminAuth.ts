import { Hono } from 'hono'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import db from '../db.js'
import {
  signAdminToken,
  setAdminCookie,
  clearAdminCookie,
  requireAdmin,
} from '../middleware/auth.js'

const LoginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(256),
})

const adminAuth = new Hono()

adminAuth.post('/login', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }
  const parsed = LoginSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'invalid_payload' }, 400)
  const { username, password } = parsed.data

  const row = db
    .prepare('SELECT id, password_hash FROM admins WHERE username = ?')
    .get(username) as { id: number; password_hash: string } | undefined

  if (!row) return c.json({ error: 'invalid_credentials' }, 401)
  const ok = bcrypt.compareSync(password, row.password_hash)
  if (!ok) return c.json({ error: 'invalid_credentials' }, 401)

  db.prepare('UPDATE admins SET last_login_at = ? WHERE id = ?').run(Date.now(), row.id)

  const token = await signAdminToken({ uid: row.id, username })
  setAdminCookie(c, token)
  return c.json({ ok: true, username })
})

adminAuth.post('/logout', requireAdmin, (c) => {
  clearAdminCookie(c)
  return c.json({ ok: true })
})

adminAuth.get('/me', requireAdmin, (c) => {
  const admin = (c as any).get('admin') as { uid: number; username: string }
  return c.json({ uid: admin.uid, username: admin.username })
})

export default adminAuth
