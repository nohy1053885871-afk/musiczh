# 复盘 #15 — Cloudflare API、运营后台与阿里云 Tunnel 上线（2026-08-28）

> ↩ 复盘索引：[README](README.md)
>
> 当前状态：Cloudflare 用户端 v0.8.7、运营后台 v0.4.19、API v0.4.12 已在
> `shiyinmp3.com` 上线；API 与 `sleepno.cn` 共用阿里云上的同一服务和 SQLite。

## 问题边界与实现

- Cloudflare Worker 只代理 `/api` 与 `/api/*`；其他请求继续交给 Static Assets，
  `/admin/` 使用同一份 Cloudflare 静态部署。
- Worker 删除浏览器伪造的源站 Token、客户端 IP、`Origin` 和转发头，只把
  Cloudflare 提供的真实客户端 IP 和 Worker Secret 写给专用源站。
- 阿里云 API 只在 `origin.shiyinmp3.com` 上启用恒定时间 Token 校验；旧域名链路
  不经过该门禁，因此双域名可以并行。
- Tunnel 由阿里云上的 `cloudflared` 主动出站连接，不增加公网入站端口；远程 ingress
  只允许专用源站进入 `127.0.0.1:8787`，最终规则返回 404。
- 后台继续使用相对 `/api` 与同源 HttpOnly Cookie；没有新增账号、数据库或数据同步层。
- QQ 安装包不纳入当前 Cloudflare 迁移计划，等待独立方案；Cloudflare 构建继续显示
  “暂不支持，敬请期待”。

## 验收证据

| 验证项 | 结果 |
|---|---|
| 自动测试 | Worker 代理 6/6、源站鉴权 5/5、访问控制 8/8、feature flags 6/6、public config 4/4 |
| 构建与静态边界 | 用户端、后台、API 构建通过；Cloudflare 双前端构建和 Wrangler dry-run 通过，共 34 个静态资源 |
| 阿里云生产部署 | run `33031971187` 完成用户端 v0.8.7、后台 v0.4.19；run `33032104020` 完成 API v0.4.12 |
| Tunnel 部署 | run `33091717867` 在 39 秒内完成架构检测、双重 SHA-256 校验、SCP 上传、systemd 启动和授权/匿名健康检查 |
| Worker 发布 | 版本 `2bd00bd4-ec9d-4b8a-be0e-31356f06b746` 同时挂载正式、预览和 workers.dev 三个入口 |
| 公网 API | `/api/health` 200 且 `ok: true`；`/api/config` 200 且读取现有值 `homepageGuidanceVisible: false`；全部 `no-store` |
| 源站与会话边界 | 专用源站匿名请求 403；新域名未登录 `/api/admin/me` 返回 401 |
| 静态入口 | 正式域名 `/` 与 `/admin/` 均返回 200 HTML |
| `www` 别名 | 代理 A 记录已生效；首页和 `/admin/?source=redirect-check` 均返回一次 301，保留路径/查询参数后最终 200 |

## 正式发布与故障复盘

- PR [#68](https://github.com/nohy1053885871-afk/musiczh/pull/68) 合并提交
  `a1b36ef831282edbb892434fb30f1cf8fc4ad056` 完成 API、后台、Worker 和 Tunnel 基础实现；
  main 验证 run `33031971225` 两个 job 全部通过。
- 第一轮 Tunnel 安装因 SSH 空闲连接断开而以 255 回滚；PR #69 增加 SSH keepalive。
- 第二轮确认阿里云直连 GitHub Release 在 48 分 39 秒后被对端重置，`curl` 返回 56；
  回滚恢复 API `.env`、二进制与 systemd 文件，并重启原 `musiczh-api` 进程。
- PR [#70](https://github.com/nohy1053885871-afk/musiczh/pull/70) 改为 GitHub Actions
  下载和校验二进制，再经 SCP 上传；服务器安装前按自身架构二次校验，最终一次成功。
- 归档标签 `cloudflare-v0.8.7` 与 `api-v0.4.12` 均指向本次收尾合并提交；没有使用会触发
  全端部署的通用 `v*` 标签。

## 上次 Action 回顾

- [x] 完成第四阶段 API 与运营后台接通，保持阿里云原 API/SQLite 为唯一数据源。
- [x] 专用源站无 Token 返回 403，经 Worker 的健康检查返回 200/no-store。
- [x] Cloudflare 双前端包含用户端和 `/admin/`，API 故障不会回退 SPA。
- [ ] 项目主从常用网络完成正式域名真实文件转换与 QQ 下载 Toast 点击复验。
- [ ] 旧版本的 24 小时与 7 天生产观测仍待按原复盘口径回填。

## 上线观测与新增 Action Items

| 验证什么 | 事件 / 信号 | 期望 | 窗口 |
|---|---|---|---|
| Tunnel 连续性 | systemd、Tunnel 连接、`/api/health` | 持续 active，API 200/no-store | 上线当次、24 小时 |
| 源站隔离 | 专用源站匿名/错误 Token 请求 | 始终 403，不暴露业务响应 | 每次变更 |
| 后台会话 | login、me、overview、logout | 同源 Cookie 正常，退出后恢复 401 | 上线当次、24 小时 |
| 同库写入 | 唯一验收事件、后台查询、原 SQLite 最大 ID | 只新增一次，历史数据连续，IP 为真实客户端 | 上线当次 |
| 核心静态能力 | 真实文件转换、普通下载 | 不依赖 API，Tunnel 故障时仍可用 | 上线当次、24 小时 |

- [ ] 项目主在 `https://shiyinmp3.com/admin/` 完成登录、配置写入/读回、概览查询和退出验收。
- [ ] 通过新域名发送唯一验收埋点，并在原 SQLite/运营后台确认记录与真实客户端 IP。
- [ ] 24 小时后复查 Tunnel、API 5xx/超时、埋点量和后台可用性。
- [ ] 确认 Cloudflare 域名自动续费；账号 2FA 和恢复码由项目主自行安排，不再作为本迭代待办。
- [ ] QQ 安装包等待项目主确定独立方案；Cloudflare 继续保持 Toast 降级，不启用 R2。
- [x] `www.shiyinmp3.com` 以 301 永久重定向到裸域名，并保留路径和查询参数。
