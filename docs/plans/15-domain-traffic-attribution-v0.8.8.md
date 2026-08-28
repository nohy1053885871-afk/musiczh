# 双域名埋点归因与 PV/UV 分域趋势实施计划

> 状态：项目主已确认验收，正式发布中。目标版本：用户端 v0.8.8、运营后台 v0.4.20、API v0.4.13。
> 本文件是本次跨端改动的唯一完整计划；实现、验证和后续发布证据都回填到这里。

## 一、目标与明确边界

1. 运营后台“公开站点访问控制”所有关键文案明确写出：当前规则只限制
   `sleepno.cn`，不限制公开的 `shiyinmp3.com`。
2. 用户端埋点 SDK 为每一条新事件自动注入公共字段 `site_host`，取当前页面的
   `location.hostname`，业务调用方不得手工传入。
3. API 将 `site_host` 作为事件顶层正式字段落库。生产请求优先使用受信接入链路识别的
   Host，防止请求体伪造正式域名；旧重试事件允许缺失该字段。
4. 运营后台首页“PV / UV 趋势”增加三个可独立切换的标签：`整体流量`、
   `sleepno.cn`、`shiyinmp3.com`；默认全部选中。
5. 每个选中标签同时展示 PV 与 UV：同一标签共用颜色，PV 使用实线、UV 使用虚线。
6. 不新增事件名，不改变现有 PV/UV 定义，不修改其他看板、漏斗或访客日志口径。

## 二、正式数据口径

- `site_host` 是公共字段，不进入 `props` 业务字段白名单。
- 正式分域只识别 `sleepno.cn` 与 `shiyinmp3.com`；预览域名、workers.dev、本地开发和
  其他 Host 仍进入整体流量，但不归入两个正式域名曲线。
- 历史事件没有可信 Host，保持 `site_host = NULL`，只计入整体流量，绝不回填猜测值。
- 整体 PV/UV 沿用当前全量 `pageview` 口径。分域 PV 按 `site_host` 计数，分域 UV 按
  `site_host + visitor_id` 去重。
- `visitor_id` 仍按浏览器 Origin 隔离；整体 UV 和分域 UV 都是匿名浏览器标识口径，
  不是跨域自然人去重。
- 新字段部署后，正式域名的新 PV 应满足“整体 PV = 两域名 PV + 其他/缺失 Host PV”；
  不强行要求历史时间范围中整体曲线等于两条分域曲线之和。

## 三、改动清单

### 用户端

- `src/lib/analytics-context.ts`：集中读取并规范化当前页面 Host。
- `src/lib/analytics.ts`：`EventEnvelope` 与所有事件统一注入 `site_host`。
- `package.json` / lockfile：用户端开发版本更新为 v0.8.8，便于识别新口径起点。

### 后端 API

- `server/src/lib/siteHost.ts`：规范化 Host，并根据受信 Cloudflare 转发 Host、直接请求
  Host 和 SDK 报告值确定最终归属。
- `server/src/routes/track.ts`：接收向后兼容的可选 `site_host`，写入事件表。
- `server/src/schema.sql` / `server/src/db.ts`：为旧库幂等增加 `events.site_host`，并给现有
  overview 日汇总表增加两域名 PV/UV 汇总列。
- `server/src/lib/overview/{types,raw,rollupWriter,rollupReader,parity}.ts`：原始查询与日汇总
  两条路径都返回相同的整体/分域 PV、UV 时序。
- `server/src/lib/overview/overview.test.ts`、`server/src/lib/siteHost.test.ts`：覆盖历史空值、
  两域名拆分、整体去重、受信 Host 优先和 raw/rollup 一致性。
- `server/package.json`：API 开发版本更新为 v0.4.13。

### 运营后台

- `admin/src/components/settings/SiteAccessCard.tsx`：标题、状态、确认弹窗和规则操作文案
  全部明确“仅限制 sleepno.cn”。
- `admin/src/lib/api.ts`：登记首页 bundle 的整体/分域流量结构。
- `admin/src/pages/overview/OverviewDetails.tsx`：实现三个默认选中的可取消标签、六条趋势线、
  空选择状态、历史归因说明和窄屏换行。
- `admin/src/pages/Overview.tsx`：验收中发现顶部时间范围工具栏在 390px 下横向溢出，
  将同页工具栏改为可换行，确保数据概览整页不被撑宽。
- `admin/package.json` / lockfile：运营后台开发版本更新为 v0.4.20。

### 文档

- `docs/ANALYTICS_SPEC.md`：把 `site_host` 登记为 SDK 公共字段，更新双域名统计边界和
  历史数据说明。
- `docs/ARCHITECTURE.md`：移除“尚无 Host 维度”的旧债务，登记整体/分域 UV 边界。
- `CLAUDE.md`：只更新当前开发版本和与本功能直接相关的当前约束；生产版本在正式发布前
  保持 v0.8.7 / v0.4.19 / v0.4.12。

## 四、兼容与迁移策略

1. `site_host` 在 API 校验层保持可选，确保旧页面、旧 sendBeacon 和本地重试队列继续成功。
2. SQLite 普通列迁移使用幂等 `ALTER TABLE ADD COLUMN`；历史行自然为 `NULL`。
3. overview 新列使用 `NOT NULL DEFAULT 0`；现有 ready 汇总无需停用或全量重建，新事件从
   当前游标继续增量写入。若未来执行全量 backfill，同一实现也会得到一致结果。
4. 首页 bundle 保留原 `timeseries.pv/uv`，新增 `traffic` 结构，避免其他图表和旧前端受影响。
5. 发布时应先上 API/schema，再发布两个域名的用户端，最后发布两边运营后台；本次仅完成
   本地实现和验证，不执行生产发布。

## 五、验证清单

- [x] SDK 单元测试确认每条新事件都带当前 hostname（2/2 通过）。
- [x] Host 解析测试覆盖 Cloudflare 受信转发、sleepno 直连、伪造正式域名和本地 Host（4/4 通过）。
- [x] overview 测试同时写入两域名与历史空 Host，raw/rollup bundle 全量一致（3/3 通过）。
- [x] 断言整体 PV/UV、两域名 PV/UV 及历史空 Host 的预期值。
- [x] 用户端 v0.8.8、运营后台 v0.4.20、API v0.4.13 三端构建全部通过。
- [x] overview、访问控制、Cloudflare 源站鉴权、Worker 代理和既有配置专项测试通过（38/38）。
- [x] 本地三端联调：真实 `/api/track` 请求成功落库；接口返回整体 5 PV / 3 UV、
  `sleepno.cn` 3 PV / 2 UV、`shiyinmp3.com` 2 PV / 2 UV。
- [x] 运营后台桌面宽度验收：三标签默认选中，逐个取消、全空状态和三项恢复均正确；
  六个 PV/UV 系列点及 Tooltip 与接口数据一致。
- [x] 运营后台 390×667 验收：三标签完整可见、图表卡片宽 342px、页面宽与滚动宽均为
  390px；访问控制标题和边界说明完整可读。
- [x] 本地测试链接已由 Agent 在浏览器实际打开，登录、概览与配置中心均可访问。

## 六、上线观测指标

| 验证什么 | 信号 | 期望 | 窗口 |
|---|---|---|---|
| 公共字段覆盖 | 新事件 `site_host IS NOT NULL` 占比 | 两个正式域名发布完成后接近 100% | 上线当次、24 小时 |
| 正式域名取值 | `site_host` 值分布 | 正式流量只出现两个正式域名；其他值可解释为预览/测试 | 上线当次、24 小时 |
| PV 守恒 | 整体 PV 与两域名/其他 PV | 新版本后的整体 PV 等于各 Host PV 之和 | 上线当次、24 小时 |
| raw/rollup 一致 | overview parity 与 fallback 日志 | 无 mismatch，正常使用 rollup | 上线当次、24 小时 |
| 图表可用性 | overview bundle、后台错误提示 | bundle 200，三标签切换无空白或报错 | 上线当次、24 小时 |
| 访问控制边界 | 两域名实际 200/403 | 文案与当前事实一致：仅 sleepno.cn 执行 IP 限制 | 上线当次 |

## 七、正式发布证据

- 发布授权：2026-08-28 项目主确认本地验收通过并要求上线。
- 发布范围：默认双域名同步发布；阿里云用户端、后台、唯一 API，以及 Cloudflare
  用户端、后台、Worker/Assets 均从同一合并提交发布。
- 远端基线：开始发布时 GitHub `main` 为 `6f918d11349038f01e590ed0271340a502b64428`；
  其新增的默认双域名同步发布规范已合入本次工作树。
- [ ] 发布分支、提交与 PR 完成。
- [ ] PR 合并，归档版本标签创建。
- [ ] 阿里云用户端、后台、API 部署成功。
- [ ] Cloudflare Worker/Assets 部署成功并记录版本 ID。
- [ ] 两个正式域名、后台、API、埋点与分域数据概览 smoke 通过。
- [ ] 更新生产版本与本节最终证据。
