# v0.8.9 受限页辅助文案与服务端曝光埋点实施计划

> 状态：v0.8.9 / 后台 v0.4.21 / API v0.4.14 已于 2026-08-29 完成双域名发布。生产白名单规则保留，但限制开关当前为关闭；辅助文案为空，启用后的真实非白名单页面待运营配置后复验。
>
> 2026-08-29 项目主复核后收窄范围：删除“去小红书”按钮、链接配置、跳转接口和点击指标，只保留弱化的可配置辅助文案与页面访问统计。

## 一、目标与数据边界

1. `sleepno.cn` 因 IP 访问规则返回 403 时，在现有受限页增加一条可由运营后台配置的辅助提示文案；文案可自行写入小红书账号或说明，但页面不提供按钮或链接配置。
2. 受限页配置为空时不展示辅助提示区，不编造账号、主页或最新地址；原有“当前网络地址不在允许访问范围内”继续作为故障安全文案。
3. 新增独立的服务端受限页曝光事件 `restricted_page_view`：浏览器受限页读取公开文案时记录一次，不复用主站浏览器 `pageview`。
4. 埋点进入独立表，不伪造 `visitor_id/session_id`，不污染主站 UV、域名流量归因、设备分布、访客日志或既有 overview rollup；按 IP 去重只作为受限页独立指标。
5. 运营后台首页最后新增“受限页访问”卡片，跟随首页时间范围展示曝光 PV 与去重 IP；Cloudflare 与阿里云后台读取同一 API 和 SQLite。

## 二、受影响文件与职责

### 用户端与接入层

- `public/restricted.html`：保留无外部资产的 403 首屏；用内联脚本读取公开辅助文案，以 `textContent` 写入 13px 低对比度提示文本，不渲染按钮或链接。
- `server/nginx/site-access.conf.example`：仅豁免 `/api/restricted-page` 一个精确接口，其他公开 API 继续受白名单/黑名单限制。
- `package.json`：主站版本递增至 v0.8.9。

### 后端 API

- `server/src/schema.sql`：新增受限页曝光事件表、查询索引和辅助文案默认配置行。
- `server/src/lib/siteAccess.ts`：读写受限页辅助文案，并把配置纳入访问控制快照。
- `server/src/lib/siteAccessAnalytics.ts`：记录曝光并按时间范围聚合 PV 与去重 IP。
- `server/src/routes/publicRestrictedPage.ts`：公开读取受限页文案并记录曝光，响应为 `no-store`。
- `server/src/routes/adminSiteAccess.ts`：新增严格校验的纯文本配置保存接口。
- `server/src/routes/adminOverview.ts`：在既有 overview bundle 中追加独立受限页聚合，不改变 v0.8.8 双域名 `traffic` 数据。
- `server/src/lib/retention.ts`：受限页事件遵循现有 365 天保留策略。
- `server/src/index.ts`、`server/package.json`：挂载公开路由并递增 API 至 v0.4.14。

### 运营后台

- `admin/src/components/settings/SiteAccessCard.tsx`：增加辅助文案、保存反馈与失败保留，不提供链接字段。
- `admin/src/pages/Overview.tsx`：把“受限页访问”统计卡片放在首页所有现有内容之后，保留 v0.8.8 域名流量拆分。
- `admin/src/lib/api.ts`、`api-overview-types.ts`、`api-record-types.ts`：拆分原超长类型文件，同时保留 `traffic` 类型并新增受限页配置/统计类型。
- `admin/src/lib/format.ts`、`docs/ANALYTICS_SPEC.md`：登记服务端曝光事件的语义、触发点与独立口径。
- `admin/package.json`：后台版本递增至 v0.4.21。

### 测试与版本记录

- `server/src/routes/restrictedPage.test.ts`：覆盖配置默认值、鉴权、非法载荷、持久化、公开字段、曝光落库、IP 去重和聚合区间。
- `vite.config.ts`：允许用 `USER_API_PORT` 隔离本地 API，并为本地验收注入 TEST-NET 测试 IP；不影响生产构建。
- `docs/retrospectives/16-v0.8.9-restricted-page-assist-20260829.md`：记录本地及生产验收证据。

## 三、交互与失败安全

1. 受限页先同步呈现原有 403 文案；公开配置请求成功后再显示辅助提示，接口失败不会导致空白页或解除限制。
2. 辅助文案只用纯文本节点渲染，不接受 HTML，不挂载任何按钮或链接。
3. 文案为空时隐藏整个辅助提示区；数据库中即使残留旧测试链接配置，当前代码也不读取、不返回、不展示。
4. 公开配置接口只返回受限页文案，不返回限制模式、当前 IP、白名单或黑名单。
5. 辅助文案使用 `#918A84` 和 13px 字号，视觉层级弱于基础 403 说明；桌面与 390px 均不得横向溢出。
6. 前端先于 API 发布时，后台显示明确部署告警和 `-`，不把字段缺失伪装成零数据。

## 四、验证

1. API：访问控制/受限页、功能开关、overview、site host、Cloudflare origin 专项测试。
2. 前端：公开配置、analytics context、Cloudflare proxy 测试。
3. 构建：用户端、运营后台、API、Cloudflare 双前端构建与 Wrangler dry-run。
4. 静态断言：受限页无外部资源、无 HTML 注入、无按钮/链接、保留 `noindex`；nginx 仅豁免一个精确接口。
5. 本地联调：确认曝光、去重 IP 与首页卡片数字一致，主站与双域名 `traffic` 口径不变。
6. 视觉验收：1280×720 与 390×667 检查受限页、后台配置区和首页末位卡片；窄屏 `scrollWidth === innerWidth`。

## 五、发布与上线观测

1. [x] PR #76 合并提交 `f02877b516f4` 作为阿里云、Cloudflare 和唯一 API 的共同版本源。
2. [x] API v0.4.14、阿里云用户端/后台、Cloudflare Assets/Worker 全部发布并完成健康检查。
3. [x] 生产 nginx 已备份为 `sleepno.cn.conf.20260829-092841`，加入 `/api/restricted-page` 精确豁免；reload 前后 `nginx -t` 均成功。
4. [ ] 项目主确认具体辅助文案并启用现有限制开关后，从真实非白名单网络验证 403 文案与统计。当前生产文案为空，未把本地测试文案带入生产。

| 验证什么 | 事件 / 信号 | 期望 | 窗口 |
|---|---|---|---|
| 受限页加载可靠 | `restricted_page_view`、公开接口 2xx/5xx | 每次受限页加载约 1 次 view，接口 5xx 为 0 | 上线当次、1h、24h |
| 双域名后台一致 | 两个 `/admin/` 的配置与受限页卡片 | 读取同一文案和 SQLite 计数 | 上线当次 |
| 主指标不被污染 | 主站 PV/UV、域名 traffic、访客日志 | 受限页事件不进入既有口径 | 上线当次、24h |
| 访问控制未放宽 | 非白名单主站/API/资源、后台/健康检查 | 公开资源仍 403；后台与健康检查仍 200 | 上线当次 |
| 恢复路径可靠 | 配置清空、API 异常 | 辅助提示区隐藏或回退基础 403 文案 | 上线当次 |

### 发布证据

- CI run `33226326487`、阿里云前端 run `33226388354`、API run `33226414612` 全部成功。
- Cloudflare Worker 版本 `33f7cdbf-9649-40f5-a17f-75af8db53638`；两个正式域名的用户端、后台、健康检查和受限页配置接口均通过 smoke。
- 阿里云 `restricted.html` SHA-256 为 `c5db3bee0dc36298582bd44a2d8d86dfa126bd05467df578bd79d7b5fbf09cb1`，与本地发布产物一致。
- 生产数据库中受限页 smoke 写入 2 PV / 1 去重 IP，主 `events` 表对应事件仍为 0，证明独立口径未污染主站指标。
- 四个归档标签 `user-v0.8.9`、`admin-v0.4.21`、`api-v0.4.14`、`cloudflare-v0.8.9` 均指向合并提交 `f02877b516f4`。
