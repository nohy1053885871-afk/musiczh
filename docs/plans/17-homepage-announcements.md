# v0.8.10 首页双域名公告配置实施计划

> 状态：2026-08-29 生产发布、双密钥轮换与最终 smoke 已完成；主站 v0.8.10、后台 v0.4.22、API v0.4.15 已在 Cloudflare 与阿里云双域名上线。两个域名的公告最终均保持关闭。

## 一、目标与边界

1. 首页在 Header 与主视觉之间展示单层公告正文，不拆主副标题。
2. `sleepno.cn` 与 `shiyinmp3.com` 共用同一 API / SQLite，但分别保存、读取和编辑自己的公告配置。
3. 每份配置包含：显示开关、公告正文、可选行动点文案、可选行动点链接、更新时间。
4. 行动点文案和链接必须同时存在或同时为空；为空时主站不挂载行动点。
5. 公告带关闭按钮。用户关闭后，仅在当前浏览器隐藏当前域名的当前公告版本；运营保存新版本后自动重新显示。
6. API 异常、Host 无法识别、配置缺失或配置非法时隐藏公告，不影响音频转换、现有首页指引或下载。
7. 本轮不做多条公告、定时发布、富文本、图片、优先级、轮播或跨域共享关闭状态。

## 二、数据与 Host 规则

- 继续复用 `feature_flags` 表，新增两个 JSON 配置键；不新建第二套数据库或按域名重复迁移。
- 正式站点只认 `sleepno.cn` 与 `shiyinmp3.com`。Cloudflare 链路使用通过源站 Token 校验后的 `X-Forwarded-Host`；阿里云链路使用请求 Host。
- `www.shiyinmp3.com`、`preview.shiyinmp3.com` 与 Workers 技术入口读取 `shiyinmp3.com` 配置；本地开发 Host 默认读取 `shiyinmp3.com` 配置。
- 公开接口只返回当前 Host 对应的已启用公告，不返回另一域名的配置或后台字段。
- 公告正文为纯文本，最多 300 字；行动点文案最多 5 字；链接只允许 `https://` 或单斜杠开头的站内路径，拒绝 `javascript:`、协议相对地址和非法 URL。
- `updatedAt` 作为公告修订标识。浏览器按 `siteHost + updatedAt` 判断当前版本是否已关闭。

## 三、受影响文件

### 后端 API

- `server/package.json`、`server/package-lock.json`：API 版本递增至 v0.4.15。
- `server/src/schema.sql`：新增两个默认关闭的公告配置键。
- `server/src/lib/featureFlags.ts`：公告类型、JSON 解析、双域名独立读写与失败安全。
- `server/src/lib/siteHost.ts`：公告请求 Host 与 Cloudflare 受信转发 Host 的规范化映射。
- `server/src/lib/channel.ts`、`server/src/routes/adminVisitors.ts`：兑现上版复盘项，两个正式域名及其子域名统一归为站内来源。
- `server/src/routes/publicConfig.ts`：在现有 `/api/config` 中追加当前 Host 的公开公告。
- `server/src/routes/adminFeatureFlags.ts`：新增公告列表读取和按域名保存接口，严格校验正文与行动点。
- `server/src/lib/featureFlags.test.ts`、`server/src/routes/featureFlags.test.ts`、`server/src/lib/siteHost.test.ts`：覆盖默认值、独立持久化、Host 归属、鉴权和非法链接。

### 运营后台

- `admin/package.json`、`admin/package-lock.json`：后台版本递增至 v0.4.22。
- `admin/src/components/settings/HomepageAnnouncementsCard.tsx`：两个域名的独立配置表单、保存反馈和失败保留。
- `admin/src/pages/Settings.tsx`：挂载公告配置卡片。
- `admin/src/lib/api.ts`、`admin/src/lib/api-overview-types.ts`：公告 API 类型与调用。

### 主站

- `package.json`、`package-lock.json`：主站版本递增至 v0.8.10。
- `src/lib/public-config.ts`、`src/lib/public-config.test.ts`：一次读取现有指引开关和当前域名公告，公告失败时默认隐藏。
- `src/lib/announcement-dismissal.ts`、`src/lib/announcement-dismissal.test.ts`：按域名和公告版本保存关闭状态。
- `src/components/homepage-announcement.tsx`：单层正文、可选行动点、关闭按钮、当前版本本地关闭。
- `src/App.tsx`：删除静态演示数据，改为真实公开配置。

### 埋点与文档

- `docs/ANALYTICS_SPEC.md`、`admin/src/lib/format.ts`：登记公告曝光、行动点曝光/点击、关闭按钮曝光/点击。
- `docs/ARCHITECTURE.md`：把原“首页配置开关完全共享”更新为“共享数据库内包含全局开关与分域公告配置”。

## 四、API 契约

- `GET /api/config`
  - 保留 `homepageGuidanceVisible`。
  - 增加 `homepageAnnouncement`；未启用或 Host 不可识别时为 `null`。
- `GET /api/admin/feature-flags/homepage-announcements`
  - 返回两个正式域名的完整配置。
- `PUT /api/admin/feature-flags/homepage-announcements/:siteHost`
  - 写入单个正式域名；严格拒绝未知域名、多余字段、空的启用正文和不成对行动点。

## 五、验证清单

1. 后端：功能开关、Host、Cloudflare 源站、公开配置与管理接口测试全部通过。
2. 前端：公开配置解析、默认失败安全和现有首页指引回归通过。
3. 构建：用户端、运营后台、API、Cloudflare 双前端构建与 Wrangler dry-run。
4. 本地联调：在后台分别保存两个域名配置；公开接口按 Host 只返回对应配置；关闭当前版本后隐藏，保存新版本后重显。
5. 视觉：主站和后台均检查 1280×720 与 390×667，`scrollWidth === innerWidth`。
6. 埋点：`homepage_announcement_view`、`homepage_announcement_action_view/click`、`homepage_announcement_close_view/click` 按实际挂载和操作触发。

## 六、上线观测指标（后续获准发布时执行）

| 验证什么 | 事件 / 信号 | 期望 | 窗口 |
|---|---|---|---|
| 双域名配置隔离 | 两个正式域名 `/api/config` | 各自只返回自己的公告 | 上线当次、24h |
| 公告加载可靠 | `homepage_announcement_view`、公开接口 2xx/5xx | 有配置域名产生曝光；接口 5xx 为 0 | 1h、24h、7d |
| 行动点有效 | action view/click | 只有配置行动点的域名产生事件，链接可达 | 上线当次、24h |
| 关闭逻辑有效 | close view/click、浏览器复访 | 同版本关闭后不重显；新版本重新显示 | 上线当次 |
| 核心流程不受影响 | 上传、解密、下载事件与 smoke | 公告/API 故障不阻断本地转换 | 上线当次、24h |

## 七、本地验收结果

- 自动化测试：公开配置/关闭状态 10/10、埋点上下文 2/2、API 公告配置 10/10、域名与来源归类 9/9、访问控制 11/11、Cloudflare 源站保护 5/5，全部通过。
- 构建：用户端、运营后台、API TypeScript、Cloudflare 双前端构建及 Wrangler dry-run 通过；运营后台仍保留已有的主 chunk 大于 500 kB 警告。
- 真实联调：后台成功独立读写两个域名；`Host: shiyinmp3.com` 返回带行动点公告，`Host: sleepno.cn` 返回无行动点公告。
- 关闭语义：同一版本关闭后刷新仍隐藏；后台再次保存生成更大的 `updatedAt` 后重新显示。
- 视觉：主站与后台分别完成桌面和窄屏验收，均无水平溢出；后台窄屏字数计数与域名标签拥挤问题已在验收中修复。
- 静态检查：本次新增用户端文件和所有相关后台文件通过 ESLint；`src/App.tsx` 全文件仍有两条与本次改动无关的既有 React Hook 规则错误（原 QQ 自动引导 effect 与 render 期 ref 赋值）。

## 八、生产发布结果

- PR #78 合并提交为 `a66971ab688b8b6bea311256208cfbb80410d1dc`；用户端、后台与 API 版本分别为 v0.8.10、v0.4.22、v0.4.15。
- CI run `33247803403`、阿里云前端 run `33247855431`、Cloudflare 校验 run `33247855479`、API run `33247879529`、首次 Tunnel 配置 run `33247932526` 全部成功。
- 初始 Cloudflare Worker 版本为 `78ed84ba-510d-4898-a0ba-5c6d3ce9ca3f`；源站密钥轮换后的 Worker Secret 版本为 `8ccc0b87-30d8-41cd-b7a1-5d50874d548d`，对应部署 ID `895f9fd2-25bc-475b-970b-b33627008344`。
- 项目主批准立即轮换 Tunnel Token 与源站 Token，并接受切换期间 API 短暂不可用。Tunnel Token 第一次刷新后的安装 run `33255895241`、`33256173214` 失败并自动回滚；第二枚权威 Token 已确认能建立 QUIC 连接，但 run `33256811148` 暴露 `systemctl enable --now` 不会重启已运行服务。生产已显式重启恢复，源站 Token 配置 run `33257123548` 成功，最终 Tunnel 状态为 `healthy`。
- 部署脚本已改为 `systemctl enable` 后显式 `systemctl restart`，避免更新 Token 时旧进程继续持有旧配置；修复后的分支 workflow run `33257912598` 在 40 秒内完成全部检查，合并后 main run `33258188877` 在 34 秒内再次通过安装、重启、匿名 403、授权健康检查与服务状态检查。
- 最终生产 smoke：双域名 `/api/health` 为 200，双域名 `/api/config` 为 200、`Cache-Control: no-store` 且 `homepageAnnouncement: null`；`origin.shiyinmp3.com` 匿名健康检查为 403。
- 发布后收尾检查一度发现 `sleepno.cn` 公告被开启；已在不改正文的前提下把两个域名开关原子设为关闭并从公网复验。为该两行配置修改启动的临时在线备份面对 5.4GB 数据库造成额外负载，停止并删除不完整副本后服务恢复；正式每日备份未修改。
- 生产浏览器交互验收因应用安全策略拒绝导航而未完成；本地桌面/窄屏视觉、生产静态版本清单、双域名 API 与源站保护均已验证，不把后者冒充线上视觉验收。
- 发布收尾 PR #79 合并提交为 `9da04ab`；四个归档标签 `user-v0.8.10`、`admin-v0.4.22`、`api-v0.4.15`、`cloudflare-v0.8.10` 均指向功能发布提交 `a66971ab688b`，未创建通用 `v*` 标签。
