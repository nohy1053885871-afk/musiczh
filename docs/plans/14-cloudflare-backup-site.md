# Cloudflare 备用站与双域名实施计划

## 一、目标与现行边界

1. `shiyinmp3.com` 作为 Cloudflare 用户端、运营后台和 API 正式入口，`sleepno.cn` 继续保留阿里云原站和运营后台。
2. 音频继续完全在浏览器内处理，不上传服务器；只有埋点、配置和运营后台请求经过 API。
3. Cloudflare 必须继承 v0.8.6 的全站 `noindex, nofollow, noarchive` 决策，不恢复 canonical、OG、JSON-LD、sitemap 或 SEO 宣传资产。
4. QQ 安装包不纳入当前 Cloudflare 迁移计划，等待独立方案；Cloudflare 构建的两个入口继续显示 Toast，阿里云常规构建保留既有 `/downloads/` 安装包。
5. `/api/*` 与 `/admin/` 已接通阿里云现有 API/SQLite；R2 当前不启用。
6. 阿里云原站继续使用 nginx/IP 访问控制；Cloudflare 主站公开但禁止索引，运营数据由登录和专用源站 Token 保护。

## 二、实施阶段

### 1. 域名与账号

- [x] 注册并验证 `shiyinmp3.com`，Cloudflare zone 为 Active。
- [x] Cloudflare OAuth 账号具备 Worker、路由和证书权限。
- [ ] 确认域名自动续费。
- 账号 2FA 和恢复码由项目主自行安排，不作为本项目实施待办。
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

发布固化：PR #65 合并提交 `d435bd5156d70bdb7e808693a3c56ae14054f852`；Actions run `32999693565` 成功部署阿里云用户端常规构建并通过服务器目录、回环和限制感知检查，运营后台与 API 按预期跳过。

### 4. API 与运营后台

- [x] 创建远程管理的 Cloudflare Tunnel `musiczh-aliyun-api`，由阿里云服务器上的
  `cloudflared` 以 systemd 服务主动连接 Cloudflare，只转发专用源站域名到
  `http://127.0.0.1:8787`，不新增公网入站端口，也不依赖已失去公共 DNS 的旧域名。
- [x] 专用源站域名只接受 `X-Musiczh-Origin-Token` 与服务端环境变量的恒定时间比对；
  Token 分别保存为 Cloudflare Worker Secret、GitHub Actions Secret 和服务器 `.env`，
  不进入 git、Wrangler 明文变量、构建产物或日志。
- [x] Worker 仅对 `/api` 与 `/api/*` 先执行：删除浏览器传入的伪造转发头和跨域
  `Origin`，把 Cloudflare 识别的客户端 IP 写入受信头，流式转发请求体、Cookie 与
  `Set-Cookie`，为所有 API 响应强制 `Cache-Control: no-store`。
- [x] Cloudflare 构建在同一静态资产集合中追加运营后台到 `/admin/`；后台继续使用
  `/api` 相对路径和同源 HttpOnly Cookie，不增加第二套登录，也不复制 SQLite。
- [x] 访问控制沿用当前口径：Cloudflare 主站公开但全站禁止索引；`/admin/` 页面可达，
  管理数据必须登录；暂不启用 Cloudflare Access。阿里云原有 IP 规则与 nginx 不改。
- [x] API 代理故障时 fail closed，返回明确 502/504 且不回退 SPA；静态主站仍可完成
  浏览器本地转换。Tunnel、API 或 Worker 任一部署失败均可单独回滚。
- [ ] 验证新域名登录、配置读写、统计查询和埋点都落入原 `/www/wwwroot/musiczh-db/analytics.db`。

生产基础设施：Tunnel `musiczh-aliyun-api` 已创建并运行，ID 为
`bf7fe66e-86d3-418a-8e85-1b4f56997d98`，远程配置版本 1 只包含
`origin.shiyinmp3.com → http://127.0.0.1:8787` 与最终 404。`CLOUDFLARE_TUNNEL_TOKEN`、`CLOUDFLARE_ORIGIN_TOKEN` 和 Worker
`ORIGIN_PROXY_TOKEN` 均已写入对应密钥存储，未记录明文。

第四阶段发布固化：PR #68–#70 已合并；API run `33032104020`、Tunnel run
`33091717867` 均成功。最终 Worker 版本为
`2bd00bd4-ec9d-4b8a-be0e-31356f06b746`，正式域名 `/`、`/admin/`、`/api/health`
均为 200，专用源站匿名访问为 403。

### 5. 双域名治理与后续恢复

- [x] 增加 `www.shiyinmp3.com` 到裸域名的永久重定向：代理 A 记录指向
  `192.0.2.0`，Single Redirect 以 301 保留路径和查询参数。
- [ ] 两个站点保持同一主站版本与同一源代码提交，构建差异只允许出现在已登记的部署变量。
- [ ] QQ 安装包等待项目主确定独立方案；在此之前 Cloudflare 下载入口继续降级为 Toast，
  不启用 R2，也不恢复 Cloudflare 下载开关。

## 三、文件边界

- `vite.config.ts`：只定义 Cloudflare 构建的安装包可用性；SEO/noindex 与常规构建一致。
- `src/lib/qq-installer.ts`：集中维护安装包路径、SHA-256、构建开关、既有埋点和降级文案。
- `src/components/qq-guide.tsx`、`src/components/support-matrix.tsx`：复用统一下载处理函数。
- `src/App.tsx`：向弹窗传入既有 Toast，并使 Toast 高于弹窗遮罩。
- `wrangler.jsonc`：静态资产、SPA fallback、预览和正式 Custom Domain。
- `public/_headers`：三个 Cloudflare 入口统一返回 `X-Robots-Tag: noindex, nofollow, noarchive`。
- `worker/index.ts`：仅实现 Cloudflare `/api/*` 同源代理与响应缓存边界；不承载业务数据。
- `server/src/middleware/cloudflareOrigin.ts`：专用 Tunnel 源站 Host 的密钥鉴权和受信客户端 IP 归一化。
- `server/src/index.ts`：在 logger、CORS、限流及业务路由前挂载源站鉴权。
- `admin/vite.config.ts`：Cloudflare 模式输出到主站 `dist/admin/`，常规构建路径保持不变。
- `.github/workflows/configure-cloudflare-tunnel.yml`：使用既有 SSH 凭据安装/更新
  `cloudflared` systemd 服务并写入生产密钥，包含健康检查与失败回滚。

本阶段不改阿里云 nginx、SQLite schema/数据、现有访问控制规则、QQ 安装包或 R2。

## 四、验证清单

- [x] 常规构建版本为 v0.8.6，保留安装包路径且不含 Cloudflare 降级文案。
- [x] Cloudflare 构建版本为 v0.8.6，包含降级文案且不含安装包路径。
- [x] 两个构建均保留 HTML `noindex`、robots 全站禁止，并且没有 sitemap、OG 或 canonical。
- [x] Wrangler 配置 dry-run 通过，正式和预览 Custom Domain 同时存在。
- [x] 最新正式域名首页、主 bundle、Web Worker、KGM mask、LibAV JS/WASM 全部 200。
- [x] 正式域名 HTML、robots 和响应头三层禁止索引；公网产物没有 canonical、OG、JSON-LD 或 sitemap。
- [ ] 项目主从常用网络完成正式域名真实文件转换和 Toast 点击复验。
- [x] Worker 单元测试覆盖路径保留、方法/请求体、Cookie、伪造头清理、真实 IP、源站
  401/500、超时 504、API no-store 与非 API 静态资产委托。
- [x] API 单元测试覆盖非 Tunnel Host 不受影响、缺密钥 fail closed、错误密钥 403、
  正确密钥通过、未配置生产密钥 503、可信客户端 IP 覆盖。
- [x] Cloudflare 构建同时包含用户端和 `/admin/index.html`，且两个入口的动态资源均可解析。
- [x] 专用源站无 Token 返回 403，经 Worker 的 `/api/health` 返回 200 且 `Cache-Control: no-store`。
- [ ] 从 Cloudflare 控制台复核 Tunnel 活跃连接数量。
- [ ] 新域名登录后 `/api/admin/me`、首页配置开关读写、概览查询正常，并确认旧域名
  现有数据仍可见；退出后 Cookie 清除且管理接口恢复 401。
- [ ] 发送唯一验收埋点后在原 SQLite/后台查询到该记录，IP 为真实客户端而非 Tunnel/Worker 出口。

## 五、上线观测

| 验证什么 | 信号 | 期望 | 窗口 |
|---|---|---|---|
| 静态站可达 | 首页、主 JS、Worker、WASM | 持续 200，证书与 MIME 正确 | 上线当次、24 小时 |
| 搜索索引停止 | HTML、robots、`X-Robots-Tag` | 三层均保持 noindex/noarchive | 上线当次、24 小时 |
| 核心转换 | 真实文件解密、转码、普通下载 | 不依赖 API 完成 | 上线当次、24 小时 |
| 安装包降级 | `qq_download_click` 与用户反馈 | Toast 可见，不导航到空路径 | 上线当次、7 天 |
| 能力边界 | `/api/*`、`/admin/` | 已接通；故障时静态转换仍可用，API 不回退 SPA | 每次发布 |
| Tunnel 连通 | Tunnel status、`/api/health` | healthy，至少 2 条连接；API 200/no-store | 上线当次、24 小时 |
| 源站隔离 | 专用源站直连 | 无 Token 403，错误 Token 403 | 上线当次、每次变更 |
| 同库写入 | 唯一验收事件、后台查询、SQLite 最大 ID | 新域名事件只新增一次且旧数据连续 | 上线当次 |
| 后台会话 | login、me、overview、logout | 同源 Cookie 完整，退出后 401 | 上线当次、24 小时 |
