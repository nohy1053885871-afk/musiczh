# 拾音 · 项目说明

NCM → MP3/FLAC 转换工具，纯前端，文件全部在浏览器本地处理，不上传任何服务器。

- 线上地址：https://sleepno.cn
- GitHub：https://github.com/nohy1053885871-afk/musiczh
- 当前版本：v0.1

## 技术栈

- React 19 + TypeScript
- Tailwind CSS 4（@import "tailwindcss"，无需配置文件）
- Vite 8
- JSZip（打包下载）、aes-js + browser-id3-writer（NCM 解密 + ID3 标签）

## 项目结构

```
src/
  App.tsx       # 全部 UI + 状态逻辑（单页，无路由）
  index.css     # Tailwind 入口 + vinyl-spin 动画 + color-scheme: light
  lib/
    ncm.ts      # NCM 解密核心：AES 解密 → RC4 流解密 → Blob + ID3 写入
public/
  favicon.svg   # 黑胶唱片 SVG 图标
```

## 核心数据结构

```typescript
type TrackedFile = {
  id: string
  file: File
  status: 'pending' | 'decrypting' | 'done' | 'failed'
  progress: number        // 0–1
  result?: DecryptResult  // { audio: Blob, format: 'mp3'|'flac', meta: NcmMeta, cover: Blob|null, suggestedName: string }
  coverUrl?: string       // blob URL 或 meta.albumPic CDN 地址
  errorCode?: NcmErrorCode
  errorMessage?: string
}
```

## 限制规则

- 单文件最大 100MB
- 列表累计最多 50 个（不是单次，是总量上限）
- 超限时 warning 横幅 5 秒自动消失

## 常用命令

```bash
npm run dev      # 本地开发，http://localhost:5173
npm run build    # 生产构建，产物在 dist/
```

## 部署

- 服务器：阿里云 ECS，宝塔面板管理
- 网站根目录：/www/wwwroot/musiczh
- 每次部署：npm run build → 压缩 dist/ → 宝塔文件管理器上传解压

## 设计规范

暖色纸质拟物风格，详见本地 DEPLOY.md 中的 DESIGN_SPEC 部分。

- 主色：`#C8662C → #7B3A14`（琥珀渐变）
- 背景：`#F4EAD5`（米黄纸质）
- 圆角：大卡片 `rounded-3xl`，列表行 `rounded-2xl`，按钮 `rounded-xl`
- 黑胶唱片旋转动画：`vinyl-spin`（4s）/ `vinyl-spin-fast`（1.6s，列表迷你盘）
- 强制亮色：`color-scheme: light`（防止浏览器强制深色模式）

## 待做事项

- [ ] CI/CD：GitHub Actions 自动构建 + rsync 部署到服务器
- [ ] FLAC 文件 Vorbis Comments + PICTURE block 标签写入
- [ ] 移动端适配优化
- [ ] 合规弹窗：首次访问"使用须知"
- [ ] QQ 音乐 / 酷我音乐格式支持
