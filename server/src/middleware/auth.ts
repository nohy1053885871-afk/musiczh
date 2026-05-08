import type { Context, Next } from 'hono'
import { jwtVerify, SignJWT } from 'jose'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

const COOKIE_NAME = 'admin_token'
const TOKEN_TTL = 24 * 60 * 60 // 秒，1 天

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 chars')
  }
  return new TextEncoder().encode(s)
}

export async function signAdminToken(payload: { uid: number; username: string }) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL}s`)
    .sign(getSecret())
  return token
}

export function setAdminCookie(c: Context, token: string) {
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TOKEN_TTL,
  })
}

export function clearAdminCookie(c: Context) {
  deleteCookie(c, COOKIE_NAME, { path: '/' })
}

export async function requireAdmin(c: Context, next: Next) {
  const token = getCookie(c, COOKIE_NAME)
  if (!token) return c.json({ error: 'unauthorized' }, 401)
  try {
    const { payload } = await jwtVerify(token, getSecret())
    c.set('admin', payload)
    await next()
  } catch {
    return c.json({ error: 'unauthorized' }, 401)
  }
}
