# 拾音 · 项目说明

加密音乐文件 → MP3/FLAC/OGG/M4A 本地转换工具，纯前端，文件全部在浏览器内处理，不上传任何服务器。

支持格式：网易云 .ncm，酷狗 .kgm / .vpr（v2，离线密钥），QQ 音乐 .mflac / .mgg / .qmcflac / .qmcogg 等 QMCv2 系列（**仅 v19.51 旧版 Windows** 客户端下载的文件；新版 STag 标记会精准拦截并引导），喜马拉雅 .xm（v2）；以及原始 .flac / .ogg / .m4a（自动转 MP3）。
解密后按真实字节保持 MP3/FLAC/OGG/M4A 原格式；FLAC/OGG/M4A 可一键二次转码为 MP3（WASM 流式解码 + LAME WASM VBR -V 2，平均 ~190 kbps；支持 Hi-Res，>48kHz 输出钉 48kHz 重采样）。M4A 只在实际进入转码时动态加载 Mediabunny，并优先用 WebCodecs 解 AAC，失败再加载裁剪版 LibAV.js。解密与转码计算全部跑在 Web Worker（v0.7.0 起），主线程只管 UI。

- Cloudflare 主站：https://shiyinmp3.com（用户端、`/admin/` 与 `/api/` 已上线且全站 `noindex`；QQ 安装包等待独立方案）
- Cloudflare 运营后台：https://shiyinmp3.com/admin（与阿里云原站共用账号、API 和 SQLite）
- 阿里云原站：https://sleepno.cn
- Cloudflare 预览站：https://preview.shiyinmp3.com（`noindex`）
- 阿里云运营后台：https://sleepno.cn/admin（仅项目主登录，账号在 server `.env` 里 seed）
- GitHub：https://github.com/nohy1053885871-afk/musiczh
- 当前开发版本：v0.8.10（运营后台 v0.4.22，API v0.4.15）
- 当前生产版本：Cloudflare/阿里云主站 v0.8.10 · 运营后台 v0.4.22 · API v0.4.15
- 上线状态：Cloudflare/阿里云用户端 v0.8.10 ✅ · Cloudflare/阿里云运营后台 v0.4.22 ✅ · API v0.4.15 ✅

> 部署 / 升级 / 运维步骤见本地 [DEPLOY.md](DEPLOY.md)（不进 git）。
> 双域名生产拓扑、共享状态与故障边界的唯一事实源见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

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
    download-help.tsx    # v0.8.3 下载帮助入口 + 按需加载
    download-help-modal.tsx # v0.8.3 下载位置 / 连续下载帮助弹窗
    support-matrix.tsx   # v0.6.0 平台/格式总览弹窗 + 拖拽区下方入口
    browser-compat-modal.tsx # v0.8.2 低版本浏览器弱提示弹窗

admin/                   # 运营后台前端（独立 vite 项目，base: '/admin/'）
  src/{pages,components,lib}/
  vite.config.ts | package.json | tsconfig.json

server/                  # 后端 API（Hono + better-sqlite3 + JWT）
  src/{routes,middleware,lib,seed}/
  schema.sql             # events / failures / admins / feature_flags
  ecosystem.config.cjs   # pm2 守护配置
  .env.example           # ADMIN_USERNAME / ADMIN_PASSWORD_HASH / JWT_SECRET / RETENTION_DAYS

worker/                  # Cloudflare Worker：/api 同源代理，静态资源仍由 Assets binding 承载
  index.ts               # Tunnel 源站代理、真实 IP、Cookie 透传、no-store/fail-closed

docs/
  ARCHITECTURE.md        # 双域名生产拓扑、共享/隔离状态、安全与故障边界（唯一事实源）
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
| `/api/track` / IP 访问控制 / 鉴权 / SQLite / DDL / 数据保留 cron / 后端聚合查询 | **后端 API** | `server/src/routes/` · `server/src/lib/siteAccess.ts` · `server/src/schema.sql` · `server/src/middleware/` · `server/nginx/` |
| 埋点（新事件 / 新接入点 / 字段白名单） | **跨子项目** | `src/lib/analytics.ts` + `src/App.tsx` 调用点 + `server/src/routes/track.ts` + `docs/ANALYTICS_SPEC.md`（必登记） |
| 部署 / 打包 / nginx / pm2 / `.env` / 备份 | **不改代码** | [DEPLOY.md](DEPLOY.md) |

## 给 Agent 的工作指引

> 本文件由 Claude Code（`CLAUDE.md`）与 Codex（`AGENTS.md` 软链接指向本文件）**共读一份**。改说明只改 `CLAUDE.md` 本体，别动 `AGENTS.md` 软链接。两个工具之间没有共享记忆，唯一协同介质是 git + 本文档：分工按子项目/目录物理隔离，同一文件（尤其 `src/App.tsx`）一次只让一个工具改，勤 commit 小粒度。

- 用户描述需求时通常会点出"主站"/"运营后台"/"后端"/"埋点"——先据此锁定子项目，再 Read 相关文件，**不要全量探索**
- 三个子项目互相**解耦**：改任一不重新构建另两个；跨端改动需明确列出每端的改动清单
- “只构建/部署对应端”中的“端”指用户端、运营后台或 API 子项目，不是只选一个正式域名。
  用户端或后台一旦获准上线，默认必须从同一提交发布到 Cloudflare 与阿里云两个目标
- **默认双域名同步发布**：项目主说“上线/发布”时，默认包含 `shiyinmp3.com` 与
  `sleepno.cn`，两边功能、交互、文案、版本和 API 行为保持一致；只有项目主明确指定
  “只上线某一域名、另一域名保持不变”才允许单域名发布，并必须记录原因、范围和恢复同步计划
- 双域名发布只有在两边部署与 smoke 都通过后才算完成；任何一边失败都必须报告“发布未完成”
  或“临时不一致”，不得宣告上线完成或静默留下版本分叉
- 新增按钮 → 同时埋 `*_view`（曝光，用 `useImpression` hook）和 `*_click`（点击）
- 新增异步流程 → 同时埋 `*_start` 与 `*_done` / `*_fail`，失败必走 `analytics.trackFailure`
- 任何新增事件，先在 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) 事件全表登记一行（含中文描述），再在 `admin/src/lib/format.ts` 的 `EVENT_LABELS` 加映射
- 🚨 **改了 `server/**` 的 PR 合到 main 后，必须额外手动 dispatch 后端部署**：GitHub Actions 的 deploy-server job **故意不在 push 时触发**（防坏版本 502 整站挂），条件是 `workflow_dispatch || refs/tags/v*`。merge 完跑 `gh workflow run deploy.yml --ref main -f target=server` + `gh run watch` 看 success 才算上线完成；前端 `?? 0` fallback 会把"字段缺失"伪装成"零数据"，光看 UI 不报错 ≠ 后端真的上了
- Cloudflare `/api` 或 Tunnel 变更的生产顺序固定为：后端 API → `Configure Cloudflare Tunnel` workflow → Cloudflare Worker；禁止先把代理 Worker 指向尚未受保护或尚未连通的源站。两枚 Token 只存 GitHub/Worker/服务器密钥，绝不写入仓库或日志
- 任何涉及域名、API、后台登录、Cookie、埋点、访问控制或部署的变更，动手前必须读 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)，并按其中“双域名检查清单”验证。前端默认只使用相对 `/api`，不得把任一正式域名写成唯一 API 地址；共享 API/SQLite 不代表共享 Cookie、`visitor_id` 或接入层策略

## 项目主的隐性约定（代码/git 里看不出，两个工具都要遵守）

这些是项目主口头给过、但代码和提交历史里推不出来的规则，写在这里让任何 Agent 都能读到：

- **交互语言**：所有回复用中文。
- **用户端视觉规范是 Agent 自主设计的默认强制门槛**：Agent 自行设计任何触达用户的前端页面、组件、弹窗、条幅、文案布局或交互时，动手前必须对照 [DESIGN_SPEC.md](DESIGN_SPEC.md)，实现后按其色彩、阴影、圆角、字体、动效和响应式规则完成桌面与窄屏视觉验收；不得把互相冲突的状态色强行揉进同一组件，也不得以“现有代码如此”为理由偏离规范。若项目主对具体改法有明确要求，以该要求为准，可在必要范围内突破现行规范；设计规范不是永久冻结的，确认形成更优、可复用的新规则后应随产品演进迭代规范本身。
- **UI 文案通用化**：面向用户的提示语说"音频文件"，**不要枚举具体扩展名**（.ncm/.kgm/...），格式列表只在文档和说明弹窗里出现。
- **前端改动给本地测试链接**：需要用户验证时主动起 dev server 把 localhost 链接发过去，**发之前自己先打开确认能进**。
- **两段式发布**：改完默认只起 dev 让用户本地验证；用户明确说「上线/发布」后，才一口气跑 commit→PR→merge→tag→CI→smoke 全链路。
- **部署 zip 落主仓根目录** `/Users/bojue/musiczh/`，命名 `musiczh-{user,admin,api}-vX.Y.Z-YYYYMMDD.zip`，不要留在 worktree 内。
- **运营后台（`admin/`）与主站解耦**：版本号独立编号（当前开发版 v0.4.15，与主站 v0.8.2 无关）；技术/设计栈可自由引入 antd 等成熟组件库，**不必**沿用主站暖色拟物风。本地测试 admin 默认 seed 账号 `admin/admin123`。
- **工程原则·校验输出而非只校验输入**：解密/解析代码必须校验产物 magic，权威信号（真实字节）优先于元数据；偏移/解析失败用 magic 锚定自愈，绝不放乱码产物下游。
- **迭代复盘**：`docs/retrospectives/` 每版一个文件（`NN-版本-日期.md`）+ README 索引；新迭代起手先读最新一篇的 action items。较大功能的发布计划里必须列「上线观测指标」（验证什么 / 看哪个事件 / 期望趋势 / 评估窗口）。
- **较大运营/流量/SEO 需求**：先读 `docs/ops/2026-05-user-growth.md`。

## 核心数据结构

```typescript
type TrackedFile = {
  id: string
  file: File
  status: 'pending' | 'decrypting' | 'finalizing' | 'done' | 'failed' | 'transcoding'
  progress: number        // 0–1
  result?: DecryptResult  // { audio: Blob, format: 'mp3'|'flac'|'ogg'|'m4a', meta, cover, suggestedName }
  coverUrl?: string       // 只指向已验证、与下载产物共用的封面 Blob URL
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

Cloudflare 用户端与运营后台共享同一 Workers Static Assets 部署；`/api/*` 由 Worker 经
Cloudflare Tunnel 转发到上述同一 API/SQLite。Cloudflare 构建命令为
`npm run build:cloudflare`，其中后台产物写入 `dist/admin/`。完整 Host/路由矩阵、发布顺序
与故障影响见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

- 服务器：阿里云 ECS，宝塔面板管理
- 部署 zip 命名：`musiczh-{user,admin,api}-vX.Y.Z-YYYYMMDD.zip`，统一落主仓根目录 `/Users/bojue/musiczh/`
- 后端 API 用 tsx 直接跑 TS 源码，部署包不带 `node_modules`，服务器上 `npm install` 装
- SQLite 每日 04:00 在线备份、校验并压缩到 `/www/backup/musiczh-db/`，按最近 7 份成功备份轮换
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
- [ ] 酷狗 KGG / 新版外部 Key 格式支持（当前先精准拦截并引导电脑端重新下载；长期方案评估本地密钥库导入）
- [ ] 三解密器（ncm/kgm/qmc）逐字段 vs unlock-music 完整规范对账，把"跳过了哪些字段、为什么安全"写进注释（v0.7.1 修的 imageSpace bug 就是照教程简化版埋的雷；下期候选）
- [ ] KGM/QMC 封面"搜图回填"：这两类容器不带 albumPic URL（封面只在解密产物自带 ID3/FLAC 标签里），要给无封面文件补图只能按 标题+歌手 或 QQ songId（qmc.ts 已能解出、未用）查外部 API——需先评估搜索 API 的 CORS / 是否要后端代理 / 匹配准确性 / 隐私（下期候选）
- [ ] QMC 新版 STag 文件长期方案：v0.6.0 仅引导用旧版重下；未来若有官方/社区的离线 ekey 获取通道可考虑接入
- [ ] QQ 旧版安装包定期复查 sha256（docs/QQ_INSTALLER_SHA256.md，物理目录 `/www/wwwroot/musiczh-downloads/`），确保服务器 /downloads/ 未被替换；建议每月外网 curl 一次
- [ ] 运营后台：admin/dist 主 chunk 618KB，按页面 lazy load Recharts（下期候选）
- [ ] 后端：失败堆积告警邮件（达到阈值通知项目主）
- [ ] 2026-07 评估：若 1-2 月内「上传文件总数（旧口径）」与新口径偏差稳定收敛，移除观察卡片 + 后端 upload_files_legacy 字段（v0.4.3 引入）

## 已完成（最近 2 个版本）

> 更早的历史版本归档在 [CHANGELOG.md](CHANGELOG.md)，按需 Read。写新版本时：本节累计到 3 个就把最旧的一段挪进 CHANGELOG.md，保持本节常驻只 2 个版本。

### v0.8.10 / 运营后台 v0.4.22 / API v0.4.15 · 20260829 上线

- **双域名独立公告**：`sleepno.cn` 与 `shiyinmp3.com` 在共享 SQLite 内分别保存首页公告；正文不分主副标题，可选行动点必须成对配置文案与安全链接，关闭按钮按域名和公告版本记忆，同版本关闭后不重显、新版本自动恢复
- **失败安全与运营闭环**：公开 `/api/config` 只返回当前 Host 的已启用公告，未知 Host、配置非法、未启用或接口异常均隐藏；运营后台配置中心可分别编辑、启停两个正式域名，生产最终状态为两边关闭，公开接口均返回 `homepageAnnouncement: null`
- **埋点与视觉**：登记公告、行动点和关闭按钮的曝光/点击事件；主站按设计规范完成桌面与窄屏验收，后台双表单在桌面与窄屏无横向溢出；生产浏览器控制受安全策略阻断，未以静态或接口 smoke 冒充线上视觉验收
- **发布与密钥收口**：PR #78 合并提交 `a66971ab688b`；CI `33247803403`、阿里云前端 `33247855431`、Cloudflare 校验 `33247855479`、API `33247879529`、Tunnel `33247932526` 均成功；初始 Worker `78ed84ba-510d-4898-a0ba-5c6d3ce9ca3f`。发布后立即轮换 Tunnel 与源站两枚生产密钥，最终 Tunnel 为 `healthy`，源站密钥配置 run `33257123548` 成功，Worker Secret 版本 `8ccc0b87-30d8-41cd-b7a1-5d50874d548d`；同时修复已运行 cloudflared 不会被 `enable --now` 重启的问题，后续配置统一显式 `restart`。归档标签 `user-v0.8.10`、`admin-v0.4.22`、`api-v0.4.15`、`cloudflare-v0.8.10` 均指向功能发布提交

### v0.8.9 / 运营后台 v0.4.21 / API v0.4.14 · 20260829 上线

- **受限页辅助文案**：`sleepno.cn` 的 403 页面新增可配置纯文本提示，配置为空时隐藏；最终按项目主复核删除按钮、链接配置、跳转接口和点击指标，提示使用 13px、`#918A84` 的低对比度辅助层级
- **独立曝光口径**：公开 `/api/restricted-page` 读取文案并记录 `restricted_page_view`；事件进入独立 `site_access_events`，不伪造访客/会话标识，也不污染主站 PV/UV、分域趋势、设备和访客日志
- **运营后台闭环**：配置中心只保留 200 字纯文本文案；首页最后新增“受限页访问”卡片，按当前时间范围展示 PV 与去重 IP；两个后台继续读取同一 API/SQLite
- 验证：专项与回归 41/41、三端及 Cloudflare 构建、Wrangler dry-run、桌面/窄屏视觉验收通过；PR #76 合并提交 `f02877b516f4`，CI run `33226326487`、阿里云前端 run `33226388354`、API run `33226414612` 成功；Cloudflare Worker `33f7cdbf-9649-40f5-a17f-75af8db53638`；生产静态文件哈希、双域名首页/后台/API、源站匿名 403、Nginx 配置与独立埋点均通过；归档标签 `user-v0.8.9`、`admin-v0.4.21`、`api-v0.4.14`、`cloudflare-v0.8.9`。生产白名单规则保留但限制开关当前关闭，辅助文案为空，启用后的真实非白名单页面待运营配置后复验

# 通用
- 优先选择编辑而非重写整个文件
- 除非文件被编辑过，否则不要重复阅读已读过的文件
- 输出追求简洁，但推理过程必须详尽

# 代码规范
- 一个文件不超过 400 行，超了就拆
- 嵌套不超过 4 层
