import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string
}

// 管理后台独立 vite 项目，构建输出 admin/dist/
// 部署时上传 dist/ 至 /www/wwwroot/musiczh-admin/，nginx /admin → 该目录
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  server: {
    port: 5174,
    proxy: {
      // 端口可由 ADMIN_API_PORT 环境变量覆盖（本地多 worktree 并行开发时避免 8787 端口冲突）
      // TEST-NET 地址只用于本地展示/验收当前 IP；生产由 nginx 覆盖 X-Real-IP。
      '/api': {
        target: `http://127.0.0.1:${process.env.ADMIN_API_PORT ?? 8787}`,
        headers: { 'X-Real-IP': '192.0.2.10' },
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
