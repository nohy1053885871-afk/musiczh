import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// 管理后台独立 vite 项目，构建输出 admin/dist/
// 部署时上传 dist/ 至 /www/wwwroot/musiczh-admin/，nginx /admin → 该目录
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: {
      // 端口可由 ADMIN_API_PORT 环境变量覆盖（本地多 worktree 并行开发时避免 8787 端口冲突）
      '/api': `http://127.0.0.1:${process.env.ADMIN_API_PORT ?? 8787}`,
    },
  },
  build: {
    outDir: 'dist',
  },
})
