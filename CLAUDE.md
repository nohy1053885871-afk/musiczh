# 拾音 · 项目说明

加密音乐文件 → MP3/FLAC/OGG 本地转换工具，纯前端，文件全部在浏览器内处理，不上传任何服务器。

支持格式：网易云 .ncm，酷狗 .kgm / .vpr（v2，离线密钥），QQ 音乐 .mflac / .mgg / .qmcflac / .qmcogg 等 QMCv2 系列（**仅 v19.51 旧版 Windows** 客户端下载的文件；新版 STag 标记会精准拦截并引导）；以及原始 .flac（自动转 MP3）。
解密后可一键二次转码为 MP3（WASM 流式解码 libFLAC/libvorbis + LAME WASM VBR -V 2，平均 ~190 kbps，接近无损；支持 Hi-Res，>48kHz 输出钉 48kHz 重采样）；原始 .flac / .ogg 上传走同一管线，无需点击按钮。解密与转码计算全部跑在 Web Worker（v0.7.0 起），主线程只管 UI。

- 线上主站：https://sleepno.cn
- 运营后台：https://sleepno.cn/admin（仅项目主登录，账号在 server `.env` 里 seed）
- GitHub：https://github.com/nohy1053885871-afk/musiczh
- 当前版本：v0.7.4（运营后台 v0.4.11）
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
- **运营后台（`admin/`）与主站解耦**：版本号独立编号（现为运营后台 v0.4.11，与主站 v0.7.4 无关）；技术/设计栈可自由引入 antd 等成熟组件库，**不必**沿用主站暖色拟物风。本地测试 admin 默认 seed 账号 `admin/admin123`。
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

### 运营后台 v0.4.11 · 20260714 上线

- **错误码中文标签真正接入失败/下载日志页**：v0.7.4 上线 smoke 时发现 `ERROR_CODE_LABEL` 从未被任何页面 import、构建时被 tree-shake（v0.7.3 的 TRANSCODE_OOM、v0.7.4 的 FILE_UNREADABLE 标签实际都没生效，失败日志一直显示错误码原文）
- 新增 [admin/src/components/biz/ErrorCodeCell.tsx](admin/src/components/biz/ErrorCodeCell.tsx) 共享组件：有映射时中文主显 + 原文 code 小字（排查复制用）；无映射自动回退原文，永不空白
- 接入点：[FailuresSubSection.tsx](admin/src/pages/decrypt-analysis/FailuresSubSection.tsx)（表格列 + 筛选下拉 label + 详情抽屉）、[DownloadsSection.tsx](admin/src/pages/decrypt-analysis/DownloadsSection.tsx)（表格列 + 详情抽屉）；CSV 导出保持原文 code
- 顺手修预存在 bug：`error_code=null` 的聚合组曾以 value='' 进筛选下拉，与「全部错误码」冲突并劫持默认显示（线上有 null 码记录时下拉默认显示「(无) (N)」）；null 组本就筛不了，已从下拉剔除
- 验收判据（上次的教训）：构建产物 grep 得到 `FILE_UNREADABLE`/`INVALID_HEADER` 等 key（注意中文在产物里是 \uXXXX 转义，用 ASCII key 搜）；本地 seed 7 条数据覆盖 有映射/未映射/null 三分支 UI 实测
- 埋点/主站/server 零改动

### v0.7.4 · 20260713 上线

- **FILE_UNREADABLE 错误码：源文件中途失效的失败归类 + 中文文案**：失败日志 #21545（安卓 + 夸克浏览器，30MB .flac 转码报裸英文 NotFoundError、error_code=null）排查
- 根因：File 经 postMessage 按引用进 Worker（不拷字节），v0.7.0 流式转码按 2MB 分块 lazy 读——30MB ≈ 15 次 `slice().arrayBuffer()` 分散在整个转码时长内；移动端从网盘/聊天应用选取的文件是临时物化副本，中途被系统回收/清理 → 靠后的分块读抛 `DOMException NotFoundError` → 非 DecryptError 无 code，用户看裸英文。环境性失败，字节已丢，代码层无法恢复
- 修复（[src/lib/worker/protocol.ts](src/lib/worker/protocol.ts) `serializeWorkerError` 咽喉点）：DOMException `NotFoundError`/`NotReadableError` → 新错误码 `FILE_UNREADABLE`（[src/lib/types.ts](src/lib/types.ts)）+ 中文引导文案（"请把文件先保存到本机存储，再重新上传"），解密/转码两条路径一处覆盖；App.tsx 零改动
- 不做整读预载兜底：手机端多吃一个文件体积的内存正是 v0.7.3 刚修完的 Worker OOM 敏感区，拿一种失败换另一种不划算；若上线后占比高再评估小文件折中方案
- 验证：puppeteer-core + CDP 磁盘背书上传真实复现（50MB FLAC 转码中途 mv 走源文件 → 友好文案展示 + `error_code=FILE_UNREADABLE`）；NCM 解密 + FLAC 转码回归零失败
- admin（[admin/src/lib/format.ts](admin/src/lib/format.ts)）`ERROR_CODE_LABEL` 加映射；[docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) 已登记；不动 server
- 上线观测：失败日志 `FILE_UNREADABLE` 出现、裸英文 NotFoundError 的 error_code=null 记录归零；失败总量不应下降（环境性失败只是完成归类）；若占 transcode_fail 比例 >10%，下期考虑上传区引导文案。评估窗口 7d

# 通用
- 优先选择编辑而非重写整个文件
- 除非文件被编辑过，否则不要重复阅读已读过的文件
- 输出追求简洁，但推理过程必须详尽

# 代码规范
- 一个文件不超过 400 行，超了就拆
- 嵌套不超过 4 层
