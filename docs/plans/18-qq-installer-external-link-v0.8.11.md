# v0.8.11 QQ 旧版客户端外部链接灰度实施计划

> 状态：真实网盘 URL 已完成本地可达性与分域配置复验，项目主已明确批准进入生产发布。
> 项目主已授权先让 `shiyinmp3.com` 使用可配置网盘链接，`sleepno.cn` 暂时保持
> 现有自托管安装包链路；后者只在观察期结束且项目主再次确认后切换。

## 一、目标与发布边界

1. `shiyinmp3.com` 的两个“下载 QQ 旧版客户端”入口读取当前域名的运行时配置，并直接跳转到已配置的 HTTPS 网盘地址。
2. 运营后台可分别编辑 `shiyinmp3.com` 与 `sleepno.cn` 的跳转链接；两份配置共用现有 API / SQLite，但键和值相互独立。
3. 第一阶段不改变 `sleepno.cn`：该域名未配置外部链接时继续下载现有同源 ZIP。
4. `shiyinmp3.com` 未配置、配置非法、Host 未知或公开配置请求失败时保持失败安全，不跳转到不可信地址，也不影响音频转换。
5. 第二阶段不自动发生。只有项目主确认观察结果后，才给 `sleepno.cn` 保存同一外部链接并移除自托管安装包链路。
6. 本轮不做代理网盘文件、不把网盘 URL 写进前端 bundle、不上传或复制安装包，也不改变 QQ 文件解密能力。

## 二、数据与安全规则

- 继续复用 `feature_flags`，新增两个域名独立键；不新增数据库或表。
- 配置值只允许完整 `https://` URL，最大 2048 字符；拒绝 `http:`、`javascript:`、协议相对地址、站内相对路径和非法 URL。
- 公开 `/api/config` 只返回当前受信 Host 对应的 `qqInstallerUrl`，不泄露另一域名配置。
- 前端再次校验公开配置；非法值按“未配置”处理。
- 外部链接优先于构建期默认链路。空配置时：Cloudflare 构建显示原有不可用提示，阿里云构建继续使用 `/downloads/qq-music-v19.51-windows.zip`。
- `qq_download_click` 保留既有漏斗口径；只有走自托管 ZIP 时携带 `sha256`，外部跳转不伪造安装包哈希。

## 三、受影响文件

### 后端 API

- `server/src/schema.sql`：新增两个域名的默认空链接配置。
- `server/src/lib/featureFlags.ts`：链接配置类型、严格解析、双域名读写。
- `server/src/routes/publicConfig.ts`：按当前 Host 返回 `qqInstallerUrl`。
- `server/src/routes/adminFeatureFlags.ts`：新增链接列表与按域名保存接口。
- `server/src/lib/featureFlags.test.ts`、`server/src/routes/featureFlags.test.ts`：覆盖默认值、隔离、持久化、鉴权和危险 URL。

### 运营后台

- `admin/src/components/settings/QqInstallerLinksCard.tsx`：双域名链接表单、清空语义、保存反馈与失败保留。
- `admin/src/pages/Settings.tsx`：挂载配置卡片。
- `admin/src/lib/api.ts`、`admin/src/lib/api-overview-types.ts`：配置 API 类型与调用。

### 主站

- `src/lib/public-config.ts`、`src/lib/public-config.test.ts`：解析当前域名的可选 HTTPS 链接，异常时回退。
- `src/lib/qq-installer.ts`、对应测试：统一解析外部链接、自托管 ZIP 与不可用三种结果。
- `src/components/qq-guide.tsx`、`src/components/support-matrix.tsx`、`src/App.tsx`：两个入口使用同一运行时配置。

### 文档与版本

- `docs/ANALYTICS_SPEC.md`：明确外部跳转不携带 `sha256`。
- `docs/ARCHITECTURE.md`、`docs/QQ_INSTALLER_SHA256.md`：登记灰度期间允许的单域名差异和自托管回退边界。
- 主站、后台、API 版本分别递增至 v0.8.11、v0.4.23、v0.4.16；发布状态只在生产完成后更新。

## 四、API 契约

- `GET /api/config`
  - 保留现有字段。
  - 增加 `qqInstallerUrl: string | null`；只返回当前 Host 的安全 HTTPS 配置。
- `GET /api/admin/feature-flags/qq-installer-links`
  - 返回两个正式域名的完整链接配置。
- `PUT /api/admin/feature-flags/qq-installer-links/:siteHost`
  - 请求体 `{ "url": string | null }`。
  - 空字符串归一化为 `null`；未知域名、多余字段和非 HTTPS URL 返回 400。

## 五、验证清单

1. API：默认空值、双域名独立保存、Host 隔离、鉴权、危险 URL 与旧 API 兼容测试通过。
2. 主站：外部链接优先、自托管回退、不可用状态和非法公开配置失败安全测试通过。
3. 构建：用户端、运营后台、API TypeScript、Cloudflare 双前端构建及 Wrangler dry-run 通过。
4. 本地联调：给 `shiyinmp3.com` 保存测试 HTTPS 地址后两个入口均跳转；清空后恢复不可用；`sleepno.cn` 未配置时仍解析为同源 ZIP。
5. 视觉：后台配置卡片在 1280×720 与 390×667 无水平溢出；主站入口布局和文案不变。
6. 生产发布前必须取得真实网盘 URL，并先验证 URL 可达、无需登录即可进入预期下载页、没有意外跳转。

## 六、分阶段上线与回滚

### 阶段一：仅 `shiyinmp3.com`

1. 先部署共享 API，再部署运营后台和 Cloudflare 主站资产。
2. 在后台只给 `shiyinmp3.com` 保存项目主提供的网盘 URL；`sleepno.cn` 保持空配置。
3. 从 `shiyinmp3.com` 的 QQ 使用说明与支持矩阵两个入口分别点击，确认跳转地址一致。
4. 若链接失效或跳转异常，立即清空 `shiyinmp3.com` 配置；Cloudflare 主站恢复失败安全提示，无需回滚代码。

### 阶段二：`sleepno.cn`

1. 观察期结束后由项目主明确批准，不按时间自动切换。
2. 给 `sleepno.cn` 保存同一外部链接并验证两个入口。
3. 确认双域名稳定后，另行删除服务器安装包、nginx `/downloads/` 例外和 SHA-256 运维文档；本轮不提前删除可回滚资产。

## 七、上线观测指标

| 验证什么 | 事件 / 信号 | 期望 | 窗口 |
|---|---|---|---|
| 配置隔离 | 双域名 `/api/config` | shiyin 返回外部 URL；sleepno 为 `null` | 上线当次、24h |
| 两个入口可用 | QQ 说明与支持矩阵点击 smoke | 均到达同一网盘下载页 | 上线当次 |
| 引导转化稳定 | `qq_guide_view → qq_download_click`，按 `site_host` 拆分 | shiyin 无异常断崖，sleepno 基线不受影响 | 1h、24h、7d |
| 公开配置可靠 | `/api/config` 状态与日志 | 5xx 为 0，响应保持 `no-store` | 1h、24h、7d |
| 核心流程不受影响 | 上传、解密、转码、下载漏斗 | 与上线前基线无异常偏离 | 24h、7d |
| 回滚能力 | 清空 shiyin 链接后复验 | 不再导航并显示失败安全提示 | 上线前演练、必要时 |

## 八、本地验收结果

- 自动化：运行时配置与管理接口 14/14、主站公开配置与公告关闭状态 11/11、QQ 下载目标 3/3、站点 Host 9/9、访问控制 11/11、Cloudflare 源站保护 5/5、Worker 代理 6/6，全部通过。
- 构建：主站 v0.8.11、运营后台 v0.4.23、API v0.4.16 TypeScript 构建通过；Cloudflare 双前端构建和 Wrangler dry-run 通过。后台仍有既存的主 chunk 大于 500 kB 警告。
- API 联调：先用占位 URL 验证完整保存流程；收到项目主提供的真实 HTTPS 网盘 URL 后，已在独立临时数据库复验：`shiyinmp3.com` 的 `/api/config` 返回该 URL，`sleepno.cn` 同时保持 `qqInstallerUrl: null`。真实 URL 不写入源码或文档。
- 交互联调：QQ 使用说明和支持矩阵两个入口均从 `http://127.0.0.1:5183/` 直接导航到同一测试 URL。测试地址只存在于独立临时数据库，不在源码、构建产物或生产配置中。
- 视觉：运营后台配置中心在 1280×720 与 390×667 下 `scrollWidth === innerWidth`；主站 QQ 指引在 390×667 下无水平溢出，弹窗宽 366 px、左右各留 12 px。
- 静态检查：本次主站与后台变更文件 ESLint 通过；`src/App.tsx` 仍有两条与本次无关的既有 React Hooks 错误，行号对应 QQ 自动引导 effect 和 render 期 ref 赋值，未扩大。
- 失败安全：Cloudflare 空配置与非法链接回退由下载目标专项测试覆盖；本地普通 Vite 构建按设计模拟阿里云自托管回退，不用它冒充 Cloudflare 空配置 UI 验收。
- 发布前状态：尚未修改任何生产配置；commit、PR、merge、tag、部署与生产 smoke 按本计划依次执行。
