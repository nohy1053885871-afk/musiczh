# 运营后台首页查询性能优化

> `shiyinmp3.com` 与 `sleepno.cn` 的运营后台共用同一 API 和 SQLite。下列生产示例优先
> 使用 Cloudflare 正式入口；从阿里云原站执行时只替换 Origin，数据源不变。架构边界见
> [ARCHITECTURE.md](ARCHITECTURE.md)。

## 架构与读取策略

首页统一调用 `GET /api/admin/stats/overview-bundle`，一次返回概览、漏斗、全部日趋势和设备组合数据。接口结果按规范化时间范围缓存 60 秒；相同缓存键的并发请求共用一次计算。`refresh=1` 跳过缓存并用成功结果更新缓存。

重查询只在独立 Worker Thread 中执行，Hono 主线程不直接运行首页 SQL。Worker 异常会令当前请求明确失败，并在下一次请求时自动重建，不影响 `/api/track` 的主线程写入。

汇总状态决定数据源：

- `building` / `disabled`：读取原始 `events`，返回 `data_source=raw`。
- `ready`：先追平增量事件，再读取日汇总、边界原始事件和文件终态表，返回 `data_source=rollup`。
- 汇总落后超过 60 秒、追平失败或汇总读取异常：自动执行原始查询，返回 `data_source=raw_fallback`。

完整自然日读取汇总表；首尾不完整日期读取原始事件。UV 会合并日级访客和边界访客后按 `visitor_id` 精确去重。设备口径是区间内访客最后一次有效上报的浏览器、系统和设备类型。

文件状态分两层保存：`overview_file_state` 维护每个 `file_id` 的最高优先级终态，`overview_file_upload_state` 为每条 `upload_attempt` 保存派生终态。后一层用于兼容重试或历史重复上报产生的重复 `file_id`，确保任意时间范围内的成功、失败、中止和未完成数量与旧接口逐条精确一致。

## 首次上线与历史回填

先备份生产 SQLite，再部署包含空汇总表的后端。新表通过 `IF NOT EXISTS` 创建，不在 API 启动阶段回填历史数据。后端部署后先验证原始数据 bundle：

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  "https://shiyinmp3.com/api/admin/stats/overview-bundle?range=90d&refresh=1"
```

低优先级执行可恢复回填：

```bash
cd /www/wwwroot/musiczh-api
npm run overview:backfill
```

若生产对账发现派生表口径需要从头重建，可只清空四类首页派生数据并把游标归零；原始 `events`、`failures` 和管理员数据不受影响：

```bash
npm run overview:backfill -- --reset
```

回填以启动时的最大 `events.id` 为快照上限，每批最多 10,000 行。汇总写入和游标推进在同一事务，进程中断后重跑会从游标继续。脚本会比较今日、7/30/90/365 天和两个自定义区间；首轮通过后追平一次新增尾部并再次完整对账，全部一致才把状态切为 `ready`，再对账期间产生的极小尾部由 30 秒增量任务接手。任何差异都维持 `building` 并返回非零退出码。

回填完成后再次请求 bundle，确认：

- `data_source` 为 `rollup`；
- `rollup_lag_ms` 不高于 60,000；
- 日志中的缓存、总耗时和各内部阶段耗时符合预期；
- 旧接口与 bundle 的所有整数指标一致。

## 回滚与故障处理

无需删除汇总表。立即停用汇总读取：

```bash
cd /www/wwwroot/musiczh-api
npm run overview:status -- disabled
```

恢复回填模式：

```bash
npm run overview:status -- building
npm run overview:backfill
```

只在已人工完成生产数据对账时才允许手工设置 `ready`：

```bash
npm run overview:status -- ready
```

Worker 崩溃或单次汇总查询失败不需要重启 API；下一次请求会自动重建 Worker。若持续出现 `raw_fallback`，先检查 `overview_rollup_state.last_error`、游标与 `events` 最大 id 的差距，再决定重跑回填或临时 `disabled`。

## 上线观测

两阶段上线后至少记录以下数据：

| 指标 | 期望 | 评估窗口 |
|---|---:|---|
| 90 天 bundle p95 | ≤ 1.5 秒 | 每阶段上线后 24 小时 |
| 首页完整可见 p95 | ≤ 2 秒 | 24 小时 |
| 缓存命中 p95 | ≤ 300ms | 24 小时 |
| 汇总延迟 p95 | ≤ 60 秒 | 7 天 |
| 长查询期间 `/api/track` p95 | ≤ 100ms | 压测及上线后 24 小时 |
| `raw_fallback` 数量 | 稳定 24 小时后为 0 | 7 天 |
| 新旧口径差异 | 0 | 切换 `ready` 前及上线后 7 天 |

旧的 `overview`、`funnel`、`timeseries` 和 `devices` 接口暂时保留，至少观察 7 天后再决定是否下线。
