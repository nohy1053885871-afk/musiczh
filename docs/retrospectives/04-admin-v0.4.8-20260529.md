# 复盘 #4 — 运营后台 v0.4.8 「主动取消」独立成态（2026-05-29）

> ↩ 复盘索引：[README](README.md)

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

5. **🔴🔴 GitHub Actions 后端永远不自动部署，PR merge 后必须 `gh workflow run --target=server`，否则后端代码躺在仓库里没上线**（本期 2026-05-31 用户发现「确认上传数」一直 0 才暴露）
   - 现象：PR #31 merge 后我以为"上线完成"，admin/dist 通过 push 自动部署生效；但 server 部分 [deploy.yml:163](../../.github/workflows/deploy.yml) 条件是 `workflow_dispatch || refs/tags/v*`，**push 触发不会跑 deploy-server**——这是 v0.6.3 加的"防 502 整站挂"硬规则（DEPLOY.md §7.1 明确写过）
   - 后果：用户上线后 2 天才发现「确认上传数」=0、「主动取消」=0；前端 fallback `?? 0` 把"字段缺失"伪装成了"零数据"，没人意识到 API 还在跑老版本；用户 F12 看 Network 才把这个查出来
   - 我的失职：上一轮 v0.6.3 主站发布没改 server，我直接套用了"merge 就完事"的肌肉记忆，没意识到这次 server 也改了。打 tag 用的还是 `admin-v0.4.8` 不是 `v*` 格式，也不会触发 server deploy
   - 教训沉淀：**只要 git diff 命中 `server/**`，merge 完必须立刻 `gh workflow run deploy.yml --ref main -f target=server` 并 `gh run watch` 看 success；"上线完成"的定义是 GitHub Actions runs 里 deploy-server = success，不是 PR merge 状态**
   - 二次防御：以后给用户的"上线完成"summary 必须附带 GitHub Actions run URL（至少 deploy-admin / deploy-server 各一条），便于用户复核
   - **复盘 #3 P0-a 说"下发链接前 curl + grep 新字段"，这条规则同样适用于上线后**：用户报告之前我自己也该 `curl https://sleepno.cn/api/admin/stats/overview` 抽样一遍新字段，提前 24 小时就能暴露
   - 关联补救：本期 server deploy 已于 2026-05-31 11:52 UTC 手动 dispatch 完成（run 26711858028），确诊为后端代码确实没在 PR merge 时上线

### 本次新增 Action Items

#### 🚨 P0 — 流程修正

- [ ] **多 worktree dev 进程隔离 SOP**：
  - admin 起 `npx vite --port 5176 --strictPort --host 127.0.0.1`（远离 5174 的固定端口 + 锁 IPv4）
  - server 用独立 PORT（.env 里 sed 8788）+ admin 配 `ADMIN_API_PORT=8788`
  - 启动后必须 `lsof -nP -iTCP -sTCP:LISTEN | grep '<port>'` 确认只有我自己一个监听
  - 下发链接前 curl + grep 新字段三件套

- [ ] **dev 进程长生存**：`nohup ... & disown` 替代 `run_in_background=true`，否则 turn 切换可能被杀

- [ ] **🚨🚨 发版上线 checklist（防 server 漏部署重演）**：
  1. PR merge 后立即跑 `gh run list --workflow=deploy.yml --limit 1 --json jobs --jq '.[].jobs[] | {name, conclusion}'` 看哪些 job 跑了，哪些 skipped
  2. 如果 `git diff main~1 main -- server/` 非空，但上一步显示 `部署后端 API: skipped`，**立刻** `gh workflow run deploy.yml --ref main -f target=server` 并 `gh run watch <id>` 看 success
  3. 上线"完成"的 summary 必须给用户：① deploy-user / admin / server 各自的 Actions run URL；② 一条线上 API 抽样 curl 输出，证明新字段在 production 返回（例：`curl -s https://sleepno.cn/api/health` 仅证明服务活着；改了 API 形状必须再 curl 一个真业务端点抽样新字段）
  4. 把这条 checklist 加进 [CLAUDE.md](../../CLAUDE.md) "给 Claude 的工作指引" 或 [DEPLOY.md](../../DEPLOY.md) §7.1 顶部

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
