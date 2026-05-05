# 拾音 · 项目说明

加密音乐文件 → MP3/FLAC/OGG 本地转换工具，纯前端，文件全部在浏览器内处理，不上传任何服务器。

支持格式：网易云 .ncm，酷狗 .kgm / .vpr（v2，离线密钥）。
解密后可一键二次转码为 MP3（基于浏览器原生 AudioContext + lamejs，有损）。

- 线上地址：https://sleepno.cn
- GitHub：https://github.com/nohy1053885871-afk/musiczh
- 当前版本：v0.1.1

## 技术栈

- React 19 + TypeScript
- Tailwind CSS 4（@import "tailwindcss"，无需配置文件）
- Vite 8
- JSZip（打包下载）
- aes-js + browser-id3-writer（NCM 解密 + ID3 标签）
- @breezystack/lamejs（lamejs 的 ESM 维护 fork，强制转 MP3 时动态加载）

## 项目结构

```
src/
  App.tsx           # 全部 UI + 状态逻辑（单页，无路由）
  index.css         # Tailwind 入口 + vinyl-spin 动画 + color-scheme: light
  lib/
    types.ts        # 跨解密器共享类型：DecryptError / DecryptResult / AudioMeta
    decrypt.ts      # 统一入口，按扩展名分发到 ncm.ts / kgm.ts
    ncm.ts          # 网易云 NCM 解密：AES → RC4 流 → Blob + ID3
    kgm.ts          # 酷狗 KGM/VPR v2 解密：表查 + XOR；首次使用懒加载 mask
    transcode.ts    # FLAC/OGG → MP3：AudioContext 解码 + lamejs 编码
public/
  favicon.svg       # 黑胶唱片 SVG 图标
  icons.svg
  kgm-v2-mask.bin     # KGM 解密用查表（gzip 流，但不加 .gz 后缀避免 server/浏览器自动解压），1.1MB；首次 KGM 解密时拉取，浏览器缓存
```

## 核心数据结构

```typescript
type TrackedFile = {
  id: string
  file: File
  status: 'pending' | 'decrypting' | 'done' | 'failed' | 'transcoding'
  progress: number        // 0–1
  result?: DecryptResult  // { audio: Blob, format: 'mp3'|'flac'|'ogg', meta, cover, suggestedName }
  coverUrl?: string       // blob URL 或 meta.albumPic CDN 地址
  errorCode?: DecryptErrorCode
  errorMessage?: string
}
```

## 限制规则

- 单文件最大 100MB（NCM、KGM、VPR 一致）
- 列表累计最多 50 个
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
- [ ] QQ 音乐 / 酷我音乐 / 酷狗 v4 格式支持
