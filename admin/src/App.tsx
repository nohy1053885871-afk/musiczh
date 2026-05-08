import { BrowserRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { LoginPage } from './pages/Login'
import { OverviewPage } from './pages/Overview'
import { ButtonsPage } from './pages/Buttons'
import { FailuresPage } from './pages/Failures'
import { SettingsPage } from './pages/Settings'
import type { ReactNode } from 'react'

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><Layout /></RequireAuth>}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/buttons" element={<ButtonsPage />} />
            <Route path="/failures" element={<FailuresPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user } = useAuth()
  const loc = useLocation()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ color: '#8A8680' }}>
        加载中…
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

function Layout() {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen">
      {/* 顶部导航 */}
      <header
        className="sticky top-0 z-30"
        style={{ background: '#1C1A18', color: '#F4F2EE' }}
      >
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="font-semibold">拾音 · 运营后台</div>
            <nav className="flex gap-1 text-sm">
              <NavItem to="/">概览</NavItem>
              <NavItem to="/buttons">按钮埋点</NavItem>
              <NavItem to="/failures">失败日志</NavItem>
              <NavItem to="/settings">配置中心</NavItem>
            </nav>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span style={{ color: '#A0988E' }}>{user?.username}</span>
            <button
              onClick={() => logout()}
              className="px-2.5 py-1 rounded text-xs"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#F4F2EE' }}
            >
              退出
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-5 py-8">
        <PageOutlet />
      </main>
    </div>
  )
}

function NavItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        'px-3 py-1.5 rounded transition ' + (isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:text-white')
      }
    >
      {children}
    </NavLink>
  )
}

import { Outlet } from 'react-router-dom'
function PageOutlet() {
  return <Outlet />
}
