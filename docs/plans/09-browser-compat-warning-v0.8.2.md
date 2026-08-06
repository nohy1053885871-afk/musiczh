# 浏览器兼容性弱提示实施计划（主站 v0.8.2 / 运营后台 v0.4.15 / API v0.4.9）

> 状态：第一步视觉确认、第二步完整实现与本地三端验收均已完成；2026-08-06 已收到上线指令，发布执行中
> 范围：主站 + 埋点规范 + 运营后台 + API；不修改解密算法、转码算法或数据库表结构
> 目标：对“已识别且明确低于支持门槛”的浏览器显示一次非阻断提示，减少无法启动 module Worker 导致的无效重试。

## 执行分步

1. **第一步（已完成）— 只做前端样式**：完成独立弹窗组件，并通过仅开发环境可用的
   `?preview=browser-compat` 参数展示；不接浏览器判断、sessionStorage、埋点、后台或 API。
2. **第二步（已完成）— 完整执行**：按下文全部章节接入正式判断、会话规则、埋点、
   运营后台、API、版本、测试与本地联调；仍需收到明确“上线/发布”指令后才执行发布流程。

## 一、结论与边界

### 1. 正式支持基线

当前主站使用 Vite 8.0.10。实施前未覆盖默认 `build.target`；本次已将下列生产目标显式写入
`vite.config.ts`：

| 浏览器 / 引擎 | 最低版本 | 低于此版本 |
|---|---:|---|
| Chrome / Chromium | 111 | 明确不支持 |
| Microsoft Edge | 111 | 明确不支持 |
| Firefox | 114 | 明确不支持 |
| macOS Safari | 16.4 | 明确不支持 |
| iOS / iPadOS 上的浏览器 | 16.4 | 明确不支持 |

这组版本不只来自打包器：主站还依赖 ES module Worker；KGM/VPR 依赖
`DecompressionStream`。Safari 14.1 无法加载当前 module Worker，Safari 16.4 同时覆盖
上述核心能力。因此计划把这组版本显式写入 `vite.config.ts` 和兼容性判断代码，避免以后
升级 Vite 时支持门槛被默认值静默改变。

### 2. 可判断与不可判断范围

- 主流 Chrome/Chromium、Edge、Firefox、macOS Safari、iOS/iPadOS WebKit 可按版本明确判断。
- iOS/iPadOS 上即使显示为 Chrome/Edge/Firefox，也按系统 WebKit 版本判断，而不是按 App
  显示的产品版本判断。
- Android 内置浏览器如果 UA 能提供底层 Chromium 主版本，则按 Chromium 门槛判断。
- 无法可靠识别内核或版本的浏览器返回 `unknown`：不弹窗、不阻断，也不伪称支持。
- UA 可能被伪装，因此这是“声明版本与正式门槛”的判断，不是对运行时环境的数学证明。
- 极老、连当前 ESM 主包都无法执行的浏览器无法保证渲染 React 弹窗；本次不为它们增加
  第二套 ES5 页面。目标是覆盖已经能进入页面、但核心能力或构建目标不达标的用户。

### 3. 交互原则

- 仅 `unsupported` 弹窗；`supported` 和 `unknown` 均不弹。
- 弹窗不禁用页面、不阻止上传、不改变解密/转码逻辑；用户关闭后可继续使用。
- 每个标签页会话最多显示一次。关闭或确定后写入 `sessionStorage`；刷新同一标签页不重复，
  新会话仍会提醒，直到用户升级浏览器。
- 在 React 首屏完成后由 `useEffect` 判断并打开，不放在首屏渲染或 Worker 启动的关键路径上。
- 弹窗标题使用：`浏览器版本过低`。
- 弹窗正文严格使用项目主指定文案：

  > 当前浏览器版本过低，为了给您带来更好的使用体验，请您更新浏览器版本。

- 底部提供两个可见按钮：次按钮“关闭”、主按钮“确定”；二者均只关闭弹窗。
- Esc 和点击遮罩也允许关闭，归入“关闭”动作；不增加第三个右上角关闭按钮，避免重复。
- 弹窗沿用主站 iOS 6 软拟物规范，包含 `role="dialog"`、`aria-modal`、标题关联、初始焦点
  和关闭后的焦点恢复。

## 二、主站改动

### 1. 兼容性判断模块

新增 `src/lib/browser-compat.ts`：

- 固化支持矩阵常量，不从远端拉配置。
- 优先读取 Chromium 的 `navigator.userAgentData`，缺失时回退 `navigator.userAgent`。
- 检测顺序：iOS/iPadOS → Edge → Chromium → Firefox → macOS Safari → unknown，避免
  iOS Chrome 被误判为 Chromium。
- 输出统一结构：

```ts
type BrowserCompatibility = {
  status: 'supported' | 'unsupported' | 'unknown'
  family: 'chromium' | 'edge' | 'firefox' | 'safari' | 'ios_webkit' | 'unknown'
  detectedVersion?: string
  requiredVersion?: string
}
```

- 使用数值化版本段比较，不用字符串字典序比较。
- 不增加 `ua-parser-js` 等前端依赖，避免为几条固定规则增加主包体积。

新增 `src/lib/browser-compat.test.ts`，至少覆盖：

- Chrome 110/111、Edge 110/111、Firefox 113/114。
- Safari 14.1、15.6、16.3、16.4。
- iOS/iPadOS 16.3/16.4，含 `CriOS` 和 iPad 桌面模式 UA。
- 可识别的 Android Chromium WebView。
- 未知/缺失/异常 UA 返回 `unknown`，不能误报 `unsupported`。
- 版本比较的 `16.4`、`16.4.0`、`16.10` 边界。

### 2. 弹窗组件

新增 `src/components/browser-compat-modal.tsx`：

- 组件独立，避免继续膨胀已超过 400 行的 `src/App.tsx`。
- 复用现有弹窗色彩、圆角、阴影和动效，不引入 UI 库。
- Props 只接收兼容性结果和两个关闭动作，组件不自行重复解析 UA。
- “确定”“关闭”、Esc、遮罩分别上报对应动作后关闭。
- 弹窗本体在不支持时动态加载；支持用户不下载该组件 chunk。

### 3. App 接入

修改 `src/App.tsx`：

- 增加单一兼容性弹窗状态。
- 首次 `useEffect` 中读取会话标记并执行一次检测。
- 只在 `status === 'unsupported'` 时动态加载并显示。
- 关闭后立即写入会话标记；写 storage 失败时退回页面内存标记。
- 与现有大批量、QQ 引导、格式矩阵弹窗保持独立，不改变它们的触发条件。

### 4. 构建配置

修改 `vite.config.ts`：

- 显式设置 `build.target` 为
  `['chrome111', 'edge111', 'firefox114', 'safari16.4', 'ios16.4']`。
- 保留 Worker `format: 'es'` 和动态分包；不切回 IIFE，不把 WASM 解码器塞回 Worker 主包。
- 注释说明：该数组是产品支持政策，不应随 Vite 默认值变化。

## 三、埋点设计

先修改 `docs/ANALYTICS_SPEC.md`，再接入代码。

### 1. 事件

| 事件 | 时机 | 字段 |
|---|---|---|
| `dialog_browser_compat_view` | 弹窗实际挂载 | `browser_family, detected_version, required_version` |
| `dialog_browser_compat_confirm` | 点击“确定” | 上述字段 + `action='confirm'` |
| `dialog_browser_compat_close` | 点击“关闭”、Esc 或遮罩 | 上述字段 + `action='button'|'esc'|'overlay'` |

说明：

- 不给弹窗内两个按钮单独增加 `_view`；整弹窗的 `_view` 就是共同曝光分母，沿用大批量弹窗
  的现有口径。
- 三个事件共享 `dialog_browser_compat` base，现有按钮后台会自动把 `_confirm/_close` 视作行动。
- `unknown` 不展示弹窗，因此不产生这组三个事件；仍可从普通 `pageview` UA 观察总体流量。
- 不上报完整 UA 到 props；服务端本来就保存请求 UA。新增字段只保存前端实际采用的判定结果。

### 2. 新增字段

- `browser_family`：`chromium/edge/firefox/safari/ios_webkit`。
- `detected_version`：检测到的规范化版本字符串。
- `required_version`：触发提示时对应的最低版本字符串。
- `action` 已在白名单中，继续复用，不新增 `method` 字段。

## 四、后端 API 改动

### 1. 事件接收

修改 `server/src/routes/track.ts`：

- 在 `ALLOWED_PROPS` 中增加 `browser_family`、`detected_version`、`required_version`。
- 不修改 `FailureSchema`；兼容提示不是业务失败，不写 `failures` 表。
- 不新增表、不迁移 SQLite、不改保留策略。

### 2. 运营聚合

修改 `server/src/routes/adminStats.ts` 的 `/buttons` 返回：

- 保留现有通用按钮 PV/UV/CTR 聚合。
- 增加一个小型 `browser_compat` 聚合：按
  `browser_family + detected_version + required_version` 统计弹窗曝光 PV/UV、确定 PV/UV、
  关闭 PV/UV。
- 查询只扫描所选时间范围内三种兼容事件，并使用现有 `event + ts` 索引；不对全部事件做
  UA 正则解析。

### 3. API 版本

- 拟从 v0.4.8 升至 v0.4.9。
- 新增返回字段保持向后兼容，旧后台忽略即可；事件接收接口仍兼容旧主站。

## 五、运营后台改动

修改：

- `admin/src/lib/format.ts`：增加三个事件中文名称。
- `admin/src/lib/api.ts`：扩展 Buttons 响应类型，加入 `browser_compat` 聚合。
- `admin/src/pages/Buttons.tsx`：在现有“按钮埋点”页增加“低版本浏览器提示”表格，展示浏览器、
  检测版本、最低要求、曝光 PV/UV、确定、关闭；不新建一级导航页面。

拟从 v0.4.14 升至 v0.4.15。

## 六、性能影响与预算

### 1. 设计上的性能结论

该方案不会影响解密、转码或首屏关键路径：

- 版本判断只读取一次浏览器字符串并执行少量正则和数字比较，复杂度随百余字符 UA 线性增长。
- 不发网络请求、不创建探测 Worker、不加载 WASM、不读取文件。
- 判断在首屏 React commit 后执行。
- 弹窗组件只对不支持用户动态加载；正常用户主包只增加检测器和一个动态 import 入口。
- 会话标记只读写一次 `sessionStorage`。

### 2. 实施后的硬性验收预算

- 检测函数单次执行在本机和浏览器节流环境下均应低于 1 ms；若测量粒度不足则记录为
  “低于计时分辨率”，不伪造更精确数字。
- 支持用户不产生额外网络请求。
- 主入口 gzip 增量目标不超过 2 KiB；弹窗独立 chunk 不计入支持用户首屏传输。
- Lighthouse/Performance 面板确认无新增长任务，首屏 LCP/INP 无可归因退化。
- 弹窗打开时不启动 audio Worker；关闭后原页面能力不受影响。

## 七、验证清单

### 1. 机械验证

- `npx tsx --test src/lib/browser-compat.test.ts`
- `npm run build`（主站）
- `npm run build:admin`（运营后台）
- `npm run build:server`（API）
- 运行现有 `npm run test:xm`、`npm run test:m4a`、`npm run test:cover`，确认业务回归。
- 比较改动前后 `dist/assets` gzip 大小和请求清单。

### 2. 浏览器交互验收

- 用 UA/浏览器矩阵验证所有门槛的前一版本和最低版本。
- Safari 14.1 UA：首屏后弹提示；关闭/确定后仍能操作页面；同标签刷新不重复。
- Safari 16.4、Chrome 111、Firefox 114：不弹提示。
- 未知 UA：不弹提示。
- 两个可见按钮、Esc、遮罩均能关闭；埋点 action 正确且每次只发一条。
- 键盘焦点、屏幕阅读器名称、移动端安全区和小屏布局通过。
- 本地同时启动主站、API、后台，确认新字段未被白名单过滤、后台聚合与原始事件一致。

### 3. 本地交付

- 默认只启动 dev server 给项目主验收；发链接前先自行打开确认。
- 主站：`http://localhost:5173`
- 运营后台：`http://localhost:5174/admin/`
- API：`http://localhost:8787`

## 八、上线与观测

只有收到明确“上线/发布”指令后才执行发布。

### 1. 推荐部署顺序

1. API v0.4.9：先让新字段进入白名单并提供聚合。
2. 运营后台 v0.4.15：确认兼容聚合可展示。
3. 主站 v0.8.2：最后开始产生新事件。

`server/**` 合并到 main 后必须额外手动 dispatch：

```bash
gh workflow run deploy.yml --ref main -f target=server
gh run watch
```

确认 server success 后再完成主站/后台 smoke。部署 zip 按项目约定放主仓根目录。

### 2. 上线观测指标

| 验证什么 | 事件/信号 | 期望 | 窗口 |
|---|---|---|---|
| 提示覆盖 | `dialog_browser_compat_view` / 低版本 pageview | 已识别低版本访问能看到提示 | 30 分钟、24 小时 |
| 关闭行为 | confirm / close 分布 | 两种操作都能正常结束弹窗，无重复事件 | 30 分钟 |
| 误伤 | 支持版本出现 view | 必须为 0；出现即回滚判断规则 | 30 分钟、24 小时 |
| Worker 失败 | `UNKNOWN + 处理进程异常退出` 按浏览器版本 | 低版本用户仍可能继续操作并失败，但不再毫无预警 | 24 小时、7 天 |
| 主流程 | 各来源 decrypt success rate | 支持浏览器不低于发布前基线 | 24 小时、7 天 |
| 性能 | 主包 gzip、LCP/长任务 | 符合本计划性能预算 | 发布 smoke、24 小时 |

## 九、明确不做

- 不支持 Safari 14 的 classic Worker 双构建。
- 不把 Worker 改回 IIFE，不牺牲现有 WASM 动态分包。
- 不在弹窗里阻止上传或禁用按钮。
- 不根据未知 UA 猜测不兼容。
- 不远程下发兼容配置，不增加数据库、功能开关或新一级后台页面。
- 本次不把实际 Worker 崩溃改名为 `BROWSER_UNSUPPORTED`；弹窗是前置弱提示，失败错误码治理可另立需求。

## 十、预计文件清单

### 新增

- `src/lib/browser-compat.ts`
- `src/lib/browser-compat.test.ts`
- `src/components/browser-compat-modal.tsx`

### 修改

- `src/App.tsx`
- `vite.config.ts`
- `docs/ANALYTICS_SPEC.md`
- `server/src/routes/track.ts`
- `server/src/routes/adminStats.ts`
- `server/src/lib/browserCompatStats.ts`
- `server/package.json`
- `admin/src/lib/format.ts`
- `admin/src/lib/api.ts`
- `admin/src/pages/Buttons.tsx`
- `admin/package.json`
- `package.json`
- 三端 `package-lock.json`
- `CLAUDE.md`
- `CHANGELOG.md` / 新版复盘与索引（发布阶段）

## 十一、本地执行结果（2026-08-06）

- 兼容性专项：7/7 通过，覆盖 Chrome、Edge、Firefox、Safari、iOS/iPadOS WebKit、
  Android WebView、Client Hints 与未知 UA。
- 既有主流程回归：XM 11 通过 / 1 黄金样本跳过；M4A 1 黄金样本跳过；封面 16 通过 /
  1 黄金样本跳过。跳过项均因本机未配置私有黄金样本，不是测试失败。
- 三端构建：主站 v0.8.2、运营后台 v0.4.15、API v0.4.9 均通过。
- API 实测：隔离临时数据库成功接收 view / confirm / close 三类事件；白名单外探针字段被过滤；
  `/api/admin/stats/buttons` 按浏览器族、检测版本和最低要求正确返回三类 PV/UV。
- 浏览器实测：文案、标题、初始焦点、确定、关闭、Esc、遮罩关闭均通过；受支持的当前浏览器
  在正式入口不弹提示；运营后台表格正确展示 Safari 14.1 → 最低 16.4 及各动作统计。
- 性能实测：100,000 次 Safari UA 判断耗时 117.004 ms，平均 0.00117 ms/次；生产主入口
  gzip 从 135.84 KiB 增至 136.62 KiB（+0.78 KiB，低于 2 KiB 预算）；主 CSS gzip
  +0.44 KiB；弹窗为独立 1.70 KiB gzip 动态 chunk，生产 HTML 不预加载该 chunk。
- 已知基线：定向 lint 未发现本次新增文件或新增代码的错误；仓库仍保留 `App.tsx`、
  `Buttons.tsx` 和既有 server 路由中的 11 项历史 lint 问题，本次没有扩大该集合。
