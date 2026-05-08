# 拾音 · 加密音乐文件转 MP3

一个纯前端的加密音乐解密工具——把 **网易云 `.ncm`**、**酷狗 `.kgm` / `.vpr`** 解密还原为 MP3 / FLAC / OGG。
所有文件都在浏览器本地处理，不上传任何服务器。**永久免费，永无广告**。

🎵 在线试用：[https://sleepno.cn](https://sleepno.cn)

---

## 主要特性

- **纯前端，零上传** — AES + RC4 解密、FLAC/OGG 转码全部在浏览器内完成。
- **批量处理** — 单次最多 50 个文件，单文件 100MB 上限，支持 ZIP 打包下载。
- **保留元数据** — 自动写入 ID3 标签与专辑封面。
- **强制转 MP3** — FLAC / OGG 可一键转码（基于浏览器原生 AudioContext + lamejs）。
- **暗色拟物 UI** — 黑胶唱片旋转动画 + 中性灰拾物风格。

## 支持的格式

| 格式 | 来源 | 还原后 |
|---|---|---|
| `.ncm` | 网易云音乐客户端 | MP3 / FLAC |
| `.kgm` | 酷狗音乐客户端 | MP3 / FLAC |
| `.vpr` | 酷狗音乐 v2 | MP3 / FLAC |

## 本地开发

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建到 dist/
```

## 技术栈

React 19 · TypeScript · Tailwind CSS 4 · Vite 8 · JSZip · aes-js · browser-id3-writer · @breezystack/lamejs

## 路线图

- [x] 网易云 `.ncm`
- [x] 酷狗 `.kgm` / `.vpr` v2
- [x] FLAC / OGG 强制转 MP3
- [ ] QQ 音乐 `.qmc` / `.mflac`
- [ ] 酷我 `.kwm`
- [ ] 酷狗 KGM v4
- [ ] FLAC 文件 Vorbis Comments + PICTURE block 标签写入

## 使用须知

请仅用于处理你**合法持有**的音乐文件。本网站不对用户上传内容承担法律责任。

## License

MIT
