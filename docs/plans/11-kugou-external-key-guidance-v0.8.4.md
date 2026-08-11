# v0.8.4 酷狗外部 Key 失败引导计划

## 一、目标与边界

1. 对文件自身不含可用 Key 的酷狗新版加密格式给出可执行的失败引导：请在电脑客户端重新下载后再上传。
2. 引导只放在现有失败行，不新增弹窗、入口或异步流程。
3. 不宣称“手机端全部不可解”或“电脑端一定可解”；当前只改善失败后的下一步，不实现外部 Key 获取。
4. API、数据库和事件名不变；后台只同步既有错误码的中文标签。

## 二、改动点

1. `src/App.tsx`
   - 统一 KGG / 新版酷狗的直接拦截文案。
   - 失败文案由单行截断改为完整换行。
   - `KGM_V4_UNSUPPORTED` 和 `QMC_NEW_VERSION_UNSUPPORTED` 隐藏无效重试。
   - 双重后缀优先识别酷狗容器，`.kgg.flac` 显示 `KGG`。
2. `src/lib/kgm.ts`
   - 解密产物 magic 校验失败的同类分支使用同一引导文案。
3. `src/components/support-matrix.tsx`、`index.html`
   - 支持矩阵与首页静态说明同步“密钥内置版本 / 电脑客户端重下”口径。
4. `admin/src/lib/format.ts`
   - `KGM_V4_UNSUPPORTED` 展示为“酷狗新版加密（需外部密钥）”。
5. `docs/ANALYTICS_SPEC.md` 与项目说明
   - 记录外部 Key 失败不显示重试；同步当前边界和长期方案。

## 三、验证

- [x] 主站构建通过。
- [x] 运营后台构建通过。
- [x] XM/文件分发专项：11 通过，1 个私有黄金样本跳过，0 失败。
- [x] 1280×720 模拟 `.kgg.flac`：完整文案、KGG 徽章、无重试、无横向溢出。
- [x] 390×667 模拟 `.kgg.flac`：文案三行完整显示、无横向溢出。
- [x] 项目主完成本地验证并明确授权上线。

## 四、发布与观测

1. 主站升至 v0.8.4，运营后台升至 v0.4.17，API 保持 v0.4.9。
2. 合并到 `main` 后只允许 user/admin job 部署，server job 必须 skipped；不推通用 `v*` 标签。
3. 部署完成后核对两端 `.deploy-manifest.json` 的版本、commit、文件数量与全量 SHA-256。
4. 24 小时与 7 天观察 `row_retry_view/click`：`KGM_V4_UNSUPPORTED` / `QMC_NEW_VERSION_UNSUPPORTED` 应归零；对应 `decrypt_fail` 仍可存在，因为功能没有宣称能解外部 Key 文件。
5. 7 天内观察同类用户反馈是否从“工具不支持”转为可执行的电脑端重下路径。
