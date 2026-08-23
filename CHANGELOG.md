# 拾音 · 更新日志

本文件归档历史版本的发布说明。**当前/上一版本要点见 [CLAUDE.md](CLAUDE.md)「已完成」一节**，本文件只保留更早的历史。

> 这是一份给项目主 + 未来 Claude 翻阅的离线档案：默认不进对话 context，按需 Read。
> 写新版本时，先在 CLAUDE.md 里写完整一段；下次再有新版上线时，把当前 CLAUDE.md 那段挪到本文件顶部。

---

## v0.8.3 / 运营后台 v0.4.16 · 20260810 上线

- **QQ 安装包风险提示**：旧版限制与绿色去更新版风险说明合并为一个红色系编号条幅，沿用原红色 callout 的背景、文字和左侧强调线，以 `1.`、`2.` 呈现两条提示；弹窗增加小屏高度上限和滚动，新增内容不会挤出视口
- **下载文件位置帮助**：拖拽区下方新增“下载后找不到文件？”常驻入口，按需加载两张图标步骤卡，说明浏览器下载记录、默认保存位置、连续下载权限与 ZIP 兜底
- **可访问性与交互**：帮助弹窗支持“知道了”、右上角、Esc、遮罩关闭，具备对话框语义、初始焦点、焦点循环与关闭后的焦点恢复；打开时隔离背景焦点、锁定页面滚动，小屏固定标题和底部 CTA；不增加批量下载后的主动提醒，不改变下载逻辑
- **埋点与后台**：新增 `download_help_entry_view/click`、`download_help_view/close`，复用既有 `action` 白名单；运营后台只增加中文事件映射，API v0.4.9 与数据库不变
- 验证：主站与运营后台构建通过；新增组件和后台映射 lint 通过，App/QQ 组件既有 3 条历史 lint 未扩大；1280×720 与 390×667 本地浏览器验收覆盖入口与分隔符整组换行、QQ 红色系编号单条幅、帮助弹窗固定 CTA/背景隔离/无横向溢出；按钮、右上角、Esc、遮罩四种关闭 action 全部写入隔离数据库；修复 StrictMode 首次懒加载重复曝光后，每次打开恰好一条 view；PR #56 合并提交 `d62369697632`，Actions run `31353562444` 仅部署主站和后台、API skipped；线上主站 27 个和后台 3 个静态文件全量 SHA-256 smoke 通过，生产 bundle 文案/后台中文映射检查通过，API 健康检查与 QQ 安装包 HTTP 200 正常；归档标签 `user-v0.8.3`、`admin-v0.4.16`；直接生产浏览器交互因浏览器连接超时未完成，不以静态校验冒充

## v0.8.2 / 运营后台 v0.4.15 / API v0.4.9 · 20260806 上线

- **低版本浏览器弱提示**：Chrome/Chromium 与 Edge 最低 111、Firefox 最低 114、macOS Safari 与 iOS/iPadOS WebKit 最低 16.4；只对“已识别且明确低于门槛”显示非阻断弹窗，未知 UA 不猜测、不阻断
- **iOS 判断与会话规则**：iOS 上的 Chrome/Edge/Firefox 统一按系统 WebKit 版本判断；确定、关闭、Esc、遮罩都只关闭弹窗，同一标签页会话内不重复提示，`sessionStorage` 失效时退回内存标记
- **首屏性能边界**：兼容判断在首屏 commit 后执行，不创建探测 Worker、不发网络请求；弹窗独立动态加载，支持用户的生产 HTML 不预加载弹窗 chunk；正式构建目标显式固定为 `chrome111 / edge111 / firefox114 / safari16.4 / ios16.4`
- **埋点与 API**：新增 `dialog_browser_compat_view/confirm/close` 事件和浏览器族、检测版本、最低版本字段；API 白名单接收新字段，`/api/admin/stats/buttons` 增加按浏览器版本聚合的曝光、确定、关闭 PV/UV，无数据库迁移
- **运营后台**：按钮埋点页增加“低版本浏览器提示”表格和 CSV 下载；事件中文标签、API 类型和版本同步更新
- 验证：兼容矩阵 7/7；XM 11 通过 / 1 私有黄金样本跳过，M4A 1 私有黄金样本跳过，封面 16 通过 / 1 私有黄金样本跳过；主站、运营后台、API 三端构建通过；隔离数据库完成白名单过滤与聚合联调；浏览器完成文案、焦点、确定、关闭、Esc、遮罩和支持环境不误弹验收；检测器 100,000 次平均 0.00117 ms/次，主入口 gzip 增量 0.78 KiB；PR #54 合并提交 `2c03a77138b6`，Actions run 31094525471 先行部署 API、31094615248 部署主站与后台、31094735073 从 `main` 完成 API 最终部署；线上主站 26 个、后台 3 个静态文件全量 SHA-256 smoke 通过，公网 API 健康检查正常；归档标签 `user-v0.8.2`、`admin-v0.4.15`、`api-v0.4.9`

## v0.8.1 · 20260731 上线

- **全格式封面上限统一为 16 MiB**：覆盖远程图片、NCM 内嵌图片、ID3 APIC、FLAC PICTURE、OGG `METADATA_BLOCK_PICTURE` 和 M4A `covr`；超限只忽略封面，音频继续成功
- **远程封面按 CDN 分流**：网易请求 `imageView&thumbnail=500y500`，喜马拉雅请求 `!op_type=3&columns=500&rows=500`，未知 CDN 不猜参数；先检查 `Content-Length`，再流式累计并在超限时立即取消
- **两秒非阻断收尾**：新增 `finalizing` 状态，封面任务并发上限 3，排队、下载、归一化、写标签和验证统一计入两秒；失败或超时安全降级为原始音频，迟到结果不能覆盖完成态
- **本地元数据读取补强**：FLAC 按 metadata block 读取，OGG 按 page 组装跨页 comment packet，ID3 按声明长度读取；KGM/QMC 只读预览、不重写原文件标签
- **预览与下载一致**：UI 只展示已经验证且实际嵌入下载产物的同一 Blob，不再以远程图片制造“页面有封面、文件没封面”的假象
- 验证：封面专项 19/19、XM 专项 12/12、M4A 专项 1/1、主站构建和本地浏览器问题样本真实下载通过；问题 NCM 的 MPEG 帧哈希、两份真实 XM 的 AAC packet 数量与哈希在回填前后保持一致；PR #52 合并后 Actions run 30625780474 仅部署主站，线上 v0.8.1 的 24 个静态文件全量 SHA-256 smoke 通过，运营后台与 API skipped

## v0.8.0 / 运营后台 v0.4.14 · 20260728 上线

- **喜马拉雅 XM v2**：新增独立 ID3 特征解析和两阶段 AES-CBC 解密；产物严格按真实 magic 输出 MP3/FLAC/OGG/M4A，v12 精准提示不支持，损坏产物不进入下载/转码
- **统一一键转 MP3**：保留原 `FlacBatchPromptBanner` 和历史埋点名，只把统一可转码集合扩为 FLAC/OGG/M4A；M4A 默认保持原格式，用户点击后才转
- **M4A 双解码路径**：Mediabunny + WebCodecs 为主，裁剪版 LibAV.js 6.9.8.1/FFmpeg 8.1 WASM 为 fallback；PCM 复用既有 LAME VBR -V 2 管线
- **原始 M4A 上传**：与原始 FLAC/OGG 一样按真实 magic 准入，上传后自动转 MP3；MP4 ilst 中的标题、作者、专辑和 covr 会迁移到 MP3
- **XM 封面**：兼容 XM 非标准 UTF-16 COMM，从外层标签取得喜马拉雅 CDN 封面；M4A 无损重封装写入 covr（AAC packets 不变），转 MP3 时写入 ID3 APIC
- **MP3 封面兼容**：写入 APIC 前统一检查封面；已兼容的 JFIF Baseline JPEG 原样保留，Progressive/Adobe/非 JFIF 图片转为 sRGB JFIF Baseline JPEG，覆盖 NCM、XM 和 FLAC/OGG/M4A 转 MP3
- **用户端与后台**：首页入口、格式矩阵、SEO/FAQ/JSON-LD、XM/M4A 徽章，以及后台格式筛选、颜色、来源/错误码/事件中文标签同步更新；事件名和后端 API/数据库不变
- **发布安全**：前端部署增加带 commit/版本/全量 SHA-256 的三份快照、失败自动恢复和 `user/admin/all` 手动回滚 workflow；本版不修改或部署 server
- 验证：XM 合成、原始 M4A 准入、VPR 分发与真实黄金样本 12/12，M4A covr 重封装专项 1/1，MP3 封面格式专项 2/2；WebCodecs/LibAV 双路径、原始 M4A 自动转码、XM 封面下载、转码失败恢复、混合批量气泡和后台 XM/M4A 筛选均完成浏览器验收；问题样本 APIC 已由 1000×1000 Progressive Adobe JPEG 转为 sRGB JFIF Baseline JPEG，并在 macOS Apple Music 的专辑卡片和播放栏实机显示；封面重封装前后 AAC 14,757 包 SHA-256 一致，NCM/KGM/QMC 旧样本与改动前输出 SHA-256/元数据一致；Actions run #78 主站/后台部署成功、server skipped，线上主站 24 个和后台 3 个静态文件全量 SHA-256 smoke 通过

## 运营后台 v0.4.13 / API v0.4.8 · 20260721 上线

- **首页查询性能重构**：新增单接口 `GET /api/admin/stats/overview-bundle`，一次返回概览、漏斗、全部日趋势和设备组合；首页从至少 7 个并发请求改成 1 个请求，指标切换只在前端重绘
- **止血层**：原始事件统计合并为条件聚合，60 秒成功结果缓存，相同范围并发请求合并；重 SQL 全部隔离到独立 Worker Thread，主线程继续处理 `/api/track`
- **日汇总层**：新增日指标、精确日访客、file_id 终态、逐上传事件状态和游标五张表；按 `events.id` 每 30 秒增量处理，精确跨日 UV，首尾不完整日期回读原始事件；逐上传表兼容生产少量重复 file_id，严格保持旧口径
- **安全迁移**：独立可恢复回填 CLI 每批 10,000 行，追平尾部后对今日、7/30/90/365 天和两个自定义区间自动对账；全部一致才切 `ready`，异常或落后自动 `raw_fallback`，可用一条状态命令回滚
- **前端体验**：切换范围会取消过期请求并保留旧数据；统一 loading，显示数据更新时间；汇总降级时展示低干扰提示；设备数据改为组合计数并保留交叉筛选
- 验证：后端首页专项测试 3/3、server/admin 独立构建、本地 Worker/缓存/回退/回填端到端、1280px 浏览器验收全部通过；生产观测见 [复盘 #6](docs/retrospectives/06-admin-v0.4.13-20260721.md)

## 运营后台 v0.4.12 · 20260714 上线

- **导航栏右上角显示运营后台版本号**：右侧固定排列为 `版本号 → 用户名 → 退出`，版本信息在登录后的全部后台页面持续可见
- 版本号不写死：在 [admin/vite.config.ts](admin/vite.config.ts) 构建时读取 `admin/package.json` 并注入 `VITE_APP_VERSION`；后续发版只需正常 bump 包版本
- [admin/src/App.tsx](admin/src/App.tsx) 使用 11px 低对比度等宽文本展示，保持单行；[admin/tsconfig.json](admin/tsconfig.json) 加载 `vite/client` 类型
- 验证：后台独立构建通过；生产产物包含 `0.4.12`；本地实际登录后在 1280px / 1024px 宽度检查无重叠、无横向溢出，滚动后导航栏吸顶正常
- 埋点 / 主站 / server 零改动

## 运营后台 v0.4.11 · 20260714 上线

- **错误码中文标签真正接入失败/下载日志页**：v0.7.4 上线 smoke 时发现 `ERROR_CODE_LABEL` 从未被任何页面 import、构建时被 tree-shake，失败日志一直显示错误码原文
- 新增 `ErrorCodeCell` 共享组件：有映射时中文主显 + 原文 code 小字；无映射自动回退原文
- 接入失败日志和下载日志的表格、筛选及详情抽屉；CSV 导出保持原始 error code
- 修复 `error_code=null` 聚合组与「全部错误码」空值冲突的问题
- 构建产物和本地三分支数据均完成验收；埋点、主站和 server 零改动

## v0.7.4 · 20260713 上线

- **FILE_UNREADABLE 错误码：源文件中途失效的失败归类 + 中文文案**：失败日志 #21545（安卓 + 夸克浏览器，30MB .flac 转码报裸英文 NotFoundError、error_code=null）排查
- 根因：File 经 postMessage 按引用进 Worker（不拷字节），v0.7.0 流式转码按 2MB 分块 lazy 读——30MB ≈ 15 次 `slice().arrayBuffer()` 分散在整个转码时长内；移动端从网盘/聊天应用选取的文件是临时物化副本，中途被系统回收/清理 → 靠后的分块读抛 `DOMException NotFoundError` → 非 DecryptError 无 code，用户看裸英文。环境性失败，字节已丢，代码层无法恢复
- 修复（[src/lib/worker/protocol.ts](src/lib/worker/protocol.ts) `serializeWorkerError` 咽喉点）：DOMException `NotFoundError`/`NotReadableError` → 新错误码 `FILE_UNREADABLE`（[src/lib/types.ts](src/lib/types.ts)）+ 中文引导文案（"请把文件先保存到本机存储，再重新上传"），解密/转码两条路径一处覆盖；App.tsx 零改动
- 不做整读预载兜底：手机端多吃一个文件体积的内存正是 v0.7.3 刚修完的 Worker OOM 敏感区，拿一种失败换另一种不划算；若上线后占比高再评估小文件折中方案
- 验证：puppeteer-core + CDP 磁盘背书上传真实复现（50MB FLAC 转码中途 mv 走源文件 → 友好文案展示 + `error_code=FILE_UNREADABLE`）；NCM 解密 + FLAC 转码回归零失败
- admin（[admin/src/lib/format.ts](admin/src/lib/format.ts)）`ERROR_CODE_LABEL` 加映射；[docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) 已登记；不动 server
- 上线观测：失败日志 `FILE_UNREADABLE` 出现、裸英文 NotFoundError 的 error_code=null 记录归零；失败总量不应下降（环境性失败只是完成归类）；若占 transcode_fail 比例 >10%，下期考虑上传区引导文案。评估窗口 7d

## v0.7.3 · 20260612 上线

- **FLAC/OGG 大文件转 MP3 时 Worker 崩溃修复**：用户反馈上传 64MB 原始 .flac 转码报"处理进程异常退出，请重试"（error_code: UNKNOWN）。失败看板 id 7994 等转码崩溃同源
- 根因（已实验验证）：转码用的 `@wasm-audio-decoders/flac@0.2.10` WASM 堆**固定 16.1MB 且不可增长**（`_emscripten_resize_heap` 返回 false）。内部 `_decode()` 每次把输入 buffer 分配到 WASM 堆却**从未释放**（`allocateTypedArray(len, Uint8Array, false)` setPointer=false，不进 tracked set 也无手动 free）。实测：100×8KB 分配泄漏 790KB，处理到 ~16MB 压缩数据堆耗尽 → C 侧 malloc 返 NULL → 段错误 → Worker 进程被杀（绕过 worker 内 try/catch，触发 `worker.onerror`）。**旧边界：原始 FLAC/OGG 转 MP3 约 16-20MB 即崩**
- 核心修复（[src/lib/transcode.ts](src/lib/transcode.ts)）：2MB 分块循环中每处理 12MB 调 `decoder._decoder.reset()` 重建 WASM 实例回收堆。实测堆从 8.14MB 恢复到 15.9MB（完全回收）；mid-stream reset 后继续解码 441000 样本 0 丢失——FLAC 帧自包含、无跨帧状态，codec-parser 独立于 WASM decoder 不受影响。任意大小文件（含 200MB）现在都能转
- 兜底（[src/lib/worker/client.ts](src/lib/worker/client.ts) + [src/lib/types.ts](src/lib/types.ts)）：万一极端 case（单帧 >16MB 的损坏 FLAC）仍崩，`worker.onerror` 按在途请求类型区分——transcode 崩溃给新错误码 `TRANSCODE_OOM` + "文件可能已损坏或格式异常"提示，不再笼统报 UNKNOWN
- 次要（[src/lib/transcode.ts](src/lib/transcode.ts) Mp3Sink）：每 500 个 MP3 碎片合并一次，降 64MB 文件产生的 3000+ 个小 Uint8Array 的 GC 压力
- 埋点零新增（复用 `transcode_fail` + error_code 字段，admin `ERROR_CODE_LABEL` 已可加 `TRANSCODE_OOM` 中文映射）、不动 server、不动 admin
- 上线观测：失败看板 transcode 阶段 `UNKNOWN`「处理进程异常退出」应趋近 0；新 `TRANSCODE_OOM` 常态也应近 0（冒头=损坏文件，非内存泄漏）。评估窗口 7d

## v0.7.2 · 20260612 上线

- **NCM 内嵌封面 MIME 修正（PNG 被误标 JPEG → 下载产物丢封面）**：用户反馈"NCM 转 FLAC 后列表有封面、下载没封面"，且 v0.7.1 的封面回填未覆盖此 case
- 根因（[src/lib/ncm.ts](src/lib/ncm.ts)）：v0.7.1 回填只管「无内嵌封面」的新版 NCM；本 case 是【自带内嵌封面】的 NCM（coverLen>0），走的是更老的"内嵌封面直接写进产物"路径。新版网易云内嵌封面其实是 **PNG**，旧代码却把 cover Blob 硬编码 `image/jpeg`，经 `cover.type` 传到 FLAC `writeFlacMeta` → PICTURE block 声明 jpeg 却装 PNG。浏览器 `<img>` 按内容嗅探照常渲染（**列表有封面**），但播放器按声明 MIME 把 PNG 喂 JPEG 解码器 → 失败 → **下载产物丢封面**（MP3 路径不受影响：browser-id3-writer 自己按字节嗅探）
- 修复（权威信号=真实字节，优先于元数据，承接 v0.7.1 同一原则）：[src/lib/sniff.ts](src/lib/sniff.ts) 新增共享 `sniffImageMime(bytes)`（按 magic 判 jpeg/png/gif/webp）；ncm 抠封面按真实 magic 定 Blob.type；[src/lib/metadata/index.ts](src/lib/metadata/index.ts) FLAC 写入按封面真实字节定 MIME（兜底防任何上游传错 type）；[src/lib/cover.ts](src/lib/cover.ts) 回填嗅探复用同一函数、去重
- 兼容性实测（真实源码跑 20 个新旧 NCM + mutagen 校验「声明 MIME==数据真实格式」）：旧 NCM 内嵌 JPEG（FLAC/MP3）、新 NCM 内嵌 PNG（FLAC/MP3）、无内嵌走 CDN 回填（JPEG/PNG）全部一致；旧版本来正确的 JPEG 无回归。已知边界：网易云从未出现过的冷门图片格式（BMP/TIFF）嗅探不出会退标 jpeg
- 埋点零新增、不动 server（纯 MIME 修正）。macOS 访达不渲染 FLAC 封面缩略图是系统限制（无 FLAC 原生解码器）、与本修复无关，需用真正播放器查看
- 上线观测：无新埋点，靠用户反馈 + `cover_backfill` 成功率维持 >90%；NCM→FLAC 下载产物在播放器内封面显示率应回升。评估窗口 7d

## v0.7.1 · 20260611 上线

- **NCM imageSpace 解析 bug 修复 + 偏移自愈 + 封面回填 + 三器输出校验/监控**：用户反馈"NCM 转的 FLAC 转码报 INVALID_HEADER / MP3 没封面"，排查发现三个表象同源于一个解析 bug
- 根因（[src/lib/ncm.ts](src/lib/ncm.ts)）：NCM 封面区 CRC32 后有【两个】u32 长度字段——`imageSpace`（封面预留总空间，音频从这之后开始）和 `coverLen`（实际内嵌字节，≤imageSpace）。旧代码把 imageSpace 当"5 字节间隙"跳过、只按 coverLen 跳封面就解密音频；**新版网易云客户端不再内嵌封面（coverLen=0 但仍预留 ~7.5KB）** → 音频起点早了 imageSpace 字节 → RC4 keystream 错位 → **整段音频乱码**（旧版 imageSpace==coverLen 歪打正着，一直没暴露）。改读两字段、按 imageSpace 对齐
- 偏移自愈（[src/lib/ncm.ts](src/lib/ncm.ts) `resolveAudioStart`）：主偏移解出的不是合法 magic 时，在有界窗口内"解 4 字节探 magic + 验结构"扫描找回真起点（RC4 keystream 只依赖距起点下标）；命中即自愈并埋 `decrypt_offset_recovered` 预警新变体
- 输出健全性校验（三器统一）：`sniffAudioFormat` 提取到 [src/lib/sniff.ts](src/lib/sniff.ts) 共用，ncm/kgm/qmc 解密产物非已知 magic 一律报错不放乱码；NCM 新增 `OUTPUT_NOT_AUDIO` 错误码（kgm/qmc 早有各自更具体的码）。NCM 不再信 `meta.format`、改按真实 magic 定格式
- 封面回填（[src/lib/cover.ts](src/lib/cover.ts) + [src/App.tsx](src/App.tsx)）：解密产物无内嵌封面但有 `meta.albumPic` 时，主线程在解密计时窗口外、后台异步抓网易云 CDN 图（实测支持 https + CORS `*`）嵌入下载产物（writeFlacMeta/writeId3ToMp3 幂等重写）；失败静默、不阻塞队列、文件仍可用。只抓公开封面图、绝不上传音频
- 埋点（纯前端、不动 server）：新增 `cover_backfill_done/fail`、`decrypt_offset_recovered`、`decrypt_format_mismatch`（真实 magic≠声称格式的领先指标），均用已白名单字段；[docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) + admin `EVENT_LABELS`/`ERROR_CODE_LABEL` 已登记
- 上线观测：`OUTPUT_NOT_AUDIO`/`decrypt_offset_recovered`/`decrypt_format_mismatch` 常态应趋近 0（冒头=新变体预警）；NCM 旧 `INVALID_HEADER` 失败 + 用户回传 .flac 转码失败应明显下降；`cover_backfill` 成功率 >90%；每 MB 解密耗时不因抓图抬升（已排除在 decrypt_ms 外）。评估窗口 7d / 30d 各一次

## v0.7.0 · 20260611 上线

- **FLAC/OGG 流式转码 + 解密/转码全量入 Web Worker**：解决两个 P0 性能问题——转码内存峰值 ~1GB 导致的 OOM/abandon（复盘 #5：abandon 16.7% 是最大流失点）、大文件解密时主线程卡死 5-15s
- 流式转码（[src/lib/transcode.ts](src/lib/transcode.ts) 重写）：`@wasm-audio-decoders/flac` / `ogg-vorbis` 按 2MB 分块解码 → PCM 立刻喂 LAME → 即弃；内存峰值与文件大小解耦；删除 AudioContext 全部代码与 HIRES_NOT_SUPPORTED 拦截（枚举值保留，admin 历史日志仍引用）
- Hi-Res 解锁：24-bit / ≥96kHz FLAC 从拦截转为支持，>48kHz 显式 `outputSampleRate: 48000` 走 LAME 内部重采样（96k/24bit 实测：时长采样级精确、440Hz 正弦过零率验证音高无偏）
- Worker 管道（[src/lib/worker/](src/lib/worker/) 三件套）：protocol（DecryptError 跨线程序列化/重建，App 的 `instanceof` 分支零改动）+ audio.worker（串行消化、progress 100ms 节流）+ client（保持原签名、崩溃 reject 在途任务并自动重建）；[App.tsx](src/App.tsx) 仅改 import 区；[vite.config.ts](vite.config.ts) 加 `worker.format: 'es'`（iife 不支持代码分割，会把三个 WASM 库 ~1MB 全塞进 worker 主 chunk；es 格式保持按需加载，worker 主体 78KB）
- 埋点零新增：`decrypt_ms`/`transcode_ms` 计时仍在 App 层包住 await（含 <10ms 通讯开销，噪声级），性能前后对比靠 app_ver 切分；abandon 机制在主线程不受影响
- 已知非回归：VBR MP3 不写 Xing 头，播放器按首帧码率估算的「显示时长」可能偏差几个百分点（旧管线同款行为；实际解码时长采样级精确）
- 上线观测：transcode_abandon 占比 16.7% → <10% 算缓解；HIRES_NOT_SUPPORTED 失败（17 次/7d）→ 0；转码 P50/P95 持平或略降（瓶颈在 LAME 编码）；每 MB 解密耗时不回升 >10%；transcode_fail 率 8.5% 不回升、盯 .ogg 失败占比异动。评估窗口 7d / 30d 各一次

## v0.6.4 / 运营后台 v0.4.9 · 20260605 上线

- **解密/转码性能埋点 + 运营后台「性能分析」tab**：观测整个转换链路耗时、客观衡量性能、发现长尾异常
- 主站埋点（[src/App.tsx](src/App.tsx) / [src/lib/analytics.ts](src/lib/analytics.ts)）：解密、转码两段各 wall-clock 计时，`decrypt_done`/`transcode_done` 带 `decrypt_ms`/`transcode_ms`（`*_fail` 也带，仅诊断、不进性能均值）；白名单 + [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) 同步登记
- 后端（[server/src/routes/adminStats.ts](server/src/routes/adminStats.ts)）：新增 `GET /perf`（每文件均值 + P50/P95、每 MB、按来源拆分）+ `GET /perf-timeseries`（按天 × 来源的每 MB 趋势，含 转换/解密/转码 三口径）；[adminUploads.ts](server/src/routes/adminUploads.ts) 上传日志加 `duration_ms`（该文件 解密+转码 合计，按 file_id 子查询）
- 口径锁定：均值 / 每 MB 一律 ratio-of-sums；「转换」均值按处理次数 (Nd+Nt)，其分位用「整文件端到端」分布（避免快解密+慢转码双峰混合无意义）；只统计成功事件；每 MB 两个 size 基准各为本阶段处理量（解密=原始加密字节、转码=解密产物字节）；分位数为近似 floor-rank（SQLite 无 PERCENTILE，OFFSET 定位、空集返回 NULL）
- 运营后台（导航第二位新增「性能分析」tab，[PerformanceAnalysis.tsx](admin/src/pages/PerformanceAnalysis.tsx)）：每文件耗时卡（均值 + P50/P95）、每 MB 耗时卡、按来源「每 MB 耗时趋势」折线图（[perf/PerfTrendChart.tsx](admin/src/pages/perf/PerfTrendChart.tsx)，转换/解密/转码可切换）+ 区间合计表；「解密分析 → 上传日志」每行加「耗时」列（[UploadsSection.tsx](admin/src/pages/decrypt-analysis/UploadsSection.tsx)）。前端缺字段显式显示 `-`，禁用 `?? 0`（防后端漏部署伪装成零数据）
- 上线观测：`decrypt_ms`/`transcode_ms` 非空率应快速逼近 100%（旧版客户端无此字段会拉低、随版本铺开回升）；每 MB 转码 > 每 MB 解密；各指标 P95 明显 > P50（右偏）说明数据真实；来源表里 KGM(查表 XOR) 与 NCM/QMC(RC4) 的每 MB 解密耗时应有可解释差异。评估窗口 7d / 30d 各一次

## 运营后台 v0.4.8 · 20260529 上线

- **「主动取消」独立成态 + 件维度漏斗加层**：把 ≥50 文件警告弹窗反悔补发的 `upload_reject`（`reject_reason=LARGE_BATCH_DISMISSED`）从"被拒/失败"语义里彻底剥离，新增独立状态「主动取消」。改完所有指标会**自动重算历史数据**（events 表只存原始事件，分类全是查询时 SQL 现算），无需迁移。
- 后端聚合（[server/src/routes/adminStats.ts](server/src/routes/adminStats.ts)）：`/overview` 加 `dismissed_files` / `confirmed_upload_files` 字段；`upload_reject` 改"狭义被拒"（剔除主动取消）；`/funnel` file 维度从 3 层加成 4 层 `上传总数 → 确认上传 → 转换成功 → 下载`（user 维度不动）
- 上传日志后端（[server/src/routes/adminUploads.ts](server/src/routes/adminUploads.ts)）：status 枚举 `rejected_large_batch` → `user_dismissed`（全栈一致 rename）；`/timeseries` 字段 `reject_large_batch` → `user_dismissed`，同时 `reject_total` 剔除主动取消，与 adminStats 口径自洽
- 首页（[admin/src/pages/Overview.tsx](admin/src/pages/Overview.tsx)）：第二组卡片插入「确认上传数（件）」（蓝色 `#1677FF`，副字「主动取消 N」）；上传文件总数卡片 6 段拆解扩为 7 段（被拒 / 主动取消 拆开）；上传失败卡片 tooltip 去掉"大批量取消"
- 上传日志详情页（[admin/src/lib/format.ts](admin/src/lib/format.ts)）：Tag 文案 `'被拒-大批量取消'` (红) → `'主动取消'` (gold)；状态筛选下拉新增"主动取消"作为独立选项；零代码动 [UploadsSection.tsx](admin/src/pages/decrypt-analysis/UploadsSection.tsx)（查表渲染）
- 上传趋势图（[UploadsTrendChart.tsx](admin/src/pages/decrypt-analysis/uploads/UploadsTrendChart.tsx)）：`reject_large_batch` 系列改名"主动取消数"/"主动取消占比"，颜色橙色与 Tag 一致；占比分母从 `attempt+reject_total` 改 `upload_files`（成功 + 失败 + 主动取消 = 100%），`success_pct` 数值不变、`fail_pct` 变小、新 `user_dismissed_pct` 补齐
- 埋点 / DB / 主站全部零改动；仅查询层重新归类
- 上线观测：件维度漏斗「上传总数 → 确认上传」流失率 ≈ 主动取消占比，正常 0–15%；长期 >25% 说明 50 文件阈值或弹窗文案需重设计；剔除主动取消后的「确认上传 → 转换成功」应稳定 >85%。评估窗口 7d / 30d 各一次

## v0.6.3 · 20260528 上线

- **转码 / 解密全路径封面与标签补齐**：解决「FLAC/OGG 转 MP3 没封面」「KGM/VPR/QMC 解密 MP3 列表不显示封面」两类问题
- 新增 [src/lib/metadata/](src/lib/metadata/) 模块（id3 / flac / ogg 子模块 + index 门面），零新依赖；导出 `readMetaFromBlob` / `writeId3ToMp3` / `writeFlacMeta`
- 三类修复并行：
  - **FLAC/OGG 直传转 MP3**：[src/App.tsx](src/App.tsx) `processQueue` 上传时先 `readMetaFromBlob` parse 原文件 VORBIS_COMMENT + METADATA_BLOCK_PICTURE → `transcodeFile` 完成后调 `writeId3ToMp3` 把 cover + 标题/艺术家/专辑写到产物 MP3 的 ID3v2 头
  - **NCM 解 FLAC**：[src/lib/ncm.ts](src/lib/ncm.ts) 第 8 步新增 FLAC 分支，调 `writeFlacMeta` 把 NCM 容器内嵌的 cover + meta 写到产物 FLAC 的 VORBIS_COMMENT + PICTURE block（之前只 MP3 走 ID3 写入，FLAC 无标签）
  - **KGM/VPR/QMC 解密路径**：[src/lib/kgm.ts](src/lib/kgm.ts) / [src/lib/qmc.ts](src/lib/qmc.ts) 解密结束后 `readMetaFromBlob` 从产物里读 ID3/Vorbis，把 cover + title/artist/album 填到 `result.cover` / `result.meta` 让 UI 列表能预览（文件本身不重写，原标签已完整）
- FLAC writer 设计要点：扫描原 blocks → 剔除旧 type=4/6 → 注入新 VORBIS_COMMENT (vendor=`musiczh`) + PICTURE (picture_type=3 Cover front，width/height/depth/colors 全填 0，FLAC 规范允许) → 修正 last-flag → 拼回 audio frames；失败静默回退
- ID3v2 reader 容错：encoding 0/1/2/3 全支持（latin1 / UTF-16 BOM / UTF-16BE / UTF-8），单 frame 出错跳过
- 埋点新增 `has_cover` (boolean) 字段：`transcode_done` / `decrypt_done` 都带，运营后台事后 SQL 按 source / from_format 分桶看封面覆盖率（NCM-MP3/FLAC 期望接近 100%；KGM/QMC 取决于原文件；FLAC/OGG 直传取决于源标签完整度）；字段白名单同步加进 [server/src/routes/track.ts](server/src/routes/track.ts)

## v0.6.2 · 20260527 待发布

- **MP3 转码音质升级**：编码端从 `@breezystack/lamejs`（128 kbps CBR）换成 `wasm-media-encoders`（LAME 3.100 WASM 编译，VBR -V 2 默认）；产物 PEAQ ODG 从 ~-2.0 拉到 ~-0.3（公认透明），平均码率 ~190 kbps，文件比上版大 ~50%
- 入口仍是 [src/lib/transcode.ts](src/lib/transcode.ts)；解码端 `AudioContext.decodeAudioData` 不动（OOM 问题留给「FLAC 流式转码」独立项目），文件头嗅探 / Hi-Res FLAC 拦截 / 进度上报全保留
- API 收益：wasm-media-encoders 直接吃 Float32Array，省掉 lamejs 的 floatToInt16 一次拷贝；编码速度大概率比 lamejs 快（WASM 接近原生 C 性能）
- 埋点新增 `encoder` (`'wasm-lame-v2'`) + `output_size` 字段：`transcode_start` / `transcode_done` 都带，运营后台可事后 SQL 算平均码率分布；字段白名单同步加进 [server/src/routes/track.ts](server/src/routes/track.ts) `ALLOWED_PROPS`
- 文案微调：FileRow 转 MP3 按钮 tooltip 从「强制转码为 MP3（有损）」改成「转码为 MP3（~190 kbps VBR，接近无损）」，引导用户在 NCM/QMC 已是 320 MP3 时知道按了不会太亏
- 后端 / 运营后台**本期不动**：新字段对看板透明，下一期评估 `output_size` 分布后再决定加图表

## v0.6.1 / 运营后台 v0.4.7 · 20260526 上线

- **OGG 直传自动转 MP3**：原始 .ogg 文件接入主站上传，复用 v0.4.0 为原始 .flac 设计的 transcode-only 路径（sniff → processQueue 跳过解密 → AudioContext.decodeAudioData + lamejs）。底层管线在 v0.4.0/v0.6.0 已就绪，只补了三处：
  - [src/lib/decrypt.ts](src/lib/decrypt.ts) `SUPPORTED_EXT_REGEX` 加 `ogg`（开放上传准入）
  - [src/App.tsx](src/App.tsx) `<input accept>` 加 `.ogg`（系统选择框可选）
  - [src/components/support-matrix.tsx](src/components/support-matrix.tsx) 平台/格式总览表里 `.ogg` 从「已是目标格式」行移到与 `.flac` 同行「自动转码」
- **运营后台口径**：后端 `raw_flac_transcode_done` 字段（口径=transcode_done 且 source 为空）天然合并 OGG 直传——不动 DB、不动 SQL。Overview「转换成功数」卡片 tooltip + 副文案带上「.flac / .ogg」字样防误读（[admin/src/pages/Overview.tsx](admin/src/pages/Overview.tsx) + [admin/src/lib/api.ts](admin/src/lib/api.ts) 注释）。
- **拖拽区文案重排**（[src/App.tsx](src/App.tsx)）：箭头位置 helper 文案从「支持 NCM / KGM / QQ · 单个最大 200MB · 单次建议 ≤ 50 个」（动态切换队列已有 N 个）改为固定的「网易云 / 酷狗 / QQ 已支持 · 单个最大 200MB · 单次建议 ≤ 50 个」；拖拽区下方左侧删掉重复的「网易云 / 酷狗 / QQ 已支持」span，仅保留两个入口链接「查看全部支持的格式 → · 如何转换 QQ 音乐文件 →」。DropZone 不再依赖 queueSize prop。
- **埋点不新增事件 / 字段**：现有 `transcode_*` 事件已带 `from_format`（取值 `'flac'` / `'ogg'`），且后端白名单已收，flac vs ogg 可按 `from_format` SQL 精准拆分。`source` 仍保持空，与 raw flac 完全合并口径。[docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) 在 `from_format` / `upload_attempt` / `transcode_start` / `transcode_done` 行追加 v0.6.1 注释说明。

## v0.6.0 / 运营后台 v0.4.6 · 20260525 上线

- **新增 QQ 音乐 QMCv2 解密**（旧版 v19.51 Windows 客户端下载的 .mflac / .mgg / .mflac0 / .mflach / .mgg0 / .mgg1 / .mggl / .mmp4 / .qmcflac / .qmcogg / .qmc0 / .qmc2 / .qmc3 / .qmc4 / .qmc6 / .qmc8 等 17 个扩展名）：
  - 新增 [src/lib/qmc/](src/lib/qmc/) 子目录：`cipher.ts`（QmcStaticCipher / QmcMapCipher / QmcRC4Cipher）+ `key.ts`（TEA-CBC key 派生，去 Node Buffer 改 atob/Uint8Array）+ `tea.ts`（TEA 算法）+ `handler-map.ts`（扩展名映射 + QMC_EXT_REGEX）
  - 新增 [src/lib/qmc.ts](src/lib/qmc.ts) 入口：footer 解析（STag / QTag / 末尾 4B LE keySize 三种格式）+ cipher 自动分发（keyDec.length > 300 → RC4，否则 → Map；keySize ≥ 0x400 → Static）+ 分块解密让出主线程
  - 算法移植自 [ipid/unlock-music](https://github.com/ipid/unlock-music)（MIT，unlock-music 主仓 2022-11 被 DMCA 下架但镜像仍可用）
- **新版 STag 文件精准引导**：检测到文件尾 'STag' 标记抛 `QMC_NEW_VERSION_UNSUPPORTED` 错误码，FileRow 显示精准错误文案 + 一键唤起 QqGuideModal
- **sniff 改造**：[src/lib/sniff.ts](src/lib/sniff.ts) RealFormat `'qq_unsupported'` → `'qmc'`（语义从「不支持」变成「走 QMC 解密器」），识别 regex 扩到全部 17 个 QMC 扩展名
- **decrypt 分发**：[src/lib/decrypt.ts](src/lib/decrypt.ts) SUPPORTED_EXTS / SUPPORTED_EXT_REGEX 扩到 QMC 系列，`decryptAudioFile` 加 'qmc' formatOverride
- **主站 UI 引导**（QqGuide + SupportMatrix，由 Claude Design 出稿 + 工程移植）：
  - 拖拽区下方常驻 2 个入口：`查看全部支持的格式 →` / `QQ 音乐用户 · 看怎么用 →`
  - QqGuideModal：「只支持旧版 QQ 音乐（v19.51 Windows）下载的文件，新版不支持」+ 5 步操作 + 3 条注意 + 下载按钮（含安装包 SHA-256 展示）
  - SupportMatrixModal：4 平台 × 加密扩展名 × 解密后格式 × 备注限制的总览表格，QQ 行内嵌「查看 QQ 使用说明 →」跳到 QqGuideModal
  - QqGuideModal 自动唤起：用户首次拖入任意 QMC 后缀文件、且 localStorage 无 `qq_guide_seen` 标记时弹出（仅一次）
- **运营后台口径**（v0.4.6）：[admin/src/lib/format.ts](admin/src/lib/format.ts) 新增 `SOURCE_LABEL`（保留 qq_mflac 历史映射）+ `ERROR_CODE_LABEL`（含 QMC_NEW_VERSION_UNSUPPORTED）+ EXT_LABELS 扩 17 项 QMC 扩展名 + EVENT_LABELS 加 9 个 qq_guide_* / support_matrix_* 事件；[UploadsByFormatChart](admin/src/pages/decrypt-analysis/uploads/UploadsByFormatChart.tsx) 加 17 项 QMC 颜色 + ALL_EXTS；3 个 SubSection EXT_OPTIONS 加 mflac / mgg / qmcflac / qmcogg 主要项
- **埋点 9 新事件**：`qq_guide_entry_view/click`、`qq_guide_view/dismiss`（带 trigger='entry'/'failure'/'auto'/'matrix'）、`qq_download_click`（带 sha256）、`support_matrix_entry_view/click`、`support_matrix_view/dismiss`。字段白名单加 `trigger` / `sha256`（[server/src/routes/track.ts](server/src/routes/track.ts) ALLOWED_PROPS）
- **安装包托管**：QQ 音乐 v19.51 Windows 安装包放服务器 **独立目录** `/www/wwwroot/musiczh-downloads/`（**不进 git、不进部署 zip**，与主站 `/www/wwwroot/musiczh/` 完全隔离，避免日常 user.zip 部署误删）；nginx 加 `location ^~ /downloads/ { alias /www/wwwroot/musiczh-downloads/; }` 把 URL `/downloads/qq-music-v19.51-windows.zip` alias 过去；前端硬编码下载链接保持不变；sha256 记录在 [docs/QQ_INSTALLER_SHA256.md](docs/QQ_INSTALLER_SHA256.md)。上线后 v0.6.0 当晚因物理目录在主站下被 user.zip 部署误删过一次，故迁出至独立目录
- **SEO**：[index.html](index.html) title / description / keywords / OG / Twitter / JSON-LD WebApplication / FAQ / noscript SEO 兜底文档全部加 QQ 音乐 mflac/mgg 相关关键字与说明；sitemap.xml lastmod 更新到 2026-05-25
- **已知边界**：
  - 改后缀绕过（.mflac → .flac）走不进 sniff 的 qmc 分支，会被通用 INVALID_HEADER 兜底——本期不做内容嗅探
  - RC4 cipher 解大文件（≥100MB）主线程会卡 5-15s，本期不引入 Web Worker，沿用 NCM/KGM 的现状（上线后看占比再决定是否单独排期）
  - 历史 `source='qq_mflac'` 失败日志在 SOURCE_LABEL 映射为「QQ 音乐（v0.6.0 前 sniff 拦截）」便于回看

## v0.5.2 / 运营后台 v0.4.5 · 20260513 上线

- **修「上传文件总数·新 < 旧」数据 anomaly**（今日 Overview 旧 856 / 新 671 / Δ −185，触发 v0.4.3 设计的红色告警）：根因是 v0.5.0 引入的「≥50 文件大批量警告弹窗」`onLargeBatchReselect` 路径——`upload_drop/pick` 已 emit（旧口径 +N），但用户点「重新选择」或 ESC 时 `setPendingLargeBatch(null)` 直接丢 pending files，既不走 commitFiles 也不进 rejected，新口径 (COUNT(upload_attempt)+COUNT(upload_reject)) +0，导致 anomaly。修复：在 [src/App.tsx](src/App.tsx) `onLargeBatchReselect` 里对 pendingLargeBatch.files 逐个补发 `upload_reject(reject_reason='LARGE_BATCH_DISMISSED')`，让两口径自洽。
- **运营后台新增「被拒-大批量取消」细分**：server [adminUploads.ts](server/src/routes/adminUploads.ts) STATUS_VALUES / statusToWhere / mergedStatus / timeseries SQL 加 `rejected_large_batch` / `LARGE_BATCH_DISMISSED`；admin [api.ts](admin/src/lib/api.ts) `UploadStatus` 加 `'rejected_large_batch'` + `UploadsTimeseriesPoint.reject_large_batch`；[format.ts](admin/src/lib/format.ts) REJECT_REASON_LABEL / UploadStatusKey / UPLOAD_STATUS_LABEL / FILTER_OPTIONS 四处加「大批量取消」；[Overview.tsx](admin/src/pages/Overview.tsx)「上传失败」卡片 tooltip 补「大批量取消」枚举；[UploadsTrendChart.tsx](admin/src/pages/decrypt-analysis/uploads/UploadsTrendChart.tsx) 折线图加 `reject_large_batch` 数 + 占比双序列（color #13C2C2 / #08979C）。
- **历史 185 条无法回填**：drop/pick 事件只记 count 总数没记单文件 detail，v0.5.2 之前的差异只能保留作为观察数据。CLAUDE.md「2026-07 评估旧口径卡片移除」时间窗保持不变。

## v0.5.1 · 20260513 上线

- **修「同 file_id 1ms 内连发 2 条 decrypt_fail」埋点 bug**：根因是 [src/App.tsx](src/App.tsx) `updateFile` 只调 `setFiles`，没同步写回 `filesRef.current`；processQueue 的 sniff 失败分支全程同步（updateFile → trackFailure → continue），下一轮 while 在 React commit 之前又读到 stale 'pending' 状态，对同一文件再走一次失败分支。修复：在 setFiles 的 updater 里把新 list 同步写回 ref，循环立即看到新 status。正常解密路径不复现是因为 `await decryptAudioFile` 给了 commit 时间窗。
- **识别 QQ 音乐 mflac / mgg 改后缀上传**：[src/lib/sniff.ts](src/lib/sniff.ts) 新增 `qq_unsupported` RealFormat + 文件名识别（`/\.(mflac\d*|mflach|mgg\d*)(\.|$)/i` + `/\[mqms\d*\]/i`）；[src/App.tsx](src/App.tsx) 新增 qq_unsupported 分支，文案「这是 QQ 音乐加密格式（mflac/mgg），本工具暂不支持，可关注后续版本」；trackFailure 带 `source: 'qq_mflac'` 让运营后台失败日志能按 source 列统计实际占比（决策是否优先做 mflac 支持）。不新增 error_code，复用 INVALID_HEADER。

## v0.4.4 · 20260512 上线

- **主站设计稿落地**（Claude Design 交接包 `EdhylNGVEkdDFEMi0p4F1Q`）：
  - DropZone 主文案统一为「点击或拖拽上传音乐文件 · 转为 MP3」（列表非空不切换、仅 dragging 时切「松手即可开始转换」）
  - helper 改为「支持 NCM / KGM / FLAC · 单个最大 200MB · 还可上传 N 个」
  - 拖拽区下方单行 mono 灰、左对齐：「网易云 / 酷狗 已支持 · QQ / 酷我 敬请期待」
  - 「正在转换」指示器从拖拽区底部迁到队列 header（同字号 mono 灰 + 红 pulse 圆点 + 末尾红 NN%），跟在「N 个文件 · 已完成 M」之后；解密 / 转码两种状态统一口径
  - FileRow 迷你黑胶规范统一：删除「done 无封面用音符占位」分支，五态全部黑碟 + groove 细环 + 状态色 label（进行中 `#D42B10` / 完成无封面 `#4D8B5C` / 失败 `#B85A4A`）+ 高光 spindle
  - FileRow 格式徽章升级为「来源 › 输出」双段式（NCM 红 / KGM·VPR 蓝 / FLAC·MP3·OGG 茶），来源始终显示
- **首屏 SEO 兜底闪屏修复**：原 `#root` 内置的 `.seo-bootstrap` SEO 文档在 React 挂载前会闪一帧；改为搬进 `<noscript>`，开启 JS 的浏览器永不渲染，未跑 JS 的爬虫（百度）仍能读 DOM
- 顺手修了 `currentTitle` 在解密阶段拿不到 meta 时显示为空的 bug —— 兜底为文件名（去扩展名）

## v0.4.3 / 运营后台 v0.4.3 · 20260512 上线

- Overview 新增「上传文件总数（旧口径）」**临时观察卡片**，与新口径并列展示偏差 Δ
- 旧口径 SQL = `SUM(upload_drop/pick.count)`；新口径 = `COUNT(upload_attempt + upload_reject)`
- Δ 显示「新 − 旧 = N（占新口径 X%）」，新口径 < 旧口径时变红 + ⚠️ 提示（应不发生）
- 预计 2026-07 评估稳定后整行删除（待办里已登记）

## v0.4.2 / 运营后台 v0.4.2 · 20260512 上线

- 修 v0.4.1 漏改的 3 处「上传」口径，让全站数据自洽：
  - 漏斗件维度「上传」层（adminStats.ts:fileUpload）
  - 自定义指标趋势 `upload_files` timeseries
  - 自定义指标趋势 `upload_uv` / `download_uv` timeseries（与 overview 卡片对齐）
- 现在「漏斗·按文件数 → 上传」/「自定义趋势 → 上传文件总数」/「Overview 上传文件总数卡片」三处口径严格一致：`COUNT(upload_attempt) + COUNT(upload_reject)`

## v0.4.1 / 运营后台 v0.4.1 · 20260512 上线

- **修曝光埋点 `useImpression` 在动态行上失效**：旧版 `useRef + useEffect([event])` 在 FileRow 内 conditional render 的按钮上 ref 始终为 null，5 个 view 事件（btn_transcode / row_download / row_retry / row_remove / btn_transcode_view）长期 0 上报；改 callback ref + useState(node) 后 DOM 挂载时自动重绑 observer
- **心跳 + 中止事件**：`transcode_progress` 按 0.1/0.3/0.5/0.7/0.9 五桶 emit；analytics SDK 维护 inflight Map，`pagehide` / `visibilitychange=hidden` 时遍历未结束文件 emit `decrypt_abandon` / `transcode_abandon`（含 last_progress / stage），sendBeacon 兜底——定位 auto-FLAC 静默崩的核心手段
- **全链路 file_id**：addFiles 用 `crypto.randomUUID()` 给每文件生成 UUID，贯穿 upload_attempt → decrypt_*/transcode_* 全部事件；后端 events 表加 VIRTUAL 生成列 + 索引（`idx_events_file_id`），按 file_id 关联出每条上传的 pipeline_status（success/failed/abandoned/pending/legacy）
- **运营后台「上传日志」状态列合并**：旧的「类型」+「拒绝原因」两列合并为单一「状态」列（被拒-格式/被拒-大小/被拒-队列/成功/失败/中止/未完成/-（历史）），筛选器同步合并；Drawer 加事件时间线（同 file_id 所有事件按时序列出）
- **运营后台上传日志页底部新增两张图**：「上传趋势」单图双 Y 轴 10 series 折线（数量类左 Y + 占比类右 Y，可勾选切换）；「按格式维度拆解」ComposedChart（柱状成功/失败 + 折线成功率/格式占比）
- **运营后台 Overview「上传文件总数」卡片拆分小字重梳**：旧 4 段（被拒/解密/原 flac/未完成）→ 新 6 段（成功/失败/中止/被拒/未完成/历史），按 file_id 精确口径
- 顺手修「超出 100MB」老 bug → 「超出 200MB」（admin REJECT 标签 + UploadsSection 文案）

## v0.4.0 / 运营后台 v0.4 · 20260510 上线

- **单文件上限 100MB → 200MB**：NCM / 原始 FLAC 全量支持；KGM/VPR 因 mask 资产暂未扩容，仍 ≤100MB 才能解（100-200MB 会抛 FILE_TOO_LARGE）。扩容脚本见 `scripts/build-kgm-mask.ts`
- **原始 .flac 上传自动转 MP3**：跳过解密，进队列后立即走 transcode 路径；`transcode_done` 不带 `source` 用于运营后台口径区分
- **运营后台「转换成功」**：Overview 顶部新增「转换成功数（件）」卡片（口径 = 解密成功 + 原始 flac 转码成功，悬停 InfoIcon 看说明）；漏斗第二层从「解密成功」改为「转换成功」，相同口径，**人维度 / 件维度同步**；同一文件先解密再转码不会被双计数

## 运营后台 v0.3 · 20260510 上线

- **上传日志**：`upload_attempt`（每个文件成功一条）/ `upload_reject`（每个被拒一条 + reject_reason），运营后台「解密分析 → 上传日志」可看格式/大小/数量超限明细
- **下载日志**：`download_done` / `download_fail` 三种 `download_kind`（single / all_separate / zip），ZIP 打包失败 + Blob URL 异常都有兜底
- **全链路漏斗**：Overview 漏斗扩到双口径——人维度 4 层（访问→上传→解密→下载） / 件维度 3 层（上传→解密→下载），柱条上方标层间转化率
- **解密分析页**：从顺序排版改为 Tab 结构（上传日志 / 解密日志 / 下载日志 / 格式分布），每个 Section 拆到独立文件
- 上传/下载日志列带浏览器/操作系统/设备 3 列，复用后端 `parseUA` 共享 helper

## v0.2.0 · 20260508 上线

- 运营后台数据看板（PV/UV、人/件维度核心 8 指标、漏斗、多选指标趋势、按钮埋点曝光+点击+CTR、失败日志详情可复制 JSON）
- 全站埋点 SDK（visitor_id、session_id、批量上报、sendBeacon 兜底、IntersectionObserver 曝光观察器）
- 主站全部按钮接入 `useImpression` 曝光 + `analytics.track` 点击 +`trackFailure` 失败上报
- 后端 Hono + better-sqlite3 + JWT (HttpOnly Cookie) + 单管理员 seed
- 时间筛选：今日 / 7天 / 30天 / 90天 / 1年 / 自定义日期范围
- 数据保留 365 天，每日 03:00 自动清理；SQLite 每日 04:00 备份保留 30 天
