# 复盘 #14 — Cloudflare 正式域名与双构建上线（2026-08-27）

> ↩ 复盘索引：[README](README.md)
>
> 当前状态：Cloudflare 用户端 v0.8.6 已在 `shiyinmp3.com` 上线；API、运营后台、QQ 安装包迁移和 Cloudflare 访问控制策略仍待后续阶段。

## 问题边界与实现

- 阿里云域名不可用期间，需要恢复不依赖服务器的浏览器本地转换入口。
- 同一 Worker 承载 `workers.dev`、`preview.shiyinmp3.com` 与正式 `shiyinmp3.com`。
- Cloudflare 构建只关闭未迁移的 QQ 安装包下载；阿里云常规构建继续保留既有同源安装包。
- v0.8.6 已清理 SEO 宣传并开启全站禁止索引；Cloudflare 继承相同 HTML、robots 和响应头策略，不恢复 canonical、OG、JSON-LD 或 sitemap。
- R2、`/api/*`、`/admin/`、SQLite 与 Cloudflare 侧 IP 访问控制不在本次上线范围内。

## 验收证据

| 验证项 | 结果 |
|---|---|
| 双构建 | `npm run build` 与 `npm run build:cloudflare` 均通过，版本均为 v0.8.6；定向 ESLint 与 Wrangler dry-run 通过 |
| 构建级安装包边界 | 阿里云 bundle 保留 `/downloads/qq-music-v19.51-windows.zip` 且不含降级文案；Cloudflare bundle 含降级文案且不含下载路径 |
| Cloudflare 发布 | 最终 Worker 版本 `dda26c26-6064-4e81-99a1-04b809569f37`，三个入口均挂载成功 |
| 正式 HTTPS 与 noindex | 首页 200；HTML meta、robots 与 `X-Robots-Tag` 三层禁止索引；无 canonical、OG、JSON-LD 或 sitemap |
| 核心静态资源 | 主 bundle、Web Worker、KGM mask 与 LibAV WASM 均 200，WASM MIME 为 `application/wasm` |
| 下载降级交互 | 本地 1280×720 与 390×667 两个入口均显示 Toast、URL 不变、约 2 秒消失且无横向溢出 |

## 正式发布结果

- Cloudflare 最终 Worker 版本为 `dda26c26-6064-4e81-99a1-04b809569f37`，`workers.dev`、预览子域名和正式裸域名均挂载成功。
- PR [#65](https://github.com/nohy1053885871-afk/musiczh/pull/65) 在重放到最新 v0.8.6 后无冲突合并，合并提交为 `d435bd5156d70bdb7e808693a3c56ae14054f852`。
- 主分支 Actions run `32999693565` 成功；阿里云用户端常规构建完成快照、rsync、服务器目录全量校验、回环入口和限制感知公网检查，运营后台与 API 均按改动范围跳过。
- Cloudflare 公网验收确认首页、主 bundle、Web Worker、KGM mask 和 LibAV WASM 均为 200；HTML meta、robots 和响应头三层禁止索引，未恢复 v0.8.6 已移除的 SEO 宣传层。
- 正式域名已取得正确页面标题与首屏 DOM；浏览器点击控制连续超时，因此下载 Toast 的正式域名交互仍只以本地双尺寸验收和线上同 bundle 静态断言为证，不冒充公网浏览器点击通过。

## 上次 Action 回顾

- [ ] v0.8.6 的 1 小时与 24 小时访问控制观测仍待回填。
- [ ] v0.8.2 至 v0.8.5 的既有生产观测仍待回填。
- [ ] 低版本浏览器支持门槛复核仍绑定下次 Vite/Worker 架构升级。

## 上线观测与新增 Action Items

| 验证什么 | 事件 / 信号 | 期望 | 窗口 |
|---|---|---|---|
| 正式域名可达 | 首页、主 JS、Worker、WASM | 持续 200，证书与 MIME 正确 | 上线当次、24 小时 |
| 搜索索引停止 | HTML、robots、`X-Robots-Tag` | 三层均保持 noindex/noarchive | 上线当次、24 小时 |
| 核心转换连续性 | 真实文件解密、转码和普通下载 | 不依赖 API 完成 | 上线当次、24 小时 |
| 安装包降级 | `qq_download_click` 与用户反馈 | 显示 Toast，不导航到空路径 | 上线当次、7 天 |

- [x] 绑定 `shiyinmp3.com` Custom Domain。
- [x] 完成 v0.8.6 Cloudflare 最终部署和公网验收。
- [x] 完成 PR 与主分支 CI 固化。
- [ ] 创建 Cloudflare 发布标签并确认指向收尾合并提交。
- [ ] 项目主从常用网络完成正式域名真实文件转换与 Toast 点击复验。
- [ ] 第四阶段接通 API 与运营后台，并确认 Cloudflare 访问控制策略。
- [ ] 后续启用 R2、迁移 QQ 安装包并恢复 Cloudflare 下载开关。
- [ ] 增加 `www.shiyinmp3.com` 到裸域名的永久重定向。
