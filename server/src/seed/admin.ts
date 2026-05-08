import db from '../db.js'

export function seedAdmin() {
  const username = process.env.ADMIN_USERNAME
  const passwordHash = process.env.ADMIN_PASSWORD_HASH
  if (!username || !passwordHash) {
    console.warn('[seedAdmin] ADMIN_USERNAME / ADMIN_PASSWORD_HASH not set, skip seeding')
    return
  }
  const existing = db.prepare('SELECT id FROM admins WHERE username = ?').get(username) as
    | { id: number }
    | undefined
  if (existing) {
    db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(passwordHash, existing.id)
    console.log(`[seedAdmin] admin "${username}" password_hash refreshed (id=${existing.id})`)
  } else {
    const r = db
      .prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)')
      .run(username, passwordHash)
    console.log(`[seedAdmin] admin "${username}" created (id=${r.lastInsertRowid})`)
  }
}
