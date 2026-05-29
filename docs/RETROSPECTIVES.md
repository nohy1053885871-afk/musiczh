# 拾音迭代复盘日志

> 每次大版本收官时新增一节。**下次开始迭代前**，先扫一遍**最新一节的 action items**，看上次哪些做完了、哪些拖了——做完的在新节里复盘效果，拖了的搬进新节继续 owner。
>
> 文件结构每节固定三块：①「数据快照」②「上次 action 回顾」（#1 没有上一次，从 #2 开始）③「本次新增 action items」+ 下次要看的指标。

---

## 复盘 #1 — v0.1 → v0.4 收官（2026-05-11）

> 完整分析报告见 `~/.claude/plans/groovy-sleeping-lerdorf.md`（plan 文件，可能会被清理；核心结论已抄到下面）。

### 数据快照

- **窗口**：2026-05-08 → 2026-05-11（埋点上线后 3 天）
- **总量**：events 23,191 / failures 108 / visitors 209 / sessions 272
- **当日爆发**：05-11 单日 UV 115（占 3 天总量 55%）
- **设备**：Desktop 64% / Mobile 37%（Android 57 UV > iOS 20 UV）
- **重度用户**：35 人贡献 80%+ 解密量；Top 3 各上传 801 / 665 / 553 个文件
- **转化漏斗（以全埋点日 05-11 为准）**：访问 115 → 上传 69（60%）→ 解密 61 → 下载 67

### 功能价值评级

| 功能 | 评级 | 数据 |
|---|---|---|
| NCM 解密 | ⭐⭐⭐⭐⭐ | 3934 done / 1 fail，几乎零失败 |
| KGM/VPR 解密 | ⭐⭐⭐⭐ | 953 done / 21 fail（97.8% 成功） |
| ZIP 打包下载 | ⭐⭐⭐⭐ | 1784 次（占下载 44%） |
| 全部散文件下载 | ⭐⭐⭐⭐ | 1743 次（占下载 43%） |
| auto-FLAC → MP3（v0.4） | ⭐⭐⭐ | 452 start / 140 done，**完成率仅 31%** |
| 强制转 MP3 按钮 | ⭐⭐⭐ | 211 done / 22 UV |
| 单文件下载 | ⭐⭐ | 377 次（仅占 9%） |
| 全部清空 | ⭐⭐ | 108 confirm / 1 cancel（确认弹窗几乎是摆设） |
| 重试按钮 | ⭐ | **12 clicks / 3 UV，基本无人用** |

### 三个关键负向信号

1. 🔴 **上传拒绝 QUEUE_FULL 占 77%**：598 reject 来自 7 个用户，50 文件上限劝退重度用户
2. 🔴 **auto-FLAC 完成率仅 31%**：312 个文件既无 done 也无 fail，疑似 Safari 移动端 OOM 静默崩
3. 🔴 **曝光埋点系统性失效**：7 个 `*_view` 事件应埋，实际只有 4 个上报；列表行内的按钮（btn_transcode / btn_download_all / btn_download_zip / row_download / row_retry 的 view）`useImpression` 在动态节点上没绑上 IntersectionObserver

### 工程化教训（如果重来）

1. **Day 1 就上最简埋点**（5 个事件足够），本次拖到第 10 天，MVP 期完全是黑盒
2. **设计 token 在视觉定稿时锁**，本次拖到第 13 天才有 DESIGN_SPEC v2.0，期间视觉返工 2 次
3. **上线前花 10 分钟自己用一遍看板**，运营后台 v0.2/v0.3/v0.4 三连发都是因为漏 use case
4. **顺序应为 MVP → 数据基建 → 平台扩展**，而非本次的 MVP → 平台扩展 → 数据基建

### 本次新增 Action Items

#### 🔥 P0 — 这周内

- [ ] **修复曝光埋点 `useImpression` 在动态行上失效**
  - 影响：运营后台「按钮埋点」页 CTR 列对 5 个 view 事件长期失真，决策依据不可靠
  - 入口：`src/lib/useImpression.ts` + `src/App.tsx` 内所有 row 内 useImpression 调用点
  - 验收：上线 24h 后能在 events 表看到 `btn_transcode_view / btn_download_all_view / btn_download_zip_view / row_download_view / row_retry_view` 这 5 个事件
- [ ] **auto-FLAC 完成率定位（埋点先行，不动核心代码）**
  - Layer A：心跳事件 `transcode_progress`（每 10% 一档），在 `src/App.tsx` 的 `onProgress` 回调里按 bucket 上报
  - Layer B：`main.tsx` 加 `unhandledrejection` + `pagehide` 监听，pagehide 时把 `status==='transcoding'` 的文件全部上报 `transcode_abandon`
  - 验收：跑一周后能看到 progress_0/50/90/done/abandon/unhandled 的分布，定位静默丢失发生在哪个阶段
  - **此 action 是 P1「移动端大文件软提示」和 P2「WASM 流式解码」的前置依赖**——没数据不动那两个
- [ ] **批量上限 50 → 200**
  - 改 `src/App.tsx` 中 `MAX_FILES` 常量；同时优化 reject 文案告诉用户"请分批上传"
  - 验收：QUEUE_FULL reject 占比应从 77% 降到 <30%

- [ ] **埋点上线流程优化（防止"曝光埋点没自测就上线"重演）**

  根因：上次 bug 跑了 3 天没人发现，是因为 3 道门全失守——① dev 期没自测；② spec 文档没说"怎么验证事件真的发了"；③ 后台 0 上报的事件不醒目。三道一起补：

  - [ ] **a. dev mode 控制台 logger**（30 分钟）
    - 在 [src/lib/analytics.ts](src/lib/analytics.ts) 里：判断 `import.meta.env.DEV`，是开发环境时，每次 `track()` / `trackFailure()` 都额外 `console.log('[analytics]', event, props)`
    - 效果：本地点一遍新功能，F12 控制台肉眼可见每个事件是否真发出去
    - 不影响生产环境（vite 构建时会把 dev 分支整段删掉）

  - [ ] **b. ANALYTICS_SPEC.md 加上线 checklist**（10 分钟）
    - 在 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) 末尾加一节：
      > ## 新功能上线 checklist
      > - [ ] 本地 dev 跑通新功能路径
      > - [ ] 浏览器控制台 `[analytics]` 前缀的 log 里，每个新事件都打印了至少一次
      > - [ ] spec 事件全表已新增对应行（含中文描述）
    - 每次 PR 描述里勾一遍

  - [ ] **c. 运营后台「事件健康度」看板**（半天）
    - admin/src/pages/Buttons.tsx 加一个新 section
    - 数据源：admin/src/lib/ 里写死 ANALYTICS_SPEC 声明事件白名单
    - 展示：每个事件最近 24h 上报量，**0 上报标红 + 顶部数字气泡**
    - 效果：发版第二天打开后台一眼看见哪个事件挂了

  验收：下次新增按钮，三道门里至少 a + b 跑过，spec 上勾完才合 PR

#### 📊 P1 — 下个迭代

- [ ] **酷狗 KGM v4 支持**：4 个用户、20 次失败的真实信号，入口 `src/lib/kgm.ts` + `scripts/build-kgm-mask.ts`
- [ ] **移动端 >100MB FLAC 软提示**：上传前红条"建议在电脑端处理"，避免 Safari OOM 静默崩。**前置：P0 #2 数据出来确认 OOM 是主因**
- [ ] **来源埋点（referer + utm）**：定位流量爆发的渠道，入口 `src/lib/analytics.ts` 初始化处

#### 💡 P2 — 视情况

- [ ] **WASM FLAC 流式解码**：彻底解决移动端 OOM，工程量大。**前置：P0 #2 + P1 软提示数据**
- [ ] **重试按钮去掉**：3 个用户用 12 次，不是核心路径
- [ ] **运营后台权限分级**：当前单管理员，未来加合作者再做

### 下次复盘要重新看的指标

| 指标 | 当前基线 | 期望区间 |
|---|---|---|
| auto-FLAC 完成率（done / start） | 31% | >70%（修了或定位清楚） |
| 曝光 CTR 数据完整性（5 个 view 事件） | 0 上报 | 全部有数据 |
| QUEUE_FULL reject 占比 | 77% | <30% |
| KGM_V4_UNSUPPORTED 复发 | 20 次 / 4 UV | 0（如做了 v4 支持） |
| 重度用户（100+ events）数 | 35 人 | 持续观察增长 |
| 移动端转化率（拆出来看） | 未拆 | 下次拆出来 |

> **注**：本节当时随 commit `3a38d96` 写出，但该 PR 始终未合并到 main，原文从该 commit 还原追加进本日志。复盘 #1 列出的 P0 部分（曝光埋点、transcode 心跳、批量上限改造、spec checklist）实际在 v0.4.x → v0.5.x 期间已通过其他 PR 落地；P0 #4a 的 dev logger 和 P0 #4c 的健康度看板未跟上，搬入复盘 #2。

---

## 复盘 #2 — v0.5 → v0.6 收官（2026-05-26）

### 数据快照

- **窗口**：2026-05-12 → 2026-05-26（自上次复盘后 15 天）
- **总量**：events 240,885 / failures（窗口内）2,195 / visitors 1,040 / sessions 1,545
- **设备 UV**：Desktop 722（69%） / Android 236（23%） / iOS 86（8%） / Other 22
- **当日 UV 峰值**：05-25 → 126（vs 上次 05-11 → 115）；日均 69 UV（vs 上次 3 天均 70 UV）
- **重度用户**（≥100 events）：275 人（vs 上次 35，7.9× 与 UV 同比例增长）
- **转化漏斗（UV 口径）**：UV 1040 → upload_attempt 705（68%）→ decrypt_done 651 → download_done 677

### 关键变化（vs 复盘 #1 基线）

| 指标 | 基线 #1 | 现在 #2 | 评 |
|---|---|---|---|
| auto-FLAC transcode 完成率 | 31%（140/452） | **74%**（6733/9058） | ✅ 翻倍 |
| 5 个曝光 view 事件上报 | 0 上报 | 全部 ≥355 次 | ✅ 完成 |
| QUEUE_FULL reject 占比 | 77%（598/780） | **0.6%**（69/11628） | ✅ 解决 |
| 单日 UV 峰值 | 115 | 126 | ↑10% |
| 重度用户数 | 35 | 275 | 7.9× |

### 上次 Action 回顾

#### ✅ 完成

- [x] **P0 #1 修复曝光埋点 `useImpression`**（v0.4.x 期间随其他 PR 落地）
  - 验证：8 个 row 内 view 事件全部 ≥355 上报（row_download_view 1197 / row_remove_view 1206 / btn_clear_all_view 1180 / upload_zone_view 1756 / btn_download_all_view 714 / btn_download_zip_view 714 / btn_transcode_view 355 / dialog_large_batch_view 394）

- [x] **P0 #2 transcode 心跳 + abandon 埋点**（v0.4.x 期间）
  - 验证：transcode_progress 28,895 次 5 个分桶分布健康（0.1→7049 / 0.3→6470 / 0.5→5536 / 0.7→5033 / 0.9→4807）；transcode_abandon 3082 次
  - **遗留**：abandon 事件 props 里 `last_progress_bucket` 字段全 null（上次 [src/App.tsx:898](src/App.tsx:898) 注释写"含最近一次 progress"但未真正回填），导致到现在还不知道用户在哪个 bucket 离开 → 搬入本次 P0 #b

- [x] **P0 #3 批量上限 50→200**（v0.5.0 走得更激进：直接取消硬上限，改成 ≥50 弹"大批量警告"软弹窗 [src/components/v050.tsx](src/components/v050.tsx)）
  - 验证：QUEUE_FULL 从 77% 降到 0.6%；但新增了 LARGE_BATCH_DISMISSED reject reason（8971 次 / 72 UV，占新 reject 总量 77%）
  - **副作用待评估**：是软弹窗劝退了用户，还是只是 v0.5.2 修 anomaly 时补发 reject 的统计 artifact → 搬入本次 P0 #d

- [x] **P0 #4b ANALYTICS_SPEC 上线 checklist**（已存在 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md) §6）

#### ❌ 未完成 / 拖延

- [ ] **P0 #4a analytics dev mode console logger**
  - 当时实现的 commit `3a38d96` 整段从未合并到 main（只在临时分支 `claude/objective-wiles-c2e58d`）
  - 后果：本期 3 处缺字段 bug 都是同类问题：① transcode_abandon 丢 last_progress_bucket ② decrypt_abandon 全部 source=null（454 次） ③ QQ guide 事件埋了但字段没核对 → 上线没人肉眼自测
  - 搬入本次 P0 #a

- [ ] **P0 #4c 后台「事件健康度」看板**
  - 本期运营后台精力转向「解密分析」+「访客」两个新页面（admin/src/pages/DecryptAnalysis.tsx / Visitors.tsx），健康度看板没排上
  - 现状仍然只能 SSH 进服务器 SQL 才能发现哪个事件丢字段
  - 降级搬入本次 P1（dev logger 上线后优先级自然下降）

- [ ] **P1 来源埋点（referer + utm）** —— 没做，搬入本次 P1
- [ ] **P1 酷狗 KGM v4 支持** —— 没做；本期 KGM_V4_UNSUPPORTED 失败从 20 次 / 4 UV 涨到 **317 次 / 16 UV**，需求信号变强，搬入本次 P1
- [ ] **P1 移动端大 FLAC 软提示** —— transcode 完成率从 31% 升到 74%，问题大幅缓解；先观察，留 P2

### 三个新负向信号

1. 🔴 **iOS 用户漏斗几乎完全断**：iOS 86 UV → upload_attempt 仅 **2 UV** → decrypt_done **0 UV**（vs Android 236 → 143 → 136，转化率 58%；vs Desktop 722 → 562 → 517，转化率 72%）
   - iOS 占 8% UV，贡献率 ≈ 0
   - 可能原因：① Safari iOS 文件 picker 因 accept attr 拦截了 .ncm/.kgm/.mflac 等无标准 MIME 的后缀 ② 拖拽区在 iOS 不可用且文件入口不显眼 ③ 埋点本身在 iOS Safari 下挂了（pageview 能上但 upload_attempt 上不去）
   - 必须先排查埋点是否丢失再下产品结论

2. 🔴 **QQ 解密（v0.6.0 主力功能）上线一周量极低**：decrypt_done 仅 34 次 / transcode_done 9 次
   - 同期 NCM 32,019 次 / KGM 905 次；QQ 占比 0.1%
   - 引导入口转化：support_matrix_entry view 134 → click 6（5% UV CTR）；qq_guide_entry view 131 → click 19（9% UV CTR）；qq_download_click 8 次
   - 评估方向：①入口位置 / 视觉是否被忽略 ②v19.51 旧版门槛劝退 ③用户根本不知道拾音支持

3. 🟡 **transcode_abandon 比例仍 34%**（3082 abandon / 9058 start）
   - 没有改善（基线 ≈30%）
   - 因为 abandon 的 `last_progress_bucket` 字段全 null，**到现在还不知道用户在哪段离开**
   - 修这个字段是后续定位的强前置依赖（搬入 P0 #b）

### 本次新增 Action Items

#### 🔥 P0 — 这周内

- [ ] **a. analytics dev mode console logger 重新落地到 main**
  - 直接把 commit `3a38d96` 里 [src/lib/analytics.ts](src/lib/analytics.ts) 那 12 行 dev log diff cherry-pick / 重写
  - 入口：`track()` / `trackFailure()` 函数末尾，`import.meta.env.DEV` 分支
  - 验收：dev 跑主站，控制台肉眼看到每条事件
  - **拖了一次，这次必须先做**

- [ ] **b. 修 transcode_abandon / decrypt_abandon 字段（搬自上次 #2 遗留）**
  - 入口：[src/App.tsx:898](src/App.tsx:898) `pagehide` 监听里，把 inflightMap 里的 `lastBucket / lastProgress / source` 全拼进 props
  - 验收：明天数据库里 `json_extract(props,'$.last_progress_bucket')` 有值；transcode_abandon 按 bucket 能看到分布
  - 顺手修 decrypt_abandon 的 source 字段（454 次全 null）

- [ ] **c. iOS Safari 漏斗断流定位**
  - 步骤 1：用户在真机或 UTM iOS 模拟器跑一遍，看 upload_attempt 能不能上报（先证伪埋点问题）
  - 步骤 2：若埋点 OK，看 `<input accept>` 是否拦了 .ncm/.kgm/.mflac 等无 MIME 后缀
  - 步骤 3：DropZone 在 iOS 移动端是否可见 + 可点
  - 入口：[src/App.tsx](src/App.tsx) `<input accept>` + DropZone 移动端样式 + [src/lib/analytics.ts](src/lib/analytics.ts) iOS Safari beacon 兼容
  - 验收：iOS 漏斗每段流失能拆开，定位卡点

- [ ] **d. LARGE_BATCH 软弹窗效果澄清**
  - 矛盾：dialog_large_batch_view 394 = dialog_large_batch_confirm 394（confirm 100%），但 LARGE_BATCH_DISMISSED reject 有 8971 个 / 72 UV
  - 怀疑：[CHANGELOG v0.5.2](CHANGELOG.md) 修 anomaly 时把"用户点重选 / ESC"路径补发 reject 的逻辑，可能在没弹窗的场景也意外触发了
  - 验收：查清这 8971 reject 是真劝退还是统计 artifact；如果是劝退，要评估软弹窗是否反而比硬上限更劝退

#### 📊 P1 — 下个迭代

- [ ] **QQ 解密引导转化优化**（QQ 解密只跑了 34 次，是 v0.6.0 上线最大遗憾）
  - 方向：①拖拽区 helper 文案常态化 mention「QQ 音乐」；②首屏视觉加 QQ logo 三件套；③看 qq_guide_view → qq_download_click 详细 funnel
  - 评估窗口：再观察 1 周，若仍 <100 次需要考虑 v0.6.0 战略调整

- [ ] **酷狗 KGM v4 支持评估**（KGM_V4 失败 317 次 / 16 UV，比上次 4 UV 涨 4×）
  - 工程量：联网密钥协议需后端代理，工程量大；先评估能否离线 mock

- [ ] **来源 / referer / utm 埋点**（搬自上次 P1，仍未做）
  - 现在日均 100 UV，必须知道流量来源才能定位增长杠杆
  - 入口：[src/lib/analytics.ts](src/lib/analytics.ts) 初始化处

- [ ] **后台事件健康度看板**（从上次 P0 #4c 降级搬来）
  - dev logger 上线后是兜底；admin 已经有逐事件 CTR 表能间接 spot-check

#### 💡 P2 — 视情况

- [ ] **transcode WASM 流式解码**（搬自上次 P2）—— 等 P0 #b abandon 字段修了之后看 bucket 分布判断是否值得
- [ ] **QQ 新版 STag 长期方案** —— 仍无路径；等社区/官方有离线 ekey 通道
- [ ] **重试按钮去掉**（搬自 #1，至今几乎无人用）

### 下次复盘要重新看的指标

| 指标 | 当前基线 #2 | 期望区间 |
|---|---|---|
| transcode_abandon 的 last_progress_bucket 字段完整性 | 0%（全 null） | 100% 带字段 |
| iOS 漏斗 upload_attempt UV / iOS UV | 2/86 = 2.3% | >50%，否则定位清楚卡点 |
| QQ 解密 decrypt_done 总量 | 34 | >200，否则评估 v0.6 战略 |
| LARGE_BATCH_DISMISSED 占 reject 总量 | 77%（8971/11628） | <30%，或证明非劝退 |
| KGM_V4_UNSUPPORTED UV | 16 | 若做 v4 支持归零 |
| analytics dev logger 落地到 main | ❌ | ✅ |
| 重度用户增长率 | 35 → 275（15 天） | 持续观察 |
| 流量来源拆分 | 未拆 | 拆出 utm / referer 分布 |

---

## 复盘 #3 — v0.6.3 封面与标签补齐（2026-05-28）

> 本节是**小补丁版本**复盘——v0.6.2 → v0.6.3 仅相隔 1 天，无数据窗口可对比；价值主要在工程化教训。下次大版本（v0.7）收官时仍按完整模板写。

### 本期范围

| 路径 | 修复 |
|---|---|
| FLAC / OGG 直传转 MP3 | 转码前 `readMetaFromBlob` parse 原文件 VORBIS_COMMENT + METADATA_BLOCK_PICTURE，转码后 `writeId3ToMp3` 写入产物 MP3 的 ID3v2 |
| NCM → FLAC | 新增 `writeFlacMeta`：剔除原 type=4/6 → 注入新 VORBIS_COMMENT + PICTURE block → 修 last-flag → 拼回 audio frames |
| KGM / VPR / QMC | 解密产物里 `readMetaFromBlob` 读 ID3 APIC / FLAC PICTURE 填到 `result.cover`，UI 列表能预览；**不重写文件本身**（原标签已完整）|
| 新增模块 | [src/lib/metadata/](src/lib/metadata/)：id3 / flac / ogg 三个子模块 + index 门面，零新依赖，~680 行 |
| 埋点 | `transcode_done` / `decrypt_done` 加 `has_cover` 字段（白名单 + ANALYTICS_SPEC.md 同步） |

### 上次 Action 回顾（#2 P0/P1 复查）

不在本期范围，下次大版本（v0.7）收官时统一复查。

### 工程化教训（本期主要产出）

1. **🔴 dev server 端口冲突静默失败，浏览器跑旧代码 20+ 分钟无人察觉**
   - 现象：用户主仓库已有 vite 跑在 5173；worktree 起 `npm run dev` 时 vite 自动找下一个空闲端口（5174/5175），但 npm 进程在后台没人看输出；用户浏览器访问的还是 `localhost:5173`（主仓 v0.6.2 旧代码），导致连续测试 3 个 mp3 都说"没封面"，Console 永远没新日志
   - 根因：① 没主动 echo dev server 实际端口；② plan 里说"给本地测试链接"但没强调"确认端口"
   - 教训：**后台启 dev server 时必须 sleep + 读 output 拿到 vite 报告的 Local 行**，把准确端口告知用户；如果发现自动跳号要主动通知

2. **🟡 feat PR 漏 bump `package.json` 版本号，需要补 chore PR + 重建 tag**
   - 现象：PR #28 merge 后 main 还是 0.6.2；CLAUDE.md 已经写 v0.6.3；package.json version 不一致；不得不开 PR #29 补 bump；v0.6.3 tag 一度指向漏 bump 的 commit，需要 force-move（还被 auto-classifier 拦了一次）
   - 教训：**版本号 bump 应在 feat PR 内一并完成**——下次写 commit 流程 checklist 要加进去

3. **🟡 诊断日志用 `console.debug` 被 Chrome devtools 默认级别过滤**
   - 现象：第一次加 ncm 解密的诊断日志用了 `console.debug`，Chrome devtools 默认级别（Default levels）不含 Verbose，用户截图 Console 完全没看到，浪费一轮排查
   - 教训：**临时排查诊断日志一律用 `console.log` 或 `console.warn`**；用户能直接看到不需要切级别。`debug` 只适合永驻代码里的细粒度跟踪

4. **🟢 平台数据特性差异未在 plan 阶段预判**
   - 现象：plan 假设所有解密产物都内嵌封面，但实测 QQ 音乐 .mflac 原文件**普遍无 PICTURE block**（QQ 客户端封面靠在线 API 查 song_id，跟文件无关）；导致用户测 QQ 路径时一度怀疑是 bug
   - 教训：**新功能涉及多平台时，plan 阶段就要预先字节级抽样**至少 1 个真实文件，预判数据分布；不是开发完才让用户发现"原来 QQ 是这样"。本期实际只花了 5 分钟用 `tail -c 32 + xxd` 就字节级证伪了，应该提前

5. **🟢 worktree merge 流程的 `gh pr merge` 卡 main 占用问题**
   - 现象：`gh pr merge` 想本地 checkout main 来 sync，但主仓库 worktree 已经占用 main，报 `'main' is already used by worktree`
   - 解法：改用 `gh api -X PUT /repos/.../pulls/{N}/merge -f merge_method=squash` + `gh api -X DELETE /repos/.../git/refs/heads/{branch}` 远端纯 API 走，无需本地 checkout
   - 教训：**worktree 模式下 merge 一律走 gh api**，不走 `gh pr merge`；记下这个 pattern 给未来 Claude

### 本次新增 Action Items

#### 🚨 P0 — 流程修正

- [ ] **a. `npm run dev` 后台启动后必须主动拿到准确端口并告知用户**
  - 当前后台启动后只 `sleep 3` 然后 cat output 一次，如果 vite 因端口冲突跳号要明确读出来
  - 入口：以后任何 worktree `npm run dev` 后必走 `sleep + cat + grep Local` 提取 URL 再告知用户
  - 验收：下次起 dev 时给用户的 URL 一定是真实在跑的那个

- [ ] **b. commit 流程 checklist 加 "bump package.json"**
  - 当前 commit 流程只在 CLAUDE.md「已完成」一节写新版本号；package.json 漏改没人 catch
  - 入口：CLAUDE.md「给 Claude 的工作指引」加一条 + 本次 retrospective 自我备忘
  - 验收：v0.6.4 PR 不再出现 bump 漏改

#### 📊 P1 — 下个迭代

- [ ] **新功能涉及多平台时 plan 阶段必须抽样真实文件做字节级预判**
  - 模板：`tail -c 32 <file> | xxd` + `head -c 1MB <file> | xxd | grep -iE "ID3|TIT2|APIC|JFIF|fLaC|OggS"`
  - 收益：避免「开发完才发现平台没这数据」的返工

- [ ] **观察 7 天 `has_cover` 字段分布，回填 plan 的期望验证**
  - NCM-MP3 / NCM-FLAC 期望 ≈ 100%
  - KGM/VPR/QMC ≥ 70%
  - FLAC/OGG 直传 ≥ 60%
  - 若 NCM-FLAC < 100%（writeFlacMeta 失败兜底走了），要 SQL 拉 fail 样本看

- [ ] **FLAC writer 兼容性观察**
  - 本期 `writeFlacMeta` 是手写的，width/height/depth/colors 全填 0（规范允许）；万一 foobar2000 / iTunes / Apple Music 某个版本不接受要回来收
  - 评估窗口：用户反馈或自己定期抽样

#### 💡 P2 — 视情况

- [ ] **诊断日志规范**：是否在 `src/lib/analytics.ts` 同款抽一个 `diag(label, data)` helper，统一用 `console.log` 输出 `[label]` 前缀，避免每次手写

### 下次复盘要重新看的指标（累加到 #2 表）

| 指标 | 当前基线 #3 | 期望区间 |
|---|---|---|
| `decrypt_done.has_cover` 按 source 分桶（ncm/kgm/vpr/qmc）| 上线初无数据 | 见 P1 上面期望 |
| `transcode_done.has_cover`（source 为空 = FLAC/OGG 直传）| 上线初无数据 | ≥ 60% |
| NCM-FLAC writeFlacMeta 兼容率（无外部反馈）| 上线初 100% 假设 | 用户 0 反馈即认为成功 |

---

## 复盘 #4 — 运营后台 v0.4.8 「主动取消」独立成态（2026-05-29）

> 又是**运营后台单独迭代**复盘（admin v0.4.7 → v0.4.8 + 配套 api v0.4.5 → v0.4.6）。主站零改动。

### 本期范围

| 文件 | 改动 |
|---|---|
| `server/src/routes/adminStats.ts` | `/overview` 加 `dismissed_files` / `confirmed_upload_files`；`upload_reject` 改"狭义被拒"（剔除 LARGE_BATCH_DISMISSED）；`/funnel` file 维度 3 层 → 4 层 |
| `server/src/routes/adminUploads.ts` | status 枚举 `rejected_large_batch` → `user_dismissed`；timeseries 字段同步重命名，`reject_total` 与 adminStats 口径自洽 |
| `admin/src/pages/Overview.tsx` | 新「确认上传数」蓝色卡片 + 6 段拆解扩 7 段 + 失败卡片 tooltip 更新 + 漏斗文案 |
| `admin/src/lib/format.ts` | Tag `'被拒-大批量取消'`(红) → `'主动取消'`(gold)；筛选下拉独立选项 |
| `admin/src/pages/decrypt-analysis/uploads/UploadsTrendChart.tsx` | metric rename + 占比分母改 `upload_files`，三类加起来 = 100% |

### 上次 Action 回顾（#3 P0/P1）

#### #3 P0-a ✅ 部分完成
- **`npm run dev` 后台启动后必须主动拿到准确端口并告知用户** —— 本期一开始就栽了同款坑：tsx-watch 后台进程在切 turn 之间被 SIGTERM 掉，加上 IPv4/IPv6 双协议栈在 5174 端口上各自有独立 listener（我抢到 IPv6 `[::1]:5174`，另一个 worktree 占着 IPv4 `127.0.0.1:5174`），用户浏览器走 IPv4 → 打开的是另一个 worktree 的旧 admin → proxy 到旧 server → 看到全是 v0.6.3 旧字段。**给 URL 时只验证了 status 200，没验证从该 URL 拉的 API 响应里有没有 v0.4.8 新字段，是教训**
- 新增工程化产出：①后台 dev 进程要 `nohup ... & disown` 而不是单纯 `run_in_background=true`，否则 ssh/turn 切换会杀掉父进程；②给用户的 URL 用 IP 不用 `localhost`，避免 IPv4/IPv6 串台；③下发链接前必须 curl 一遍 API 端点确认返回了新字段，再发给用户

#### #3 P0-b ✅ 完成
- **commit 流程 checklist 加 "bump package.json"** —— 本期 admin v0.4.7 → v0.4.8、server v0.4.5 → v0.4.6 都在 feat PR 内一并 bump，没漏

#### #3 P1 has_cover ⏸ 待续
- 本期发布到 2026-05-29，距 v0.6.3 发布（2026-05-28）才 1 天，has_cover 数据窗口太短，下次复盘（v0.7 或下一个相关 patch）再看

### 工程化教训（本期主要产出）

1. **🔴 多 worktree 并行 + IPv4/IPv6 双栈 = 同端口可同时双绑，浏览器选哪个看运气**
   - 现象：上面 #3 P0-a 回顾里说的——我的 admin "成功" 绑到 `[::1]:5174`，但用户浏览器走 `127.0.0.1:5174` 去到了另一个 worktree。表象是"我说服务起好了，用户说打不开"
   - 教训沉淀：**多 worktree 跑 dev 时，admin 用 `--strictPort --port 5176` (或别的远离 5174 的端口) + `--host 127.0.0.1` 锁 IPv4**；不要靠 vite 自动跳号。本期沉淀到 admin/vite.config.ts 加了 `ADMIN_API_PORT` 环境变量 fallback，但 5174 端口本身的冲突还是要手动指定 `--port 5176`

2. **🔴 下发 dev 链接前必须验证 API 响应携带新字段，不只是 200 OK**
   - 现象：上面 #3 P0-a 回顾里说的——HTTP 200 不等于"打开的是我的版本"。两个 worktree 都能返回 200
   - 沉淀到下次工作 pattern：**给用户 localhost 链接前，固定先跑 `curl <api-endpoint> | grep <new-field>` 三五个新字段**，确认全部命中再发链接

3. **🟢 纯查询层 SQL 重新归类 = 历史数据无痛刷回，比改 schema 划算太多**
   - 本期所有口径变化（剔除主动取消、新增 confirmed、漏斗加层）全是 SQL 现算，DB 完全没动；用户问"历史数据能不能刷回来"时一句话就能答"自动重算"
   - 沉淀：**未来运营后台所有"重新分类"需求，先想能不能 SQL 现算解决，能就别动 schema**；这与"events 表只存原始事件流"的早期架构决策强相关

4. **🟢 status enum rename 是安全的低代价操作（前提：内部 API、无外部消费者）**
   - 本期 `rejected_large_batch` → `user_dismissed` 涉及 7 个文件改动一致；TS 类型系统 + grep 一次确认无残留，merge 后 0 回滚
   - 沉淀：**内部 admin API 的 enum value 不必"保留兼容"**，rename 比贴 label 更能让代码可读

### 本次新增 Action Items

#### 🚨 P0 — 流程修正

- [ ] **多 worktree dev 进程隔离 SOP**：
  - admin 起 `npx vite --port 5176 --strictPort --host 127.0.0.1`（远离 5174 的固定端口 + 锁 IPv4）
  - server 用独立 PORT（.env 里 sed 8788）+ admin 配 `ADMIN_API_PORT=8788`
  - 启动后必须 `lsof -nP -iTCP -sTCP:LISTEN | grep '<port>'` 确认只有我自己一个监听
  - 下发链接前 curl + grep 新字段三件套

- [ ] **dev 进程长生存**：`nohup ... & disown` 替代 `run_in_background=true`，否则 turn 切换可能被杀

#### 📊 P1 — 下个迭代

- [ ] **发布后 7 天观察「主动取消占比」**：
  - 件维度漏斗「上传总数 → 确认上传」流失率 = 主动取消占比
  - 正常区间 0–15%；长期 >25% 说明 50 文件阈值或弹窗文案需重设计
  - 剔除主动取消后的「确认上传 → 转换成功」应稳定 >85%

- [ ] **发布后 30 天再评估**：若主动取消长期低位（<5%）说明 50 文件警告本身收益不大，可考虑调阈值（试 80 或 100）

#### 💡 P2 — 视情况

- [ ] **6 段→7 段拆解小字在窄屏会溢出**：当前 `whiteSpace: nowrap` + `textOverflow: ellipsis`，7 段在 1280px 以下宽度可能展不全。等用户反馈再看是否需要换行展示或抽个独立 row

- [ ] **趋势图勾选状态文案 "已选 X / 10 项" 不准**：实际 12 个 metric（含本期新增），但卡片头还显示 / 10。是历史残留，可顺手修

### 下次复盘要重新看的指标（累加到 #3 表）

| 指标 | 当前基线 #4 | 期望区间 |
|---|---|---|
| 件维度漏斗「上传总数 → 确认上传」流失率 | 上线即看（约等于 LARGE_BATCH_DISMISSED 占比，发布前小样本测试集 60/75 = 80% 是异常值，真实分布预计 0-15%） | 0–15%；>25% 触发"50 阈值"专项 |
| 件维度漏斗「确认上传 → 转换成功」转化率 | 老口径"上传 → 转换成功" 历史值（v0.4.7 之前查询） | 应高于老值（提升幅度 ≈ 主动取消占比） |
| 「上传失败（件）」卡片绝对值变化 | 应一夜之间下降（剔除掉的主动取消件数） | 自然结果，无需观察 |

---

<!-- 下次复盘从这里追加，模板参考 #1 / #2 -->
