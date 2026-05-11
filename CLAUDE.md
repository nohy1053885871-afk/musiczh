# 拾音 · 项目说明

加密音乐文件 → MP3/FLAC/OGG 本地转换工具，纯前端，文件全部在浏览器内处理，不上传任何服务器。

支持格式：网易云 .ncm，酷狗 .kgm / .vpr（v2，离线密钥）；以及原始 .flac（自动转 MP3）。
解密后可一键二次转码为 MP3（基于浏览器原生 AudioContext + lamejs，有损）；原始 .flac 上传走同一管线，无需点击按钮。

- 线上主站：https://sleepno.cn
- 运营后台：https://sleepno.cn/admin（仅项目主登录，账号在 server `.env` 里 seed）
- GitHub：https://github.com/nohy1053885871-afk/musiczh
- 当前版本：v0.4.1（运营后台 v0.4.1）
- 上线状态：用户端 ✅ · 运营后台 ✅ · 后端 API ✅（pm2 守护）

> 部署 / 升级 / 运维步骤见本地 [DEPLOY.md](DEPLOY.md)（不进 git）。

## 技术栈

- React 19 + TypeScript
- Tailwind CSS 4（@import "tailwindcss"，无需配置文件）
- Vite 8
- JSZip（打包下载）
- aes-js + browser-id3-writer（NCM 解密 + ID3 标签）
- @breezystack/lamejs（lamejs 的 ESM 维护 fork，强制转 MP3 时动态加载）

## 项目结构

仓库下三个**独立子项目**，互不依赖：用户端（根目录 `src/`）、运营后台前端（`admin/`）、后端 API（`server/`）。改任一不会牵连其他构建/部署。

```
src/                     # 用户端（拾音主站）
  App.tsx                # 全部 UI + 状态逻辑（单页，无路由）
  index.css              # Tailwind 入口 + vinyl-spin 动画 + color-scheme: light
  lib/
    types.ts             # 跨解密器共享类型：DecryptError / DecryptResult / AudioMeta
    decrypt.ts           # 统一入口，按扩展名分发到 ncm.ts / kgm.ts
    ncm.ts               # 网易云 NCM 解密：AES → RC4 流 → Blob + ID3
    kgm.ts               # 酷狗 KGM/VPR v2 解密：表查 + XOR；首次使用懒加载 mask
    transcode.ts         # FLAC/OGG → MP3：AudioContext 解码 + lamejs 编码
    analytics.ts         # 数据埋点 SDK（详见 docs/ANALYTICS_SPEC.md）

admin/                   # 运营后台前端（独立 vite 项目，base: '/admin/'）
  src/{pages,components,lib}/
  vite.config.ts | package.json | tsconfig.json

server/                  # 后端 API（Hono + better-sqlite3 + JWT）
  src/{routes,middleware,lib,seed}/
  schema.sql             # events / failures / admins / feature_flags
  ecosystem.config.cjs   # pm2 守护配置
  .env.example           # ADMIN_USERNAME / ADMIN_PASSWORD_HASH / JWT_SECRET / RETENTION_DAYS

docs/
  ANALYTICS_SPEC.md      # 埋点规范文档（事件全表 + 中文描述 + 字段白名单）

public/
  favicon.svg            # 黑胶唱片 SVG 图标
  icons.svg
  kgm-v2-mask.bin     # KGM 解密用查表（gzip 流，但不加 .gz 后缀避免 server/浏览器自动解压），当前 1.1MB（覆盖 ≤100MB KGM）；扩 mask 到 2.2MB 后可覆盖 ≤200MB（脚本见 scripts/build-kgm-mask.ts）
```

## 需求归属速查（关键词 → 改哪个子项目）

| 关键词 / 描述 | 改动范围 | 入口文件 |
|---|---|---|
| 解密 / 转码 / 上传 UI / 拖拽 / 主站按钮 / 主站文案 / 黑胶动画 | **主站** | `src/App.tsx` · `src/lib/{decrypt,ncm,kgm,transcode}.ts` |
| 数据看板 / 折线图 / 漏斗 / 失败日志页 / 登录页 / 时间筛选 / 后台 UI | **运营后台前端** | `admin/src/pages/{Overview,Buttons,Failures,Login}.tsx` · `admin/src/components/` |
| `/api/track` / 鉴权 / SQLite / DDL / 数据保留 cron / 后端聚合查询 | **后端 API** | `server/src/routes/` · `server/src/schema.sql` · `server/src/middleware/` |
| 埋点（新事件 / 新接入点 / 字段白名单） | **跨子项目** | `src/lib/analytics.ts` + `src/App.tsx` 调用点 + `server/src/routes/track.ts` + `docs/ANALYTICS_SPEC.md`（必登记） |
| 部署 / 打包 / nginx / pm2 / `.env` / 备份 | **不改代码** | [DEPLOY.md](DEPLOY.md) |

## 给 Claude 的工作指引

- 用户描述需求时通常会点出"主站"/"运营后台"/"后端"/"埋点"——先据此锁定子项目，再 Read 相关文件，**不要全量探索**
- 三个子项目互相**解耦**：改任一不重新构建另两个；跨端改动需明确列出每端的改动清单
- 改完只重新构建/部署对应端，**不要** `npm run build` 全量打
- 新增按钮 → 同时埋 `*_view`（曝光，用 `useImpression` hook）和 `*_click`（点击）
- 新增异步流程 → 同时埋 `*_start` 与 `*_done` / `*_fail`，失败必走 `analytics.trackFailure`
- 任何新增事件，先在 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) 事件全表登记一行（含中文描述），再在 `admin/src/lib/format.ts` 的 `EVENT_LABELS` 加映射

## 核心数据结构

```typescript
type TrackedFile = {
  id: string
  file: File
  status: 'pending' | 'decrypting' | 'done' | 'failed' | 'transcoding'
  progress: number        // 0–1
  result?: DecryptResult  // { audio: Blob, format: 'mp3'|'flac'|'ogg', meta, cover, suggestedName }
  coverUrl?: string       // blob URL 或 meta.albumPic CDN 地址
  errorCode?: DecryptErrorCode
  errorMessage?: string
}
```

## 限制规则

- 单文件最大 200MB（NCM / 原始 FLAC 全量支持；KGM / VPR 当前 mask 仅覆盖 ≤100MB，100-200MB 会在解密阶段抛 FILE_TOO_LARGE，等 mask 资产扩容后才能完整支持 200MB）
- 列表累计最多 50 个
- 超限时 warning 横幅 5 秒自动消失

## 常用命令

```bash
# 用户端
npm run dev          # http://localhost:5173
npm run build        # 产物 dist/

# 运营后台前端（独立子项目）
npm run dev:admin    # http://localhost:5174/admin/
npm run build:admin  # 产物 admin/dist/

# 后端 API（用 tsx 直接跑 TS 源码，无构建步骤）
npm run dev:server   # http://localhost:8787（tsx watch，热重载）
```

## 部署

三子项目独立部署到三个不同目录，nginx 路由分流。**详细步骤、命令、踩坑记录见本地 [DEPLOY.md](DEPLOY.md)**。

| 子项目 | 服务器目录 | nginx |
|---|---|---|
| 用户端 | `/www/wwwroot/musiczh/` | `location /` |
| 运营后台前端 | `/www/wwwroot/musiczh-admin/` | `location ^~ /admin/`（alias + named location 处理 SPA fallback） |
| 后端 API | `/www/wwwroot/musiczh-api/` （pm2 守护，Node 20+） | `location /api/` 反代 `127.0.0.1:8787` |

- 服务器：阿里云 ECS，宝塔面板管理
- 部署 zip 命名：`musiczh-{user,admin,api}-vX.Y.Z-YYYYMMDD.zip`，统一落主仓根目录 `/Users/bojue/musiczh/`
- 后端 API 用 tsx 直接跑 TS 源码，部署包不带 `node_modules`，服务器上 `npm install` 装
- SQLite 每日 04:00 由宝塔计划任务备份到 `/www/backup/musiczh/`，保留 30 天
- 后端启动时自动跑 **365 天**保留策略 cron（每日 03:00 清理 events / failures）

## 数据埋点

详见 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md)：事件全表（含中文描述列）、字段白名单、新功能上线 checklist。
新增按钮 / 新增异步流程 → 必须先在该文档登记一行，再合并 PR。

## 设计规范

iOS 6 软拟物复古风（Light Skeuomorphic），详见 [DESIGN_SPEC.md](DESIGN_SPEC.md)（v2.0，唯一来源）。

- Header `#1C1A18` 深色锚点；页面底色 `#ECEAE6`（冷调暖灰，**不再是米黄**）
- 层次：拖拽区 `#E4E2DC`（凹）/ 卡片 `#F4F2EE`（凸）/ done 行 `#F0EEE9` / failed 行 `#EBE4E2`
- CTA 渐变：`#F05A2A → #C4310E`；成功态 `#3A9B5C → #236B3A`；错误文字 `#B83020`
- 圆角：大容器 `rounded-2xl`(16) / 列表行 `rounded-xl`(12) / 按钮 `rounded-md`(6) / 封面 & 徽章 `rounded`(4)
- 字重只用两级：`font-medium` + `font-normal`；品牌名 Noto Serif SC `font-semibold` 是唯一例外，**禁用 `font-bold`** 与 Inter / Roboto 等额外字体
- 软拟物核心 = 阴影分层（顶高光 + 底压暗 + 外投影），不靠颜色对比拉层次；详细 token 见 spec 第三节
- 黑胶唱片旋转：`vinyl-spin`（4s 主盘）/ `vinyl-spin-fast`（1.6s，列表迷你盘）
- 强制亮色：`color-scheme: light`（防止浏览器强制深色模式）

## 待做事项

- [ ] CI/CD：GitHub Actions 自动构建 + rsync 部署到服务器
- [ ] FLAC 文件 Vorbis Comments + PICTURE block 标签写入
- [ ] 移动端适配优化
- [ ] 移动端 .flac >100MB 上传时给软提示（避免 transcodeToMp3 一次性 PCM 解码导致 Safari OOM 闪退）
- [ ] FLAC 流式转码改造（用 WASM FLAC decoder 取代 AudioContext.decodeAudioData，把内存峰值从 ~1GB 降到 ~50MB）
- [ ] QQ 音乐 / 酷我音乐 / 酷狗 v4 格式支持
- [ ] 运营后台：admin/dist 主 chunk 618KB，按页面 lazy load Recharts
- [ ] 运营后台：本期只做数据看板，下一期接「功能开关 / 配置中心」（DDL 已留 `feature_flags` 空表）
- [ ] 后端：失败堆积告警邮件（达到阈值通知项目主）

## 已完成（v0.4.1 / 运营后台 v0.4.1 · 20260512 上线）

- **修曝光埋点 `useImpression` 在动态行上失效**：旧版 `useRef + useEffect([event])` 在 FileRow 内 conditional render 的按钮上 ref 始终为 null，5 个 view 事件（btn_transcode / row_download / row_retry / row_remove / btn_transcode_view）长期 0 上报；改 callback ref + useState(node) 后 DOM 挂载时自动重绑 observer
- **心跳 + 中止事件**：`transcode_progress` 按 0.1/0.3/0.5/0.7/0.9 五桶 emit；analytics SDK 维护 inflight Map，`pagehide` / `visibilitychange=hidden` 时遍历未结束文件 emit `decrypt_abandon` / `transcode_abandon`（含 last_progress / stage），sendBeacon 兜底——定位 auto-FLAC 静默崩的核心手段
- **全链路 file_id**：addFiles 用 `crypto.randomUUID()` 给每文件生成 UUID，贯穿 upload_attempt → decrypt_*/transcode_* 全部事件；后端 events 表加 VIRTUAL 生成列 + 索引（`idx_events_file_id`），按 file_id 关联出每条上传的 pipeline_status（success/failed/abandoned/pending/legacy）
- **运营后台「上传日志」状态列合并**：旧的「类型」+「拒绝原因」两列合并为单一「状态」列（被拒-格式/被拒-大小/被拒-队列/成功/失败/中止/未完成/-（历史）），筛选器同步合并；Drawer 加事件时间线（同 file_id 所有事件按时序列出）
- **运营后台上传日志页底部新增两张图**：「上传趋势」单图双 Y 轴 10 series 折线（数量类左 Y + 占比类右 Y，可勾选切换）；「按格式维度拆解」ComposedChart（柱状成功/失败 + 折线成功率/格式占比）
- **运营后台 Overview「上传文件总数」卡片拆分小字重梳**：旧 4 段（被拒/解密/原 flac/未完成）→ 新 6 段（成功/失败/中止/被拒/未完成/历史），按 file_id 精确口径
- 顺手修「超出 100MB」老 bug → 「超出 200MB」（admin REJECT 标签 + UploadsSection 文案）

## 已完成（v0.4.0 / 运营后台 v0.4 · 20260510 上线）

- **单文件上限 100MB → 200MB**：NCM / 原始 FLAC 全量支持；KGM/VPR 因 mask 资产暂未扩容，仍 ≤100MB 才能解（100-200MB 会抛 FILE_TOO_LARGE）。扩容脚本见 `scripts/build-kgm-mask.ts`
- **原始 .flac 上传自动转 MP3**：跳过解密，进队列后立即走 transcode 路径；`transcode_done` 不带 `source` 用于运营后台口径区分
- **运营后台「转换成功」**：Overview 顶部新增「转换成功数（件）」卡片（口径 = 解密成功 + 原始 flac 转码成功，悬停 InfoIcon 看说明）；漏斗第二层从「解密成功」改为「转换成功」，相同口径，**人维度 / 件维度同步**；同一文件先解密再转码不会被双计数

## 已完成（运营后台 v0.3 · 20260510 上线）

- **上传日志**：`upload_attempt`（每个文件成功一条）/ `upload_reject`（每个被拒一条 + reject_reason），运营后台「解密分析 → 上传日志」可看格式/大小/数量超限明细
- **下载日志**：`download_done` / `download_fail` 三种 `download_kind`（single / all_separate / zip），ZIP 打包失败 + Blob URL 异常都有兜底
- **全链路漏斗**：Overview 漏斗扩到双口径——人维度 4 层（访问→上传→解密→下载） / 件维度 3 层（上传→解密→下载），柱条上方标层间转化率
- **解密分析页**：从顺序排版改为 Tab 结构（上传日志 / 解密日志 / 下载日志 / 格式分布），每个 Section 拆到独立文件
- 上传/下载日志列带浏览器/操作系统/设备 3 列，复用后端 `parseUA` 共享 helper

## 已完成（v0.2.0 · 20260508 上线）

- 运营后台数据看板（PV/UV、人/件维度核心 8 指标、漏斗、多选指标趋势、按钮埋点曝光+点击+CTR、失败日志详情可复制 JSON）
- 全站埋点 SDK（visitor_id、session_id、批量上报、sendBeacon 兜底、IntersectionObserver 曝光观察器）
- 主站全部按钮接入 `useImpression` 曝光 + `analytics.track` 点击 +`trackFailure` 失败上报
- 后端 Hono + better-sqlite3 + JWT (HttpOnly Cookie) + 单管理员 seed
- 时间筛选：今日 / 7天 / 30天 / 90天 / 1年 / 自定义日期范围
- 数据保留 365 天，每日 03:00 自动清理；SQLite 每日 04:00 备份保留 30 天

# 通用
- 优先选择编辑而非重写整个文件
- 除非文件被编辑过，否则不要重复阅读已读过的文件
- 输出追求简洁，但推理过程必须详尽

# 代码规范
- 一个文件不超过 400 行，超了就拆
- 嵌套不超过 4 层
