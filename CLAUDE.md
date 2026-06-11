# 拾音 · 项目说明

加密音乐文件 → MP3/FLAC/OGG 本地转换工具，纯前端，文件全部在浏览器内处理，不上传任何服务器。

支持格式：网易云 .ncm，酷狗 .kgm / .vpr（v2，离线密钥），QQ 音乐 .mflac / .mgg / .qmcflac / .qmcogg 等 QMCv2 系列（**仅 v19.51 旧版 Windows** 客户端下载的文件；新版 STag 标记会精准拦截并引导）；以及原始 .flac（自动转 MP3）。
解密后可一键二次转码为 MP3（WASM 流式解码 libFLAC/libvorbis + LAME WASM VBR -V 2，平均 ~190 kbps，接近无损；支持 Hi-Res，>48kHz 输出钉 48kHz 重采样）；原始 .flac / .ogg 上传走同一管线，无需点击按钮。解密与转码计算全部跑在 Web Worker（v0.7.0 起），主线程只管 UI。

- 线上主站：https://sleepno.cn
- 运营后台：https://sleepno.cn/admin（仅项目主登录，账号在 server `.env` 里 seed）
- GitHub：https://github.com/nohy1053885871-afk/musiczh
- 当前版本：v0.7.0（运营后台 v0.4.9）
- 上线状态：用户端 ✅ · 运营后台 ✅ · 后端 API ✅（pm2 守护）

> 部署 / 升级 / 运维步骤见本地 [DEPLOY.md](DEPLOY.md)（不进 git）。

## 技术栈

- React 19 + TypeScript
- Tailwind CSS 4（@import "tailwindcss"，无需配置文件）
- Vite 8
- JSZip（打包下载）
- aes-js + browser-id3-writer（NCM 解密 + ID3 标签）
- wasm-media-encoders（LAME 3.100 的 WebAssembly 编译版，强制转 MP3 时动态加载；v0.6.2 起从 lamejs 换过来，拿到 LAME VBR 模式，输出 -V 2 ~190 kbps）
- @wasm-audio-decoders/flac + ogg-vorbis（libFLAC / libvorbis 的 WASM 流式解码器，v0.7.0 起取代 AudioContext.decodeAudioData：2MB 分块解码、PCM 即用即弃，内存峰值与文件大小解耦，并解锁 Hi-Res FLAC）

## 项目结构

仓库下三个**独立子项目**，互不依赖：用户端（根目录 `src/`）、运营后台前端（`admin/`）、后端 API（`server/`）。改任一不会牵连其他构建/部署。

```
src/                     # 用户端（拾音主站）
  App.tsx                # 全部 UI + 状态逻辑（单页，无路由）
  index.css              # Tailwind 入口 + vinyl-spin 动画 + color-scheme: light
  lib/
    types.ts             # 跨解密器共享类型：DecryptError / DecryptResult / AudioMeta
    decrypt.ts           # 统一入口，按扩展名分发到 ncm.ts / kgm.ts / qmc.ts
    ncm.ts               # 网易云 NCM 解密：AES → RC4 流 → Blob + ID3
    kgm.ts               # 酷狗 KGM/VPR v2 解密：表查 + XOR；首次使用懒加载 mask
    qmc.ts               # QQ 音乐 QMCv2 解密入口（v0.6.0 新增）：footer 解析 + cipher 分发
    qmc/                 # QMCv2 算法（移植自 unlock-music MIT mirror ipid/unlock-music）
      cipher.ts          #   QmcStatic / QmcMap / QmcRC4 三种 stream cipher
      key.ts             #   TEA-CBC key 派生（base64 + 双层 mix key + 自定义包裹）
      tea.ts             #   TEA cipher（Tiny Encryption Algorithm）
      handler-map.ts     #   扩展名 → 目标格式映射 + QMC_EXT_REGEX
    transcode.ts         # FLAC/OGG → MP3：WASM 流式解码（2MB 分块）+ LAME 流式编码
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
```

## 需求归属速查（关键词 → 改哪个子项目）

| 关键词 / 描述 | 改动范围 | 入口文件 |
|---|---|---|
| 解密 / 转码 / 上传 UI / 拖拽 / 主站按钮 / 主站文案 / 黑胶动画 | **主站** | `src/App.tsx` · `src/lib/{decrypt,ncm,kgm,qmc,transcode}.ts` · `src/lib/qmc/*` |
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
- 🚨 **改了 `server/**` 的 PR 合到 main 后，必须额外手动 dispatch 后端部署**：GitHub Actions 的 deploy-server job **故意不在 push 时触发**（防坏版本 502 整站挂），条件是 `workflow_dispatch || refs/tags/v*`。merge 完跑 `gh workflow run deploy.yml --ref main -f target=server` + `gh run watch` 看 success 才算上线完成；前端 `?? 0` fallback 会把"字段缺失"伪装成"零数据"，光看 UI 不报错 ≠ 后端真的上了

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
- [ ] QMC 新版 STag 文件长期方案：v0.6.0 仅引导用旧版重下；未来若有官方/社区的离线 ekey 获取通道可考虑接入
- [ ] QQ 旧版安装包定期复查 sha256（docs/QQ_INSTALLER_SHA256.md，物理目录 `/www/wwwroot/musiczh-downloads/`），确保服务器 /downloads/ 未被替换；建议每月外网 curl 一次
- [ ] 运营后台：admin/dist 主 chunk 618KB，按页面 lazy load Recharts（下期候选）
- [ ] 运营后台：本期只做数据看板，下一期接「功能开关 / 配置中心」（DDL 已留 `feature_flags` 空表）
- [ ] 后端：失败堆积告警邮件（达到阈值通知项目主）
- [ ] 2026-07 评估：若 1-2 月内「上传文件总数（旧口径）」与新口径偏差稳定收敛，移除观察卡片 + 后端 upload_files_legacy 字段（v0.4.3 引入）

## 已完成（最近 2 个版本）

> 更早的历史版本归档在 [CHANGELOG.md](CHANGELOG.md)，按需 Read。写新版本时：本节累计到 3 个就把最旧的一段挪进 CHANGELOG.md，保持本节常驻只 2 个版本。

### v0.7.0 · 20260611 待发布

- **FLAC/OGG 流式转码 + 解密/转码全量入 Web Worker**：解决两个 P0 性能问题——转码内存峰值 ~1GB 导致的 OOM/abandon（复盘 #5：abandon 16.7% 是最大流失点）、大文件解密时主线程卡死 5-15s
- 流式转码（[src/lib/transcode.ts](src/lib/transcode.ts) 重写）：`@wasm-audio-decoders/flac` / `ogg-vorbis` 按 2MB 分块解码 → PCM 立刻喂 LAME → 即弃；内存峰值与文件大小解耦；删除 AudioContext 全部代码与 HIRES_NOT_SUPPORTED 拦截（枚举值保留，admin 历史日志仍引用）
- Hi-Res 解锁：24-bit / ≥96kHz FLAC 从拦截转为支持，>48kHz 显式 `outputSampleRate: 48000` 走 LAME 内部重采样（96k/24bit 实测：时长采样级精确、440Hz 正弦过零率验证音高无偏）
- Worker 管道（[src/lib/worker/](src/lib/worker/) 三件套）：protocol（DecryptError 跨线程序列化/重建，App 的 `instanceof` 分支零改动）+ audio.worker（串行消化、progress 100ms 节流）+ client（保持原签名、崩溃 reject 在途任务并自动重建）；[App.tsx](src/App.tsx) 仅改 import 区；[vite.config.ts](vite.config.ts) 加 `worker.format: 'es'`（iife 不支持代码分割，会把三个 WASM 库 ~1MB 全塞进 worker 主 chunk；es 格式保持按需加载，worker 主体 78KB）
- 埋点零新增：`decrypt_ms`/`transcode_ms` 计时仍在 App 层包住 await（含 <10ms 通讯开销，噪声级），性能前后对比靠 app_ver 切分；abandon 机制在主线程不受影响
- 已知非回归：VBR MP3 不写 Xing 头，播放器按首帧码率估算的「显示时长」可能偏差几个百分点（旧管线同款行为；实际解码时长采样级精确）
- 上线观测：transcode_abandon 占比 16.7% → <10% 算缓解；HIRES_NOT_SUPPORTED 失败（17 次/7d）→ 0；转码 P50/P95 持平或略降（瓶颈在 LAME 编码）；每 MB 解密耗时不回升 >10%；transcode_fail 率 8.5% 不回升、盯 .ogg 失败占比异动。评估窗口 7d / 30d 各一次

### v0.6.4 / 运营后台 v0.4.9 · 20260605 上线

- **解密/转码性能埋点 + 运营后台「性能分析」tab**：观测整个转换链路耗时、客观衡量性能、发现长尾异常
- 主站埋点（[src/App.tsx](src/App.tsx) / [src/lib/analytics.ts](src/lib/analytics.ts)）：解密、转码两段各 wall-clock 计时，`decrypt_done`/`transcode_done` 带 `decrypt_ms`/`transcode_ms`（`*_fail` 也带，仅诊断、不进性能均值）；白名单 + [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) 同步登记
- 后端（[server/src/routes/adminStats.ts](server/src/routes/adminStats.ts)）：新增 `GET /perf`（每文件均值 + P50/P95、每 MB、按来源拆分）+ `GET /perf-timeseries`（按天 × 来源的每 MB 趋势，含 转换/解密/转码 三口径）；[adminUploads.ts](server/src/routes/adminUploads.ts) 上传日志加 `duration_ms`（该文件 解密+转码 合计，按 file_id 子查询）
- 口径锁定：均值 / 每 MB 一律 ratio-of-sums；「转换」均值按处理次数 (Nd+Nt)，其分位用「整文件端到端」分布（避免快解密+慢转码双峰混合无意义）；只统计成功事件；每 MB 两个 size 基准各为本阶段处理量（解密=原始加密字节、转码=解密产物字节）；分位数为近似 floor-rank（SQLite 无 PERCENTILE，OFFSET 定位、空集返回 NULL）
- 运营后台（导航第二位新增「性能分析」tab，[PerformanceAnalysis.tsx](admin/src/pages/PerformanceAnalysis.tsx)）：每文件耗时卡（均值 + P50/P95）、每 MB 耗时卡、按来源「每 MB 耗时趋势」折线图（[perf/PerfTrendChart.tsx](admin/src/pages/perf/PerfTrendChart.tsx)，转换/解密/转码可切换）+ 区间合计表；「解密分析 → 上传日志」每行加「耗时」列（[UploadsSection.tsx](admin/src/pages/decrypt-analysis/UploadsSection.tsx)）。前端缺字段显式显示 `-`，禁用 `?? 0`（防后端漏部署伪装成零数据）
- 上线观测：`decrypt_ms`/`transcode_ms` 非空率应快速逼近 100%（旧版客户端无此字段会拉低、随版本铺开回升）；每 MB 转码 > 每 MB 解密；各指标 P95 明显 > P50（右偏）说明数据真实；来源表里 KGM(查表 XOR) 与 NCM/QMC(RC4) 的每 MB 解密耗时应有可解释差异。评估窗口 7d / 30d 各一次

# 通用
- 优先选择编辑而非重写整个文件
- 除非文件被编辑过，否则不要重复阅读已读过的文件
- 输出追求简洁，但推理过程必须详尽

# 代码规范
- 一个文件不超过 400 行，超了就拆
- 嵌套不超过 4 层
