# 拾音 · 项目说明

加密音乐文件 → MP3/FLAC/OGG 本地转换工具，纯前端，文件全部在浏览器内处理，不上传任何服务器。

支持格式：网易云 .ncm，酷狗 .kgm / .vpr（v2，离线密钥），QQ 音乐 .mflac / .mgg / .qmcflac / .qmcogg 等 QMCv2 系列（**仅 v19.51 旧版 Windows** 客户端下载的文件；新版 STag 标记会精准拦截并引导）；以及原始 .flac（自动转 MP3）。
解密后可一键二次转码为 MP3（WASM 流式解码 libFLAC/libvorbis + LAME WASM VBR -V 2，平均 ~190 kbps，接近无损；支持 Hi-Res，>48kHz 输出钉 48kHz 重采样）；原始 .flac / .ogg 上传走同一管线，无需点击按钮。解密与转码计算全部跑在 Web Worker（v0.7.0 起），主线程只管 UI。

- 线上主站：https://sleepno.cn
- 运营后台：https://sleepno.cn/admin（仅项目主登录，账号在 server `.env` 里 seed）
- GitHub：https://github.com/nohy1053885871-afk/musiczh
- 当前版本：v0.7.2（运营后台 v0.4.9）
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

### v0.7.2 · 20260612 上线

- **NCM 内嵌封面 MIME 修正（PNG 被误标 JPEG → 下载产物丢封面）**：用户反馈"NCM 转 FLAC 后列表有封面、下载没封面"，且 v0.7.1 的封面回填未覆盖此 case
- 根因（[src/lib/ncm.ts](src/lib/ncm.ts)）：v0.7.1 回填只管「无内嵌封面」的新版 NCM；本 case 是【自带内嵌封面】的 NCM（coverLen>0），走的是更老的"内嵌封面直接写进产物"路径。新版网易云内嵌封面其实是 **PNG**，旧代码却把 cover Blob 硬编码 `image/jpeg`，经 `cover.type` 传到 FLAC `writeFlacMeta` → PICTURE block 声明 jpeg 却装 PNG。浏览器 `<img>` 按内容嗅探照常渲染（**列表有封面**），但播放器按声明 MIME 把 PNG 喂 JPEG 解码器 → 失败 → **下载产物丢封面**（MP3 路径不受影响：browser-id3-writer 自己按字节嗅探）
- 修复（权威信号=真实字节，优先于元数据，承接 v0.7.1 同一原则）：[src/lib/sniff.ts](src/lib/sniff.ts) 新增共享 `sniffImageMime(bytes)`（按 magic 判 jpeg/png/gif/webp）；ncm 抠封面按真实 magic 定 Blob.type；[src/lib/metadata/index.ts](src/lib/metadata/index.ts) FLAC 写入按封面真实字节定 MIME（兜底防任何上游传错 type）；[src/lib/cover.ts](src/lib/cover.ts) 回填嗅探复用同一函数、去重
- 兼容性实测（真实源码跑 20 个新旧 NCM + mutagen 校验「声明 MIME==数据真实格式」）：旧 NCM 内嵌 JPEG（FLAC/MP3）、新 NCM 内嵌 PNG（FLAC/MP3）、无内嵌走 CDN 回填（JPEG/PNG）全部一致；旧版本来正确的 JPEG 无回归。已知边界：网易云从未出现过的冷门图片格式（BMP/TIFF）嗅探不出会退标 jpeg
- 埋点零新增、不动 server（纯 MIME 修正）。macOS 访达不渲染 FLAC 封面缩略图是系统限制（无 FLAC 原生解码器）、与本修复无关，需用真正播放器查看
- 上线观测：无新埋点，靠用户反馈 + `cover_backfill` 成功率维持 >90%；NCM→FLAC 下载产物在播放器内封面显示率应回升。评估窗口 7d

### v0.7.1 · 20260611 上线

- **NCM imageSpace 解析 bug 修复 + 偏移自愈 + 封面回填 + 三器输出校验/监控**：用户反馈"NCM 转的 FLAC 转码报 INVALID_HEADER / MP3 没封面"，排查发现三个表象同源于一个解析 bug
- 根因（[src/lib/ncm.ts](src/lib/ncm.ts)）：NCM 封面区 CRC32 后有【两个】u32 长度字段——`imageSpace`（封面预留总空间，音频从这之后开始）和 `coverLen`（实际内嵌字节，≤imageSpace）。旧代码把 imageSpace 当"5 字节间隙"跳过、只按 coverLen 跳封面就解密音频；**新版网易云客户端不再内嵌封面（coverLen=0 但仍预留 ~7.5KB）** → 音频起点早了 imageSpace 字节 → RC4 keystream 错位 → **整段音频乱码**（旧版 imageSpace==coverLen 歪打正着，一直没暴露）。改读两字段、按 imageSpace 对齐
- 偏移自愈（[src/lib/ncm.ts](src/lib/ncm.ts) `resolveAudioStart`）：主偏移解出的不是合法 magic 时，在有界窗口内"解 4 字节探 magic + 验结构"扫描找回真起点（RC4 keystream 只依赖距起点下标）；命中即自愈并埋 `decrypt_offset_recovered` 预警新变体
- 输出健全性校验（三器统一）：`sniffAudioFormat` 提取到 [src/lib/sniff.ts](src/lib/sniff.ts) 共用，ncm/kgm/qmc 解密产物非已知 magic 一律报错不放乱码；NCM 新增 `OUTPUT_NOT_AUDIO` 错误码（kgm/qmc 早有各自更具体的码）。NCM 不再信 `meta.format`、改按真实 magic 定格式
- 封面回填（[src/lib/cover.ts](src/lib/cover.ts) + [src/App.tsx](src/App.tsx)）：解密产物无内嵌封面但有 `meta.albumPic` 时，主线程在解密计时窗口外、后台异步抓网易云 CDN 图（实测支持 https + CORS `*`）嵌入下载产物（writeFlacMeta/writeId3ToMp3 幂等重写）；失败静默、不阻塞队列、文件仍可用。只抓公开封面图、绝不上传音频
- 埋点（纯前端、不动 server）：新增 `cover_backfill_done/fail`、`decrypt_offset_recovered`、`decrypt_format_mismatch`（真实 magic≠声称格式的领先指标），均用已白名单字段；[docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) + admin `EVENT_LABELS`/`ERROR_CODE_LABEL` 已登记
- 上线观测：`OUTPUT_NOT_AUDIO`/`decrypt_offset_recovered`/`decrypt_format_mismatch` 常态应趋近 0（冒头=新变体预警）；NCM 旧 `INVALID_HEADER` 失败 + 用户回传 .flac 转码失败应明显下降；`cover_backfill` 成功率 >90%；每 MB 解密耗时不因抓图抬升（已排除在 decrypt_ms 外）。评估窗口 7d / 30d 各一次

# 通用
- 优先选择编辑而非重写整个文件
- 除非文件被编辑过，否则不要重复阅读已读过的文件
- 输出追求简洁，但推理过程必须详尽

# 代码规范
- 一个文件不超过 400 行，超了就拆
- 嵌套不超过 4 层
