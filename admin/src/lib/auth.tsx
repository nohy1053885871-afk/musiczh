import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, UnauthorizedError } from './api'

type AuthState = {
  loading: boolean
  user: { uid: number; username: string } | null
  login: (u: string, p: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<AuthState['user']>(null)

  const refresh = useCallback(async () => {
    try {
      const me = await api.me()
      setUser(me)
    } catch (err) {
      if (err instanceof UnauthorizedError) setUser(null)
      else setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const login = useCallback(async (u: string, p: string) => {
    await api.login(u, p)
    await refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try { await api.logout() } catch { /* ignore */ }
    setUser(null)
  }, [])

  return <AuthCtx.Provider value={{ loading, user, login, logout }}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth must be inside AuthProvider')
  return v
}
