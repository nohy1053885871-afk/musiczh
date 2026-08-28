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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const cloudflareBuild = mode === 'cloudflare'

  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
      'import.meta.env.VITE_QQ_INSTALLER_AVAILABLE': JSON.stringify(
        !cloudflareBuild,
      ),
    },
    build: {
      target: ['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4'],
    },
    worker: {
      // 缺省 iife 不支持代码分割，会把三个 WASM 库（lame/flac/ogg-vorbis，各内联 base64）
      // 全部塞进 worker 主 chunk（~1MB）；es 格式保持动态 import 按需加载
      format: 'es',
    },
    server: {
      proxy: {
        // 本地并行验收可覆盖 API 端口，并固定一个文档专用测试 IP 供受限页指标验收。
        '/api': {
          target: `http://127.0.0.1:${process.env.USER_API_PORT ?? 8787}`,
          headers: { 'X-Real-IP': '192.0.2.20' },
        },
      },
    },
  }
})
