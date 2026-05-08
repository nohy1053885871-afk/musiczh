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
      '/api': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
  },
})
