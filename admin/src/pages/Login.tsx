import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Card, Form, Input, Button, Typography, Alert } from 'antd'
import { UserOutlined, LockOutlined } from '@ant-design/icons'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'

const { Title, Text } = Typography

export function LoginPage() {
  const { login } = useAuth()
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const onFinish = async ({ username, password }: { username: string; password: string }) => {
    setLoading(true)
    setErr('')
    try {
      await login(username, password)
      nav(loc.state?.from ?? '/', { replace: true })
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setErr('用户名或密码错误')
      else setErr('登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: '#F5F5F5' }}>
      <Card style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <Title level={4} style={{ margin: 0 }}>拾音 · 运营后台</Title>
          <Text type="secondary" style={{ fontSize: 12 }}>请使用管理员账号登录</Text>
        </div>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" autoFocus />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" />
          </Form.Item>
          {err && <Alert type="error" message={err} style={{ marginBottom: 16 }} showIcon />}
          <Button type="primary" htmlType="submit" block loading={loading}>登录</Button>
        </Form>
      </Card>
    </div>
  )
}
