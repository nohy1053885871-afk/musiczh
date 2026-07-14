import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Outlet } from 'react-router-dom'
import { Layout, Menu, Button, Space, Typography } from 'antd'
import { LineChartOutlined, BarChartOutlined, FileTextOutlined, SettingOutlined, LogoutOutlined, UserOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { AuthProvider, useAuth } from './lib/auth'
import { LoginPage } from './pages/Login'
import { OverviewPage } from './pages/Overview'
import { PerformanceAnalysisPage } from './pages/PerformanceAnalysis'
import { ButtonsPage } from './pages/Buttons'
import { DecryptAnalysisPage } from './pages/DecryptAnalysis'
import { VisitorsPage } from './pages/Visitors'
import { SettingsPage } from './pages/Settings'
import type { ReactNode } from 'react'

const { Header, Content } = Layout
const { Text } = Typography

const MENU = [
  { key: '/', label: '概览', icon: <LineChartOutlined /> },
  { key: '/performance', label: '性能分析', icon: <ThunderboltOutlined /> },
  { key: '/visitors', label: '访客日志', icon: <UserOutlined /> },
  { key: '/buttons', label: '按钮埋点', icon: <BarChartOutlined /> },
  { key: '/decrypt-analysis', label: '解密分析', icon: <FileTextOutlined /> },
  { key: '/settings', label: '配置中心', icon: <SettingOutlined /> },
]

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/performance" element={<PerformanceAnalysisPage />} />
            <Route path="/visitors" element={<VisitorsPage />} />
            <Route path="/buttons" element={<ButtonsPage />} />
            <Route path="/decrypt-analysis" element={<DecryptAnalysisPage />} />
            <Route path="/failures" element={<Navigate to="/decrypt-analysis" replace />} />
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
      <div className="min-h-screen flex items-center justify-center">
        <Text type="secondary">加载中…</Text>
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return <>{children}</>
}

function AppLayout() {
  const { user, logout } = useAuth()
  const loc = useLocation()
  const nav = useNavigate()
  const selectedKey = MENU.find((m) => m.key === '/' ? loc.pathname === '/' : loc.pathname.startsWith(m.key))?.key ?? '/'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ position: 'sticky', top: 0, zIndex: 30, display: 'flex', alignItems: 'center', padding: '0 24px', background: '#001529' }}>
        <div style={{ color: '#fff', fontWeight: 600, marginRight: 32, whiteSpace: 'nowrap' }}>
          拾音 · 运营后台
        </div>
        <Menu
          mode="horizontal"
          theme="dark"
          selectedKeys={[selectedKey]}
          items={MENU}
          onClick={(e) => nav(e.key)}
          style={{ flex: 1, minWidth: 0, background: 'transparent' }}
        />
        <Space size="middle">
          <Text
            style={{
              color: 'rgba(255,255,255,0.45)',
              fontFamily: 'monospace',
              fontSize: 11,
              whiteSpace: 'nowrap',
            }}
          >
            v{import.meta.env.VITE_APP_VERSION ?? 'dev'}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.65)' }}>{user?.username}</Text>
          <Button size="small" icon={<LogoutOutlined />} onClick={() => logout()}>
            退出
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: 24, maxWidth: 1280, width: '100%', margin: '0 auto' }}>
        <Outlet />
      </Content>
    </Layout>
  )
}
