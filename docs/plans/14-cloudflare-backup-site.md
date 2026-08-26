# Cloudflare 备用站与双域名实施计划

## 一、目标与现行边界

1. `shiyinmp3.com` 作为 Cloudflare 用户端正式入口，`sleepno.cn` 继续保留阿里云原站和运营后台。
2. Cloudflare 当前只承载用户端静态资源；音频继续完全在浏览器内处理，不上传服务器。
3. Cloudflare 必须继承 v0.8.6 的全站 `noindex, nofollow, noarchive` 决策，不恢复 canonical、OG、JSON-LD、sitemap 或 SEO 宣传资产。
4. QQ 安装包暂不迁移：Cloudflare 构建的两个入口显示 Toast；阿里云常规构建继续使用既有 `/downloads/` 安装包。
5. `/api/*`、`/admin/`、SQLite 和 R2 不在本阶段迁移范围内，不得把缺失能力表述为已接通。
6. 阿里云 v0.8.6 的 IP 访问控制位于其 nginx/API 链路，Cloudflare 静态站当前不受该白名单限制；Cloudflare 当前是公开可达但禁止索引的独立入口。

## 二、实施阶段

### 1. 域名与账号

- [x] 注册并验证 `shiyinmp3.com`，Cloudflare zone 为 Active。
- [x] Cloudflare OAuth 账号具备 Worker、路由和证书权限。
- [ ] 确认自动续费、2FA 和恢复码。
- [ ] 将数据库备份与安装包复制到阿里云以外的独立位置。

### 2. Workers Static Assets 预览站

- [x] 增加 `build:cloudflare`、dry-run、预览和部署命令。
- [x] 增加 Workers Static Assets 配置、SPA fallback 和 `preview.shiyinmp3.com`。
- [x] `workers.dev` 与预览子域名完成首页、动态分包、Web Worker、KGM mask 和 LibAV WASM smoke。
- [x] 项目主用真实文件完成浏览器内转换与普通下载；Agent 独立校验解密/转码输出 magic 与 SHA-256。

### 3. 安装包降级与正式域名

- [x] 两个下载入口共用单一处理函数和既有 `qq_download_click` 事件。
- [x] Cloudflare 构建移除安装包导航并显示 Toast「暂不支持，敬请期待」。
- [x] 阿里云常规构建保留既有安装包路径，不被 Cloudflare 降级误伤。
- [x] 本地 1280×720 与 390×667 验证两个入口、Toast 层级、2 秒消失、URL 不变和无横向溢出。
- [x] 将 `shiyinmp3.com` 作为 Custom Domain 绑定到同一 Worker，同时保留预览入口。
- [x] 将最新 v0.8.6 Cloudflare 构建部署到三个入口并完成公网回归。

最终 Worker 版本：`dda26c26-6064-4e81-99a1-04b809569f37`。正式域名、预览子域名和 `workers.dev` 使用同一版本。

### 4. API 与运营后台

- [ ] 通过 Cloudflare Tunnel 或等价私有通道转发阿里云 `/api/*`，禁止缓存并保留真实客户端信息。
- [ ] 将运营后台静态产物接入 `/admin/`，验证登录、配置、查询和原 `analytics.db`。
- [ ] 明确 Cloudflare 访问控制策略：保持公开、Cloudflare Access，或同步阿里云 IP 规则；实施前由项目主确认。

### 5. 双域名治理与后续恢复

- [ ] 增加 `www.shiyinmp3.com` 到裸域名的永久重定向。
- [ ] 两个站点保持同一主站版本与同一源代码提交，构建差异只允许出现在已登记的部署变量。
- [ ] 后续启用 R2、迁移安装包、核对 109,617,070 字节及 SHA-256 `f1e2e2e35d1ffa6caadd8dea528c4b6120c5130e73260b3a73635d30531557cb` 后恢复 Cloudflare 下载。

## 三、文件边界

- `vite.config.ts`：只定义 Cloudflare 构建的安装包可用性；SEO/noindex 与常规构建一致。
- `src/lib/qq-installer.ts`：集中维护安装包路径、SHA-256、构建开关、既有埋点和降级文案。
- `src/components/qq-guide.tsx`、`src/components/support-matrix.tsx`：复用统一下载处理函数。
- `src/App.tsx`：向弹窗传入既有 Toast，并使 Toast 高于弹窗遮罩。
- `wrangler.jsonc`：静态资产、SPA fallback、预览和正式 Custom Domain。
- `public/_headers`：三个 Cloudflare 入口统一返回 `X-Robots-Tag: noindex, nofollow, noarchive`。

本阶段不改 `server/**`、`admin/**`、阿里云 nginx、SQLite 数据、现有访问控制规则或 R2。

## 四、验证清单

- [x] 常规构建版本为 v0.8.6，保留安装包路径且不含 Cloudflare 降级文案。
- [x] Cloudflare 构建版本为 v0.8.6，包含降级文案且不含安装包路径。
- [x] 两个构建均保留 HTML `noindex`、robots 全站禁止，并且没有 sitemap、OG 或 canonical。
- [x] Wrangler 配置 dry-run 通过，正式和预览 Custom Domain 同时存在。
- [x] 最新正式域名首页、主 bundle、Web Worker、KGM mask、LibAV JS/WASM 全部 200。
- [x] 正式域名 HTML、robots 和响应头三层禁止索引；公网产物没有 canonical、OG、JSON-LD 或 sitemap。
- [ ] 项目主从常用网络完成正式域名真实文件转换和 Toast 点击复验。

## 五、上线观测

| 验证什么 | 信号 | 期望 | 窗口 |
|---|---|---|---|
| 静态站可达 | 首页、主 JS、Worker、WASM | 持续 200，证书与 MIME 正确 | 上线当次、24 小时 |
| 搜索索引停止 | HTML、robots、`X-Robots-Tag` | 三层均保持 noindex/noarchive | 上线当次、24 小时 |
| 核心转换 | 真实文件解密、转码、普通下载 | 不依赖 API 完成 | 上线当次、24 小时 |
| 安装包降级 | `qq_download_click` 与用户反馈 | Toast 可见，不导航到空路径 | 上线当次、7 天 |
| 能力边界 | `/api/*`、`/admin/` | 未接通时不影响核心转换，也不宣称可用 | 每次发布 |
