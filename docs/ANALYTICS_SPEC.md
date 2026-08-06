# 拾音 · 数据埋点规范

> 这份文档是「拾音」站点埋点的**单一事实源**。
> 任何新增按钮、新增异步流程、新增页面，都必须在合并 PR 之前在这里登记一行；
> 否则后台「按钮埋点」页查不到数据，运营会看到一个 hash-like 的 base 名。

适用项目：
- 用户端 [src/](../src/)（含 SDK [src/lib/analytics.ts](../src/lib/analytics.ts)）
- 后端 [server/](../server/)
- 管理后台 [admin/](../admin/)

---

## 1. 命名规范

事件名采用 **snake_case**，结构为：`<模块>_<对象>_<动作>`。

**动作枚举**（仅允许这些）：

| 动作 | 含义 |
|---|---|
| `click` | 用户点击触发 |
| `view`  | 元素曝光（进入视口 ≥ 50% 且停留 ≥ 300ms） |
| `submit` | 表单提交 |
| `start` / `done` / `fail` | 异步流程的开始 / 成功 / 失败三连 |
| `drop` / `pick` | 拖拽落下 / 通过 input 选择 |

**模块前缀建议**：

| 前缀 | 适用 |
|---|---|
| `btn_*` | 工具栏 / 全局按钮 |
| `row_*` | 列表行内的按钮 |
| `dialog_*` | 弹窗 / 二次确认 |
| `upload_*` | 上传相关 |
| `decrypt_*` / `transcode_*` | 业务流程事件 |
| `pageview` | 单独保留，全局首屏访问 |

---

## 2. 公共字段（SDK 自动注入，业务方不要手动传）

| 字段 | 说明 |
|---|---|
| `ts` | 事件时间戳（毫秒，前端 SDK `Date.now()`） |
| `visitor_id` | 浏览器维度 UUID（首次访问生成，存 `localStorage._sleepno_vid`） |
| `session_id` | 会话 ID（30 分钟无活动重置） |
| `page` | `location.pathname` |
| `app_ver` | 主站版本（来自 `package.json.version`，由 vite.config 注入） |
| `ua` | 完整 User-Agent（后端补） |
| `ip`  | 客户端 IP（后端从 `X-Forwarded-For` / `X-Real-IP` 取） |

---

## 3. 业务字段白名单（写在 `props` 里）

只有以下 key 会被后端落库；不在白名单的字段会被 [server/src/routes/track.ts](../server/src/routes/track.ts) 静默丢弃。

| key | 类型 | 含义 |
|---|---|---|
| `file_name` | string | 完整文件名（**用户已授权上报**，便于排查） |
| `file_ext` | string | 扩展名（小写，不带点）|
| `file_size` | number | 字节 |
| `error_code` | string | 解密/转码/下载错误码；**v0.8.1 起** `cover_backfill_fail` 复用本字段上报 `COVER_TIMEOUT` / `COVER_TOO_LARGE` / `COVER_HTTP_ERROR` / `COVER_NETWORK_ERROR` / `COVER_UNSUPPORTED_IMAGE` / `COVER_TAG_WRITE_FAILED` / `COVER_EMBED_VERIFY_FAILED` |
| `error_msg` | string | 错误描述 |
| `error_stack` | string | `err.stack`（截断 ≤ 8000 字符） |
| `count` | number | 一次操作牵涉的文件数 |
| `total_size` | number | 多文件总字节 |
| `format` | string | `mp3` / `flac` / `ogg` / `m4a`（**v0.8.0 起**：XM 解密产物可为 M4A） |
| `source` | string | `ncm` / `kgm` / `vpr` / `qmc`（**v0.6.0 起**：QQ 音乐 QMCv2 系列）/ `xm`（**v0.8.0 起**：喜马拉雅 XM v2）/ `qq_mflac`（**v0.5.1-v0.5.2** 仅 sniff 拦截阶段使用，运营后台 SOURCE_LABEL 仍保留映射便于回看历史失败日志） |
| `from_format` | string | 转码前的格式：`flac` / `ogg` / `m4a`。配合 `source IS NULL` 可拆分原始 FLAC/OGG/M4A 上传；`source='xm'` 且 `from_format='m4a'` 表示 XM 解密后由用户主动转 MP3 |
| `queue_size` | number | 当前队列长度 |
| `action` | string | 通用枚举（如对话框 confirm/cancel） |
| `status` | string | 文件当时状态 |
| `referrer` | string | 来源 URL（仅 `pageview` 自动从 `document.referrer` 采集，用于访客日志渠道分析）|
| `reject_reason` | string | 上传被拒原因：`FORMAT_UNSUPPORTED` / `SIZE_EXCEEDED` / `QUEUE_FULL` / `LARGE_BATCH_DISMISSED`。`QUEUE_FULL` **v0.5.0 起不再产生**（50 上限改为性能警告弹窗，枚举值保留兼容历史数据）。`LARGE_BATCH_DISMISSED` **v0.5.2 起新增**——用户在 ≥50 文件警告弹窗里选「重新选择」或按 ESC 关闭、pending files 被丢弃时由 `onLargeBatchReselect` 补发，让旧/新口径自洽（修复 v0.5.0-v0.5.1 期间「旧 > 新」anomaly）。**运营后台 v0.4.8 起**在状态分类中独立为 `user_dismissed`（"主动取消"），不再计入"被拒"/"上传失败"口径；`reject_reason` 字段值本身保持不变 |
| `download_kind` | string | 下载方式：`single` / `all_separate` / `zip` |
| `file_id` | string | **v0.4.1 起新增** · 文件级 UUID v4，由 `addFiles` 用 `crypto.randomUUID()` 生成；贯穿 `upload_attempt → decrypt_*/transcode_*` 全链路，用来在后端关联出 `pipeline_status`。v0.4.1 之前的事件无此字段，运营后台显示「-（历史数据）」 |
| `progress_bucket` | number | **v0.4.1 起新增** · `transcode_progress` 心跳的进度桶，仅取 `0.1 / 0.3 / 0.5 / 0.7 / 0.9` 五值，桶内去重 |
| `last_progress` | number | **v0.4.1 起新增** · `*_abandon` 中止事件的最近一次 progress 值（0-1），辅助定位中止发生在哪一段 |
| `stage` | string | **v0.4.1 起新增** · `*_abandon` 中止事件的阶段，`decrypt` / `transcode` |
| `trigger` | string | **v0.6.0 起新增** · QQ 引导弹窗触发来源：`entry` / `failure` / `auto` / `matrix`。`qq_guide_view` / `qq_guide_dismiss` / `qq_download_click` 都带，用来评估各入口的转化效率 |
| `sha256` | string | **v0.6.0 起新增** · QQ 安装包文件的 SHA-256（小写 hex，长度 64），仅 `qq_download_click` 携带。用于追踪服务器上的安装包是否被替换/篡改 |
| `encoder` | string | **v0.6.2 起新增** · 转码编码器标识，命名约定 `<encoder>-<mode>-<param>`。当前枚举值：`wasm-lame-v2`（默认，LAME VBR -V 2，平均 ~190 kbps）；规划值 `wasm-lame-v0`（VBR -V 0，~245 kbps，公认透明）、`wasm-lame-cbr-192` / `wasm-lame-cbr-320`（CBR 模式，未启用）。`transcode_start` / `transcode_done` 携带 |
| `output_size` | number | **v0.6.2 起新增** · 转码产物 MP3 的字节数；配合 file_size（源大小）和 sourceDuration 可推算平均码率分布。仅 `transcode_done` 携带 |
| `has_cover` | boolean | **v0.6.3 起新增** · 转码 / 解密产物是否含封面。`transcode_done` 表示 FLAC/OGG/M4A 原文件能不能解出可写入 MP3 的 cover；`decrypt_done` 仍是原始解密产物的内嵌口径，XM 外层封面 URL 写入 M4A `covr` 的结果由 `cover_backfill_done/fail` 表示 |
| `decrypt_ms` | number | **v0.6.4 起新增** · 解密耗时（毫秒），wall-clock 包住整个 `decryptAudioFile()` 调用。`decrypt_done` 携带；`decrypt_fail` 也带（仅诊断"多久后失败"，**不进性能均值口径**）。运营后台「性能分析」消费：配合 `file_size`（=原始加密字节）算「平均解密耗时」「每 MB 解密耗时」。⚠️ 每会话首个 KGM 文件含 1.1MB mask 懒加载，该文件 `decrypt_ms` 会偏高（P95 自然吸收） |
| `transcode_ms` | number | **v0.6.4 起新增** · 转码耗时（毫秒），wall-clock 包住 `transcodeToMp3()` 调用（不含 ID3 写入，耗时极小）。`transcode_done` 携带；`transcode_fail` 也带（诊断用，不进均值）。配合 `file_size`（=转码输入即解密产物字节）算「平均转码耗时」「每 MB 转码耗时」。⚠️ 每会话首个转码含 LAME WASM 加载，会偏高 |
| `browser_family` | string | **v0.8.2 起新增** · 兼容性提示识别出的浏览器族：`chromium` / `edge` / `firefox` / `safari` / `ios_webkit`。未知浏览器不展示提示，也不产生兼容性事件 |
| `detected_version` | string | **v0.8.2 起新增** · 从 User-Agent / User-Agent Client Hints 解析出的浏览器或 iOS WebKit 版本，例如 `14.1`；只用于兼容性提示统计 |
| `required_version` | string | **v0.8.2 起新增** · 对应浏览器族的最低支持版本，例如 Safari 的 `16.4`；与前端兼容性门槛保持一致 |

**绝对禁止**：上报文件二进制内容、文件内容哈希（指纹）、用户输入的密码 / 账号、网银卡号等隐私信息。

新增白名单字段需要：
1. 在本文档此表追加一行
2. 同步修改 [server/src/routes/track.ts](../server/src/routes/track.ts) 的 `ALLOWED_PROPS`

---

## 4. 事件全表（按发生顺序）

事件 → 中文描述 → 触发位置 → 主要字段 → 备注。新增按钮 / 流程时**必须在此追加一行**。

| 事件名 | 中文描述 | 触发位置（文件 : 行） | 主要字段 | 备注 |
|---|---|---|---|---|
| `pageview` | 主站 - 首屏访问 | [src/main.tsx](../src/main.tsx) `analytics.pageview()` | `page` | SDK 启动后调用一次 |
| `upload_zone_click` | 主站 - 上传区 - 点击（含还没选择文件的纯点击） | [src/App.tsx](../src/App.tsx) `DropZone.onClick` | — | label 任意点击都会触发，配合 `upload_pick` 一起看 |
| `upload_zone_view` | 主站 - 上传区 - 曝光 | [src/App.tsx](../src/App.tsx) `DropZone` ref | — | session 内只触发一次 |
| `upload_drop` | 主站 - 上传区 - 拖拽文件松手 | [src/App.tsx](../src/App.tsx) `DropZone.onDrop` | `count, total_size` | 批量动作事件，文件级请看 `upload_attempt` |
| `upload_pick` | 主站 - 上传区 - 点击选择文件后确认 | [src/App.tsx](../src/App.tsx) `input.onChange` | `count` | 批量动作事件 |
| `upload_attempt` | 主站 - 业务 - 上传成功（进入队列） | [src/App.tsx](../src/App.tsx) `addFiles` | `file_name, file_ext, file_size` | **每个通过限制规则的文件一条**；漏斗件维度的「上传」层；原始 .flac / .ogg / .m4a 和喜马拉雅 .xm 上传也走此事件 |
| `upload_reject` | 主站 - 业务 - 上传被拒 | [src/App.tsx](../src/App.tsx) `addFiles` | `file_name, file_ext, file_size, reject_reason` | **每个被拒文件一条**；用于诊断"哪些格式 / 多大 / 多少超限" |
| `btn_transcode_click` / `btn_transcode_view` | 主站 - 列表行 - 转 MP3 按钮 | [src/App.tsx](../src/App.tsx) `FileRow` | `file_name, file_ext, file_size, format` | 仅解密结果为 FLAC / OGG / M4A 时显示 |
| `row_download_click` / `row_download_view` | 主站 - 列表行 - 单文件下载 | [src/App.tsx](../src/App.tsx) `FileRow` | `file_name, format, file_size` | 仅 done 状态显示 |
| `row_retry_click` / `row_retry_view` | 主站 - 列表行 - 重试 | [src/App.tsx](../src/App.tsx) `FileRow` | `file_name, error_code` | 仅 failed 状态显示 |
| `row_remove_click` / `row_remove_view` | 主站 - 列表行 - 移除（×） | [src/App.tsx](../src/App.tsx) `FileRow` | `file_name, status` | |
| `btn_clear_all_click` / `btn_clear_all_view` | 主站 - 工具栏 - 全部清空 | [src/App.tsx](../src/App.tsx) `ClearAllButton` | — | click 打开二次确认 |
| `dialog_clear_confirm` | 主站 - 全部清空二次确认 | [src/App.tsx](../src/App.tsx) `ClearAllButton` 弹层 | `action: 'confirm' \| 'cancel'` | |
| `dialog_browser_compat_view` | **v0.8.2** 主站 - 浏览器版本过低弹窗 - 曝光 | [src/components/browser-compat-modal.tsx](../src/components/browser-compat-modal.tsx) mount | `browser_family, detected_version, required_version` | 仅明确低于支持门槛时产生；未知浏览器和已支持版本不提示、不上报 |
| `dialog_browser_compat_confirm` | **v0.8.2** 主站 - 浏览器版本过低弹窗 - 确定 | [src/components/browser-compat-modal.tsx](../src/components/browser-compat-modal.tsx) 确定按钮 | `action='confirm', browser_family, detected_version, required_version` | 弱提示，不跳转、不阻断页面能力；同标签页会话内不重复展示 |
| `dialog_browser_compat_close` | **v0.8.2** 主站 - 浏览器版本过低弹窗 - 关闭 | [src/components/browser-compat-modal.tsx](../src/components/browser-compat-modal.tsx) 关闭按钮 / Esc / 遮罩 | `action: 'button' \| 'esc' \| 'overlay', browser_family, detected_version, required_version` | 三种关闭入口共用事件，用 `action` 区分 |
| `btn_download_all_click` / `btn_download_all_view` | 主站 - 工具栏 - 下载全部（散文件） | [src/App.tsx](../src/App.tsx) 工具栏 | `count` | |
| `btn_download_zip_click` / `btn_download_zip_view` | 主站 - 工具栏 - 打包下载（ZIP） | [src/App.tsx](../src/App.tsx) 工具栏 | `count` | |
| `decrypt_start` | 主站 - 业务 - 解密任务开始 | [src/App.tsx](../src/App.tsx) `processQueue` | `file_name, file_ext, file_size` | |
| `decrypt_done` | 主站 - 业务 - 解密成功 | [src/App.tsx](../src/App.tsx) `processQueue` | `file_name, file_ext, file_size, source, format, has_cover, decrypt_ms` | **v0.8.0 起** `source='xm'`，`format` 按产物真实 magic 上报 `mp3/flac/ogg/m4a`，不按扩展名推断。**v0.6.3 起**带 `has_cover`；**v0.6.4 起**带 `decrypt_ms` |
| `decrypt_fail` | 主站 - 业务 - 解密失败 | [src/App.tsx](../src/App.tsx) `processQueue` catch | `file_name, error_code, source?, decrypt_ms, ...` | 同步触发 `trackFailure`。**v0.8.0 起** XM 可产生 `XM_PARSE_FAILED` / `XM_VERSION_UNSUPPORTED` / `XM_DECRYPT_FAILED`；解密后不是受支持音频仍统一使用 `OUTPUT_NOT_AUDIO`。既有 QQ、NCM 与 `FILE_UNREADABLE` 语义保持不变 |
| `decrypt_offset_recovered` | **v0.7.1** 主站 - 诊断 - NCM 偏移自愈 | [src/App.tsx](../src/App.tsx) `processQueue`（`result.offsetRecovered`） | `file_name, file_ext, file_size, source` | NCM 主偏移（imageSpace）解出的不是合法音频、靠 magic 锚定扫描找回了真音频起点时触发。常态应为 0；一旦冒头 = 出现新偏移变体、但已被自愈兜住，提示该回头补 parser（不是用户可见故障） |
| `decrypt_format_mismatch` | **v0.7.1** 主站 - 诊断 - 解密格式不符 | [src/App.tsx](../src/App.tsx) `processQueue` | `file_name, file_ext, file_size, source, format` | 解密产物真实 magic 判定的格式（`format`）与元数据声称格式（`meta.format`，仅 NCM 有）在 flac/mp3 轴上冲突时触发。常态接近 0；抬升 = 某来源解析或元数据有系统性问题的早期信号 |
| `cover_backfill_done` | **v0.7.1** 主站 - 业务 - 封面回填成功 | [src/App.tsx](../src/App.tsx) `processQueue` | `file_name, file_size, source` | 解密产物无内嵌封面但有 albumPic → 抓 CDN 图并写入下载产物成功。**v0.8.1 起** NCM/XM 共用并发 3、总期限 2 秒的 `finalizing` 收尾；成功或明确降级后才进入 `done`，但不阻塞后续音频解密 |
| `cover_backfill_fail` | **v0.7.1** 主站 - 业务 - 封面回填失败 | [src/App.tsx](../src/App.tsx) `processQueue` | `file_name, file_size, source, error_code` | **v0.8.1 起**用明确 `COVER_*` 码区分总期限、超限、HTTP、网络、图片格式、标签写入和写后验证失败；任何失败都只降级为原始音频，不产生 `decrypt_fail`。与 `cover_backfill_done` 组成成功率，目标 ≥95% |
| `transcode_start` | 主站 - 业务 - 转码（→MP3）开始 | [src/App.tsx](../src/App.tsx) `transcodeFile` | `file_name, from_format, file_size, source, encoder` | 仅用户主动把解密产物 FLAC/OGG/M4A 转 MP3，或原始 FLAC/OGG/M4A 自动转码时产生；XM 解密完成为 M4A 时不会自动产生，用户点击后带 `source='xm'`。**v0.6.2 起**带 `encoder='wasm-lame-v2'` |
| `transcode_done` | 主站 - 业务 - 转码成功 | [src/App.tsx](../src/App.tsx) `transcodeFile` | `file_name, from_format, file_size, source, encoder, output_size, has_cover, transcode_ms` | `source IS NULL` 是原始 FLAC/OGG/M4A 上传；`source='xm'` 可由 `from_format` 区分 M4A/FLAC/OGG。产物统一为 MP3 |
| `transcode_fail` | 主站 - 业务 - 转码失败 | [src/App.tsx](../src/App.tsx) `transcodeFile` catch | `file_name, error_code, error_msg, error_stack, transcode_ms, ...` | 同步触发 `trackFailure`。**v0.8.0 起** M4A 的 WebCodecs 与 LibAV fallback 均失败时使用 `AAC_DECODE_FAILED`；失败后 UI 恢复原 `done + m4a`，仍可下载原文件 |
| `download_done` | 主站 - 业务 - 下载完成 | [src/App.tsx](../src/App.tsx) `FileRow` 单文件 / `downloadAllSeparate` / `downloadAllAsZip` | `file_name, file_ext, file_size, download_kind` | ZIP 整批成功后按文件数批量发；漏斗件维度的「下载」层 |
| `download_fail` | 主站 - 业务 - 下载失败 | 三处下载入口的 try/catch 兜底 | `download_kind, error_code, error_msg, file_name?` | 同步触发 `trackFailure('download',...)`；ZIP 整批失败时 `file_name` 留空 |
| `transcode_progress` | **v0.4.1** 主站 - 业务 - 转码进度心跳 | [src/App.tsx](../src/App.tsx) `transcodeFile.onProgress` → SDK 分桶 | `file_id, file_name, file_ext, file_size, from_format, progress_bucket` | SDK 内按 `[0.1, 0.3, 0.5, 0.7, 0.9]` 五桶单向跨越触发，每桶每文件 emit 一次，用于定位 auto-FLAC 卡死在哪一段 |
| `decrypt_abandon` | **v0.4.1** 主站 - 业务 - 解密中止 | [src/lib/analytics.ts](../src/lib/analytics.ts) `onHide` 遍历 inflight Map | `file_id, file_name, file_ext, file_size, last_progress, stage='decrypt'` | pagehide / visibilitychange=hidden 触发；走 sendBeacon 兜底 |
| `transcode_abandon` | **v0.4.1** 主站 - 业务 - 转码中止 | [src/lib/analytics.ts](../src/lib/analytics.ts) `onHide` 遍历 inflight Map | `file_id, file_name, file_ext, file_size, from_format, last_progress, stage='transcode'` | 同上，**auto-FLAC OOM 静默崩定位用** |
| `dialog_large_batch_view` | **v0.5.0** 主站 - 性能警告弹窗（≥50 文件）- 曝光 | [src/components/v050.tsx](../src/components/v050.tsx) `LargeBatchWarningModal` mount | `queue_size, count` | `queue_size` = 合计总数；`count` = 本次新增数。弹窗内两个按钮不另埋 `_view`（孤立曝光会拉低按钮埋点页 CTR） |
| `dialog_large_batch_confirm` | **v0.5.0** 主站 - 性能警告弹窗 - 选择 | [src/components/v050.tsx](../src/components/v050.tsx) `LargeBatchWarningModal` 按钮 onClick | `action: 'continue' \| 'reselect', queue_size, count` | `reselect` 会拉起系统选择框重选。**与 `_view` 组队进入按钮埋点页 CTR 计算**（v0.5.0 起后端把 `_confirm/_close/_dismiss` 视作行动后缀） |
| `btn_reject_details_view` / `btn_reject_details_click` | **v0.5.0** 主站 - 上传拦截横条 - 查看详情按钮 | [src/components/v050.tsx](../src/components/v050.tsx) `WarningBannerV2` 按钮 | `count` | `count` = 本次被拒文件数 |
| `dialog_reject_details_view` | **v0.5.0** 主站 - 拦截详情弹窗 - 曝光 | [src/components/v050.tsx](../src/components/v050.tsx) `RejectDetailsModal` mount | `count` | |
| `dialog_reject_details_close` | **v0.5.0** 主站 - 拦截详情弹窗 - 关闭 | [src/components/v050.tsx](../src/components/v050.tsx) `RejectDetailsModal` × / 底部按钮 / 遮罩 | `count` | |
| `banner_flac_prompt_view` | **v0.5.0** 主站 - FLAC/OGG/M4A 一键转 MP3 横条 - 曝光 | [src/components/v050.tsx](../src/components/v050.tsx) `FlacBatchPromptBanner` div ref | `count` | 事件名为历史兼容保留；**v0.8.0 起** `count` = 当前全部 done 且格式为 FLAC/OGG/M4A 的文件总数 |
| `banner_flac_prompt_dismiss` | **v0.5.0** 主站 - FLAC/OGG/M4A 一键转 MP3 横条 - 关闭 | [src/components/v050.tsx](../src/components/v050.tsx) `FlacBatchPromptBanner` × | `count` | 关闭时记录当前三种可转码文件 ID；后续出现任一新 ID 时重显 |
| `btn_flac_batch_transcode_view` / `btn_flac_batch_transcode_click` | **v0.5.0** 主站 - FLAC/OGG/M4A 横条 - 一键转 MP3 按钮 | [src/components/v050.tsx](../src/components/v050.tsx) `FlacBatchPromptBanner` CTA | `count` | 事件名为历史兼容保留；点击后批量触发当前所有 done 且格式为 FLAC/OGG/M4A 的行，与单行按钮共用 `transcodeFile` |
| `qq_guide_entry_view` / `qq_guide_entry_click` | **v0.6.0** 主站 - 拖拽区下方 QQ 引导入口 | [src/components/qq-guide.tsx](../src/components/qq-guide.tsx) `QqGuideEntry` | — | 常驻入口，曝光率应接近拖拽区 |
| `qq_guide_view` | **v0.6.0** 主站 - QQ 使用说明弹窗 - 曝光 | [src/components/qq-guide.tsx](../src/components/qq-guide.tsx) `QqGuideModal` mount | `trigger: 'entry' \| 'failure' \| 'auto' \| 'matrix'` | 触发来源：entry=拖拽区入口点击；failure=QMC_NEW_VERSION_UNSUPPORTED 失败行 CTA；auto=首次拖入 QMC 文件且 localStorage 未标记；matrix=从平台/格式总览弹窗跳来 |
| `qq_guide_dismiss` | **v0.6.0** 主站 - QQ 使用说明弹窗 - 关闭 | [src/components/qq-guide.tsx](../src/components/qq-guide.tsx) `QqGuideModal` close | `trigger` | 与对应 `qq_guide_view` 组队 |
| `qq_download_click` | **v0.6.0** 主站 - QQ 使用说明弹窗 - 下载旧版安装包按钮 | [src/components/qq-guide.tsx](../src/components/qq-guide.tsx) `QqGuideModal` CTA | `trigger, sha256?` | `sha256` 用于追踪安装包版本一致性 |
| `support_matrix_entry_view` / `support_matrix_entry_click` | **v0.6.0** 主站 - 拖拽区下方「查看全部格式」入口 | [src/components/support-matrix.tsx](../src/components/support-matrix.tsx) `SupportMatrixEntry` | — | |
| `support_matrix_view` | **v0.6.0** 主站 - 平台/格式总览弹窗 - 曝光 | [src/components/support-matrix.tsx](../src/components/support-matrix.tsx) `SupportMatrixModal` mount | — | |
| `support_matrix_dismiss` | **v0.6.0** 主站 - 平台/格式总览弹窗 - 关闭 | [src/components/support-matrix.tsx](../src/components/support-matrix.tsx) `SupportMatrixModal` close | — | |

**曝光事件**（`*_view`）：通过组件局部的 `useImpression(eventName)` hook 给按钮 ref 绑定 IntersectionObserver。元素进入视口 ≥ 50% 且停留 ≥ 300ms 触发一次，**session 内同 visitor 同 event 全局去重**——所以单次会话每个按钮最多上报一次曝光，避免噪音。

> v0.4.1 起 `useImpression` 改用 callback ref（旧版用 `useRef` + `useEffect([event])`，在 FileRow 内随 status 切换才挂载的动态按钮上 ref 始终为 null，观察器永远绑不上）。callback ref 模式下 node 从 null 变为 DOM 元素时会重跑 effect，自动重绑 observer。


新增按钮时建议：
```tsx
const myBtnRef = useImpression<HTMLButtonElement>('btn_my_view')
return <button ref={myBtnRef} onClick={() => analytics.track('btn_my_click')}>我</button>
```

中文描述映射在 [admin/src/lib/format.ts](../admin/src/lib/format.ts) 的 `EVENT_LABELS`，新增事件需同步更新。

---

## 5. 失败日志专用通道

解密 / 转码 / 下载失败时，**除了 `*_fail` 事件**，还要调用 `analytics.trackFailure(stage, payload)`，会把详情同步落入后端 `failures` 表。`stage` 取值：`'decrypt' | 'transcode' | 'download'`。

```ts
analytics.trackFailure('decrypt', {
  error_code: 'INVALID_HEADER',
  error_msg,
  error_stack: err instanceof Error ? err.stack : undefined,
  file_name: file.name,
  file_ext,
  file_size: file.size,
  source,
})
```

后台 `失败日志` 页可以按错误码 / 阶段筛选，详情抽屉里有「复制 JSON 给 Claude 排查」按钮，点完直接粘贴给 Claude 即可定位。

---

## 6. 新功能上线 checklist

任何带 UI 的新功能上线前，开发者必须自检：

- [ ] 新增按钮 → 同时埋 `btn_<x>_click`（SDK 已就绪）
- [ ] 新增按钮 → 在挂载时 `analytics.observeImpression(el, 'btn_<x>_view')` 埋曝光
- [ ] 新增异步流程 → 埋 `<x>_start` 与 `<x>_done` 或 `<x>_fail`
- [ ] 新增失败分支 → `analytics.trackFailure('<stage>', { error_code, error_stack, file_name, ... })`
- [ ] 在本文档「§4 事件全表」追加一行（含中文描述）
- [ ] 若引入新业务字段：在「§3 业务字段白名单」加行 + 同步改 [server/src/routes/track.ts](../server/src/routes/track.ts) 的 `ALLOWED_PROPS`
- [ ] 本地启动 `npm run dev` + `npm --prefix server run dev`，DevTools 看 `/api/track` 请求体里事件名齐全
- [ ] 启动 `npm --prefix admin run dev` 进 `/admin`，「按钮埋点」页能看到新事件再合并 PR

---

## 7. 联调命令速查

```bash
# 三个独立子项目，三套独立 dev：
npm run dev           # 用户端 :5173
npm run dev:server    # 后端 :8787（首次执行需在 server/ 内 npm install）
npm run dev:admin     # 后台 :5174（首次执行需在 admin/ 内 npm install）
```

埋点写入：`POST http://localhost:8787/api/track`
看板查询：登录 `http://localhost:5174/admin/` 后台查
