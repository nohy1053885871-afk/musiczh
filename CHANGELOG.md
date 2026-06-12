# 拾音 · 更新日志

本文件归档历史版本的发布说明。**当前/上一版本要点见 [CLAUDE.md](CLAUDE.md)「已完成」一节**，本文件只保留更早的历史。

> 这是一份给项目主 + 未来 Claude 翻阅的离线档案：默认不进对话 context，按需 Read。
> 写新版本时，先在 CLAUDE.md 里写完整一段；下次再有新版上线时，把当前 CLAUDE.md 那段挪到本文件顶部。

---

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
