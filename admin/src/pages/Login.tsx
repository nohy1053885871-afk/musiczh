import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'

export function LoginPage() {
  const { login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [u, setU] = useState('')
  const [p, setP] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!u || !p || loading) return
    setLoading(true)
    setErr('')
    try {
      await login(u, p)
      nav(loc.state?.from ?? '/', { replace: true })
    } catch (e2) {
      if (e2 instanceof ApiError && e2.status === 401) setErr('用户名或密码错误')
      else setErr('登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <form onSubmit={onSubmit} className="neumo p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-semibold" style={{ color: '#1C1A18' }}>拾音 · 运营后台</div>
          <div className="text-xs mt-1" style={{ color: '#8A8680' }}>请使用管理员账号登录</div>
        </div>
        <label className="block">
          <div className="text-xs mb-1.5" style={{ color: '#8A8680' }}>用户名</div>
          <input
            type="text"
            value={u}
            onChange={(e) => setU(e.target.value)}
            className="w-full px-3 py-2 rounded-lg outline-none text-sm"
            autoFocus
            autoComplete="username"
          />
        </label>
        <label className="block mt-4">
          <div className="text-xs mb-1.5" style={{ color: '#8A8680' }}>密码</div>
          <input
            type="password"
            value={p}
            onChange={(e) => setP(e.target.value)}
            className="w-full px-3 py-2 rounded-lg outline-none text-sm"
            autoComplete="current-password"
          />
        </label>
        {err && (
          <div className="mt-3 text-xs" style={{ color: '#B83020' }}>{err}</div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary mt-6 w-full py-2.5 rounded-lg text-sm font-medium"
        >
          {loading ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  )
}
