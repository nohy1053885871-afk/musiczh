# 拾音 · 项目说明

加密音乐文件 → MP3/FLAC/OGG/M4A 本地转换工具，纯前端，文件全部在浏览器内处理，不上传任何服务器。

支持格式：网易云 .ncm，酷狗 .kgm / .vpr（v2，离线密钥），QQ 音乐 .mflac / .mgg / .qmcflac / .qmcogg 等 QMCv2 系列（**仅 v19.51 旧版 Windows** 客户端下载的文件；新版 STag 标记会精准拦截并引导），喜马拉雅 .xm（v2）；以及原始 .flac / .ogg / .m4a（自动转 MP3）。
解密后按真实字节保持 MP3/FLAC/OGG/M4A 原格式；FLAC/OGG/M4A 可一键二次转码为 MP3（WASM 流式解码 + LAME WASM VBR -V 2，平均 ~190 kbps；支持 Hi-Res，>48kHz 输出钉 48kHz 重采样）。M4A 只在实际进入转码时动态加载 Mediabunny，并优先用 WebCodecs 解 AAC，失败再加载裁剪版 LibAV.js。解密与转码计算全部跑在 Web Worker（v0.7.0 起），主线程只管 UI。

- 线上主站：https://sleepno.cn
- 运营后台：https://sleepno.cn/admin（仅项目主登录，账号在 server `.env` 里 seed）
- GitHub：https://github.com/nohy1053885871-afk/musiczh
- 当前开发版本：v0.8.0（运营后台 v0.4.14，API v0.4.8）
- 当前生产版本：主站 v0.7.4 · 运营后台 v0.4.13 · API v0.4.8
- 上线状态：v0.8.0 / v0.4.14 待本地验收，尚未发布；现网三端正常

> 部署 / 升级 / 运维步骤见本地 [DEPLOY.md](DEPLOY.md)（不进 git）。

## 技术栈

- React 19 + TypeScript
- Tailwind CSS 4（@import "tailwindcss"，无需配置文件）
- Vite 8
- JSZip（打包下载）
- aes-js + browser-id3-writer（NCM 解密 + ID3 标签）
- wasm-media-encoders（LAME 3.100 的 WebAssembly 编译版，强制转 MP3 时动态加载；v0.6.2 起从 lamejs 换过来，拿到 LAME VBR 模式，输出 -V 2 ~190 kbps）
- @wasm-audio-decoders/flac + ogg-vorbis（libFLAC / libvorbis 的 WASM 流式解码器，v0.7.0 起取代 AudioContext.decodeAudioData：2MB 分块解码、PCM 即用即弃，内存峰值与文件大小解耦，并解锁 Hi-Res FLAC）
- Mediabunny（M4A/MP4 解封装 + WebCodecs AAC 解码，用户主动转 M4A 时动态加载）
- LibAV.js 6.9.8.1 自定义 LGPL WASM fallback（仅 MOV/MP4 demux + AAC decoder + 重采样；本站托管，构建配置见 `vendor/libav/`）

## 项目结构

仓库下三个**独立子项目**，互不依赖：用户端（根目录 `src/`）、运营后台前端（`admin/`）、后端 API（`server/`）。改任一不会牵连其他构建/部署。

```
src/                     # 用户端（拾音主站）
  App.tsx                # 全部 UI + 状态逻辑（单页，无路由）
  index.css              # Tailwind 入口 + vinyl-spin 动画 + color-scheme: light
  lib/
    types.ts             # 跨解密器共享类型：DecryptError / DecryptResult / AudioMeta
    decrypt.ts           # 统一入口，按扩展名分发到 ncm.ts / kgm.ts / qmc.ts / xm.ts
    ncm.ts               # 网易云 NCM 解密：AES → RC4 流 → Blob + ID3
    kgm.ts               # 酷狗 KGM/VPR v2 解密：表查 + XOR；首次使用懒加载 mask
    qmc.ts               # QQ 音乐 QMCv2 解密入口（v0.6.0 新增）：footer 解析 + cipher 分发
    xm-id3.ts            # 喜马拉雅 XM 的 ID3 特征/字段解析
    xm.ts                # 喜马拉雅 XM v2 两阶段 AES-CBC 解密 + 产物 magic 校验
    m4a.ts               # M4A：Mediabunny/WebCodecs 主路径 + LibAV.js fallback
    qmc/                 # QMCv2 算法（移植自 unlock-music MIT mirror ipid/unlock-music）
      cipher.ts          #   QmcStatic / QmcMap / QmcRC4 三种 stream cipher
      key.ts             #   TEA-CBC key 派生（base64 + 双层 mix key + 自定义包裹）
      tea.ts             #   TEA cipher（Tiny Encryption Algorithm）
      handler-map.ts     #   扩展名 → 目标格式映射 + QMC_EXT_REGEX
    transcode.ts         # FLAC/OGG/M4A → MP3：流式解码 + LAME 流式编码
    sniff.ts             # 文件头 magic 识别 + 扩展名兜底，输出 RealFormat
    analytics.ts         # 数据埋点 SDK（详见 docs/ANALYTICS_SPEC.md）
    worker/              # Web Worker 管道（v0.7.0 新增）：解密/转码计算全部出主线程
      protocol.ts        #   消息协议 + DecryptError 跨线程序列化/重建（唯一真源）
      audio.worker.ts    #   Worker 入口：串行消化请求，progress 100ms 节流回报
      client.ts          #   主线程代理：保持 decryptAudioFile/transcodeToMp3 原签名，崩溃自愈
  components/
    v050.tsx             # v0.5.0 弹窗 / 横条组件
    qq-guide.tsx         # v0.6.0 QQ 音乐使用说明弹窗 + 拖拽区下方入口
    support-matrix.tsx   # v0.6.0 平台/格式总览弹窗 + 拖拽区下方入口

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
  libav/              # M4A fallback 的裁剪 LibAV.js 资产（按需加载）

vendor/libav/         # LibAV.js 固定配置、版本、哈希与可复现构建说明
```

## 需求归属速查（关键词 → 改哪个子项目）

| 关键词 / 描述 | 改动范围 | 入口文件 |
|---|---|---|
| 解密 / 转码 / 上传 UI / 拖拽 / 主站按钮 / 主站文案 / 黑胶动画 | **主站** | `src/App.tsx` · `src/lib/{decrypt,ncm,kgm,qmc,transcode}.ts` · `src/lib/qmc/*` |
| 数据看板 / 折线图 / 漏斗 / 失败日志页 / 登录页 / 时间筛选 / 后台 UI | **运营后台前端** | `admin/src/pages/{Overview,Buttons,Failures,Login}.tsx` · `admin/src/components/` |
| `/api/track` / 鉴权 / SQLite / DDL / 数据保留 cron / 后端聚合查询 | **后端 API** | `server/src/routes/` · `server/src/schema.sql` · `server/src/middleware/` |
| 埋点（新事件 / 新接入点 / 字段白名单） | **跨子项目** | `src/lib/analytics.ts` + `src/App.tsx` 调用点 + `server/src/routes/track.ts` + `docs/ANALYTICS_SPEC.md`（必登记） |
| 部署 / 打包 / nginx / pm2 / `.env` / 备份 | **不改代码** | [DEPLOY.md](DEPLOY.md) |

## 给 Agent 的工作指引

> 本文件由 Claude Code（`CLAUDE.md`）与 Codex（`AGENTS.md` 软链接指向本文件）**共读一份**。改说明只改 `CLAUDE.md` 本体，别动 `AGENTS.md` 软链接。两个工具之间没有共享记忆，唯一协同介质是 git + 本文档：分工按子项目/目录物理隔离，同一文件（尤其 `src/App.tsx`）一次只让一个工具改，勤 commit 小粒度。

- 用户描述需求时通常会点出"主站"/"运营后台"/"后端"/"埋点"——先据此锁定子项目，再 Read 相关文件，**不要全量探索**
- 三个子项目互相**解耦**：改任一不重新构建另两个；跨端改动需明确列出每端的改动清单
- 改完只重新构建/部署对应端，**不要** `npm run build` 全量打
- 新增按钮 → 同时埋 `*_view`（曝光，用 `useImpression` hook）和 `*_click`（点击）
- 新增异步流程 → 同时埋 `*_start` 与 `*_done` / `*_fail`，失败必走 `analytics.trackFailure`
- 任何新增事件，先在 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) 事件全表登记一行（含中文描述），再在 `admin/src/lib/format.ts` 的 `EVENT_LABELS` 加映射
- 🚨 **改了 `server/**` 的 PR 合到 main 后，必须额外手动 dispatch 后端部署**：GitHub Actions 的 deploy-server job **故意不在 push 时触发**（防坏版本 502 整站挂），条件是 `workflow_dispatch || refs/tags/v*`。merge 完跑 `gh workflow run deploy.yml --ref main -f target=server` + `gh run watch` 看 success 才算上线完成；前端 `?? 0` fallback 会把"字段缺失"伪装成"零数据"，光看 UI 不报错 ≠ 后端真的上了

## 项目主的隐性约定（代码/git 里看不出，两个工具都要遵守）

这些是项目主口头给过、但代码和提交历史里推不出来的规则，写在这里让任何 Agent 都能读到：

- **交互语言**：所有回复用中文。
- **UI 文案通用化**：面向用户的提示语说"音频文件"，**不要枚举具体扩展名**（.ncm/.kgm/...），格式列表只在文档和说明弹窗里出现。
- **前端改动给本地测试链接**：需要用户验证时主动起 dev server 把 localhost 链接发过去，**发之前自己先打开确认能进**。
- **两段式发布**：改完默认只起 dev 让用户本地验证；用户明确说「上线/发布」后，才一口气跑 commit→PR→merge→tag→CI→smoke 全链路。
- **部署 zip 落主仓根目录** `/Users/bojue/musiczh/`，命名 `musiczh-{user,admin,api}-vX.Y.Z-YYYYMMDD.zip`，不要留在 worktree 内。
- **运营后台（`admin/`）与主站解耦**：版本号独立编号（当前开发版 v0.4.14，与主站 v0.8.0 无关）；技术/设计栈可自由引入 antd 等成熟组件库，**不必**沿用主站暖色拟物风。本地测试 admin 默认 seed 账号 `admin/admin123`。
- **工程原则·校验输出而非只校验输入**：解密/解析代码必须校验产物 magic，权威信号（真实字节）优先于元数据；偏移/解析失败用 magic 锚定自愈，绝不放乱码产物下游。
- **迭代复盘**：`docs/retrospectives/` 每版一个文件（`NN-版本-日期.md`）+ README 索引；新迭代起手先读最新一篇的 action items。较大功能的发布计划里必须列「上线观测指标」（验证什么 / 看哪个事件 / 期望趋势 / 评估窗口）。
- **较大运营/流量/SEO 需求**：先读 `docs/ops/2026-05-user-growth.md`。

## 核心数据结构

```typescript
type TrackedFile = {
  id: string
  file: File
  status: 'pending' | 'decrypting' | 'done' | 'failed' | 'transcoding'
  progress: number        // 0–1
  result?: DecryptResult  // { audio: Blob, format: 'mp3'|'flac'|'ogg'|'m4a', meta, cover, suggestedName }
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

iOS 6 软拟物复古风（Light Skeuomorphic），详见 [DESIGN_SPEC.md](DESIGN_SPEC.md)（v3.1，唯一来源；网页 + 小程序双端：§一~§十五 跨端共享 token，§十六 小程序/移动端专章）。

- Header `#1C1A18` 深色锚点；页面底色 `#ECEAE6`（冷调暖灰，**不再是米黄**）
- 层次：拖拽区 `#E4E2DC`（凹）/ 卡片 `#F4F2EE`（凸）/ done 行 `#F0EEE9` / failed 行 `#EBE4E2`
- CTA 渐变：`#F05A2A → #C4310E`；成功态 `#3A9B5C → #236B3A`；错误文字 `#B83020`
- 圆角：大容器 `rounded-2xl`(16) / 列表行 `rounded-xl`(12) / 按钮 `rounded-md`(6) / 封面 & 徽章 `rounded`(4)
- 字重只用两级：`font-medium` + `font-normal`；品牌名 Noto Serif SC 与黑胶中心文字「拾音」`font-semibold` 是唯一例外，**禁用 `font-bold`** 与 Inter / Roboto 等额外字体
- 软拟物核心 = 阴影分层（顶高光 + 底压暗 + 外投影），不靠颜色对比拉层次；详细 token 见 spec 第四节
- 黑胶唱片旋转：`vinyl-spin`（4s 主盘）/ `vinyl-spin-fast`（1.6s，列表迷你盘）
- 强制亮色：`color-scheme: light`（防止浏览器强制深色模式）

## 待做事项

- [ ] CI/CD：GitHub Actions 自动构建 + rsync 部署到服务器
- [ ] 移动端适配优化
- [ ] KGM mask 资产扩容 1.1MB → 2.2MB，让 100-200MB 的 KGM/VPR 不再抛 FILE_TOO_LARGE（脚本 scripts/build-kgm-mask.ts 现成；下期候选）
- [ ] ZIP 打包流式化：JSZip generateAsync 整包驻留内存，批量下载大文件时是下一个内存峰值点（复盘 #5 ZIP_FAILED 37 次 / 18 UV；下期候选）
- [ ] QQ 音乐 macOS / 移动端方案（v0.6.0 Windows 版已完成 + 旧版安装包托管引导，但 macOS 用户尚无路径）
- [ ] 酷我音乐 .kwm 格式支持
- [ ] 酷狗 v4 / KGG 格式支持（联网密钥协议，需后端代理）
- [ ] 三解密器（ncm/kgm/qmc）逐字段 vs unlock-music 完整规范对账，把"跳过了哪些字段、为什么安全"写进注释（v0.7.1 修的 imageSpace bug 就是照教程简化版埋的雷；下期候选）
- [ ] KGM/QMC 封面"搜图回填"：这两类容器不带 albumPic URL（封面只在解密产物自带 ID3/FLAC 标签里），要给无封面文件补图只能按 标题+歌手 或 QQ songId（qmc.ts 已能解出、未用）查外部 API——需先评估搜索 API 的 CORS / 是否要后端代理 / 匹配准确性 / 隐私（下期候选）
- [ ] QMC 新版 STag 文件长期方案：v0.6.0 仅引导用旧版重下；未来若有官方/社区的离线 ekey 获取通道可考虑接入
- [ ] QQ 旧版安装包定期复查 sha256（docs/QQ_INSTALLER_SHA256.md，物理目录 `/www/wwwroot/musiczh-downloads/`），确保服务器 /downloads/ 未被替换；建议每月外网 curl 一次
- [ ] 运营后台：admin/dist 主 chunk 618KB，按页面 lazy load Recharts（下期候选）
- [ ] 运营后台：本期只做数据看板，下一期接「功能开关 / 配置中心」（DDL 已留 `feature_flags` 空表）
- [ ] 后端：失败堆积告警邮件（达到阈值通知项目主）
- [ ] 2026-07 评估：若 1-2 月内「上传文件总数（旧口径）」与新口径偏差稳定收敛，移除观察卡片 + 后端 upload_files_legacy 字段（v0.4.3 引入）

## 已完成（最近 2 个版本）

> 更早的历史版本归档在 [CHANGELOG.md](CHANGELOG.md)，按需 Read。写新版本时：本节累计到 3 个就把最旧的一段挪进 CHANGELOG.md，保持本节常驻只 2 个版本。

### v0.8.0 / 运营后台 v0.4.14 · 20260728 待发布

- **喜马拉雅 XM v2**：新增独立 ID3 特征解析和两阶段 AES-CBC 解密；产物严格按真实 magic 输出 MP3/FLAC/OGG/M4A，v12 精准提示不支持，损坏产物不进入下载/转码
- **统一一键转 MP3**：保留原 `FlacBatchPromptBanner` 和历史埋点名，只把统一可转码集合扩为 FLAC/OGG/M4A；M4A 默认保持原格式，用户点击后才转
- **M4A 双解码路径**：Mediabunny + WebCodecs 为主，裁剪版 LibAV.js 6.9.8.1/FFmpeg 8.1 WASM 为 fallback；PCM 复用既有 LAME VBR -V 2 管线
- **原始 M4A 上传**：与原始 FLAC/OGG 一样按真实 magic 准入，上传后自动转 MP3；MP4 ilst 中的标题、作者、专辑和 covr 会迁移到 MP3
- **XM 封面**：兼容 XM 非标准 UTF-16 COMM，从外层标签取得喜马拉雅 CDN 封面；M4A 无损重封装写入 covr（AAC packets 不变），转 MP3 时写入 ID3 APIC
- **MP3 封面兼容**：写入 APIC 前统一检查封面；已兼容的 JFIF Baseline JPEG 原样保留，Progressive/Adobe/非 JFIF 图片转为 sRGB JFIF Baseline JPEG，覆盖 NCM、XM 和 FLAC/OGG/M4A 转 MP3
- **用户端与后台**：首页入口、格式矩阵、SEO/FAQ/JSON-LD、XM/M4A 徽章，以及后台格式筛选、颜色、来源/错误码/事件中文标签同步更新；事件名和后端 API/数据库不变
- **发布安全**：前端部署增加带 commit/版本/全量 SHA-256 的三份快照、失败自动恢复和 `user/admin/all` 手动回滚 workflow；本版不修改或部署 server
- 验证：XM 合成、原始 M4A 准入、VPR 分发与真实黄金样本 12/12，M4A covr 重封装专项 1/1，MP3 封面格式专项 2/2；WebCodecs/LibAV 双路径、原始 M4A 自动转码、XM 封面下载、转码失败恢复、混合批量气泡和后台 XM/M4A 筛选均完成浏览器验收；问题样本 APIC 已由 1000×1000 Progressive Adobe JPEG 转为 sRGB JFIF Baseline JPEG，并在 macOS Apple Music 的专辑卡片和播放栏实机显示；封面重封装前后 AAC 14,757 包 SHA-256 一致，NCM/KGM/QMC 旧样本与改动前输出 SHA-256/元数据一致；主站/后台独立构建及部署清单全资源 smoke 通过

### 运营后台 v0.4.13 / API v0.4.8 · 20260721 上线

- **首页查询性能重构**：新增单接口 `GET /api/admin/stats/overview-bundle`，一次返回概览、漏斗、全部日趋势和设备组合；首页从至少 7 个并发请求改成 1 个请求，指标切换只在前端重绘
- **止血层**：原始事件统计合并为条件聚合，60 秒成功结果缓存，相同范围并发请求合并；重 SQL 全部隔离到独立 Worker Thread，主线程继续处理 `/api/track`
- **日汇总层**：新增日指标、精确日访客、file_id 终态、逐上传事件状态和游标五张表；按 `events.id` 每 30 秒增量处理，精确跨日 UV，首尾不完整日期回读原始事件；逐上传表兼容生产少量重复 file_id，严格保持旧口径
- **安全迁移**：独立可恢复回填 CLI 每批 10,000 行，追平尾部后对今日、7/30/90/365 天和两个自定义区间自动对账；全部一致才切 `ready`，异常或落后自动 `raw_fallback`，可用一条状态命令回滚
- **前端体验**：切换范围会取消过期请求并保留旧数据；统一 loading，显示数据更新时间；汇总降级时展示低干扰提示；设备数据改为组合计数并保留交叉筛选
- 验证：后端首页专项测试 3/3、server/admin 独立构建、本地 Worker/缓存/回退/回填端到端、1280px 浏览器验收全部通过；生产观测见 [复盘 #6](docs/retrospectives/06-admin-v0.4.13-20260721.md)


# 通用
- 优先选择编辑而非重写整个文件
- 除非文件被编辑过，否则不要重复阅读已读过的文件
- 输出追求简洁，但推理过程必须详尽

# 代码规范
- 一个文件不超过 400 行，超了就拆
- 嵌套不超过 4 层
