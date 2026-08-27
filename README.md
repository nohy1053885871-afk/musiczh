# 拾音 · 加密音乐文件转 MP3

一个纯前端的音频转换工具——支持网易云 NCM、酷狗 KGM/VPR、QQ 音乐 QMCv2、
喜马拉雅 XM，以及原始 FLAC/OGG/M4A 转 MP3。
所有文件都在浏览器本地处理，不上传任何服务器。**永久免费，永无广告**。

🎵 Cloudflare 主站：[https://shiyinmp3.com](https://shiyinmp3.com) · 阿里云原站：[https://sleepno.cn](https://sleepno.cn)

> 项目背景与技术栈见 [CLAUDE.md](CLAUDE.md)。
> 生产双域名拓扑与共享边界见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。
> 数据埋点规范见 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md)。

---

## 主要特性

- **纯前端，零上传** — 容器解密、格式识别、标签写入和音频转码全部在浏览器内完成。
- **批量处理** — 单次最多 50 个文件，单文件 200MB 上限，支持 ZIP 打包下载。
- **保留元数据** — 自动写入 ID3 标签与专辑封面。
- **强制转 MP3** — FLAC / OGG / M4A 可用流式 WASM 解码与 LAME WASM 一键转码。
- **纯浏览器 Worker 管道** — 解密和转码计算不占用主线程，文件二进制不上传。

## 支持的格式

| 格式 | 来源 | 还原后 |
|---|---|---|
| `.ncm` | 网易云音乐客户端 | MP3 / FLAC |
| `.kgm` | 酷狗音乐客户端 | MP3 / FLAC |
| `.vpr` | 酷狗音乐 v2 | MP3 / FLAC |
| `.mflac` / `.mgg` / `.qmcflac` / `.qmcogg` | QQ 音乐 v19.51 旧版 Windows 客户端 | MP3 / FLAC / OGG |
| `.xm` | 喜马拉雅 v2 | M4A / MP3 |
| `.flac` / `.ogg` / `.m4a` | 原始音频 | MP3 |

---

## 仓库结构（三子项目，互相独立）

```
musiczh/
├── src/        ← 用户端（拾音主站，纯前端 React 19）
├── admin/      ← 运营后台前端（独立 vite 项目）
└── server/     ← 后端 API（Node.js + Hono + SQLite）
```

**解耦原则**：改任一子项目时，另外两个的 `dist` 不需要重新构建、上传。

## 技术栈

React 19 · TypeScript · Tailwind CSS 4 · Vite 8 · Web Worker · WebAssembly · Hono · better-sqlite3 · Cloudflare Workers/Tunnel

---

## 本地开发

```bash
# 用户端（埋点会发到 http://127.0.0.1:8787/api/track，由 vite proxy 转发）
npm install
npm run dev                  # http://localhost:5173

# 后端（首次需先复制 .env.example 为 .env，并填上 ADMIN_PASSWORD_HASH/JWT_SECRET）
npm --prefix server install
cp server/.env.example server/.env
npm run dev:server           # http://localhost:8787

# 运营后台前端
npm --prefix admin install
npm run dev:admin            # http://localhost:5174/admin/
```

生成 admin 初始密码 hash：

```bash
node -e 'console.log(require("bcryptjs").hashSync("你的密码", 10))'
# 把输出粘到 server/.env 的 ADMIN_PASSWORD_HASH
```

## 构建

```bash
npm run build           # 用户端 dist/
npm run build:admin     # 后台   admin/dist/
npm run build:server    # 后端   server/dist/（pm2 直接跑 tsx 也可，本地 build 通常不用）
npm run build:cloudflare # Cloudflare 用户端 + dist/admin/ + /api Worker
```

每个 build 命令仅触碰自己的子项目，**不会牵连其他**。

---

## 生产部署（Cloudflare + 阿里云 ECS）

`shiyinmp3.com` 的用户端与 `/admin/` 静态资源由 Cloudflare Workers Static Assets
承载；同域 `/api/*` 由 Worker 经 Cloudflare Tunnel 转发到阿里云本机 API。
`sleepno.cn` 继续使用 nginx 静态目录并直接反代同一 API。两边共用管理员账号、功能开关
和同一份 SQLite，但登录 Cookie、浏览器访客 ID、静态部署和接入层访问控制互相独立。
完整边界见 [生产架构](docs/ARCHITECTURE.md)。

### 服务器目录布局

| 路径 | 内容 |
|---|---|
| `/www/wwwroot/musiczh/` | 用户端 `dist/` 解压 |
| `/www/wwwroot/musiczh-admin/` | 运营后台 `admin/dist/` 解压 |
| `/www/wwwroot/musiczh-api/` | 后端代码与 `node_modules` |
| `/www/wwwroot/musiczh-db/analytics.db` | 两个域名共用的唯一生产 SQLite |

### 后端部署（首次）

```bash
# 在服务器
cd /www/wwwroot/musiczh-api
# 上传 server/ 整个目录的源码（不含 node_modules、.env、analytics.db）

npm install
cp .env.example .env && vim .env     # 填密码 hash + JWT_SECRET

# 启动
npm install -g pm2 tsx
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup                          # 让宝塔/系统开机自启 pm2
```

### 阿里云原站 nginx 配置（宝塔站点 → 配置文件）

生产 `sleepno.cn` 还包含动态 IP 访问控制、后台豁免、下载目录和 `noindex` 响应头，不能用
一个普通 `/api/` 反代片段覆盖。可复制模板见
[server/nginx/site-access.conf.example](server/nginx/site-access.conf.example)，应用与回滚步骤见
本地 `DEPLOY.md`。Cloudflare 入口不使用这份 nginx 配置。

### 用户端 / 后台前端部署

```bash
# 本地
npm run build         # 产物在 dist/
npm run build:admin   # 产物在 admin/dist/

# 把 dist/ 压成 zip 上传宝塔，解压到 /www/wwwroot/musiczh/
# 把 admin/dist/ 压成 zip 上传宝塔，解压到 /www/wwwroot/musiczh-admin/
```

### SQLite 每日备份

生产库位于 `/www/wwwroot/musiczh-db/analytics.db`。每天 04:00 运行在线备份、完整性校验、
gzip 与 manifest 流程，保留最近 7 份成功备份。禁止恢复旧的“直接复制数据库并按 30 天
轮换”脚本；可执行恢复步骤只记录在本地 `DEPLOY.md`。

### 数据保留

后端启动时会自动启动「365 天保留」cron（每日 03:00），删除超过 365 天的 `events` 与 `failures`。可通过 `RETENTION_DAYS` 环境变量调整。

---

## 运营后台

- 访问地址：`https://shiyinmp3.com/admin/`（Cloudflare）或 `https://sleepno.cn/admin`（阿里云原站）
- 登录账号：单管理员，初始用户名/密码由后端环境变量 seed
- 功能：
  - **概览**：PV/UV、人维度（上传 UV / 下载 UV）、件维度（上传文件总数、解密成功/失败、转码成功/失败）、PV/UV 趋势、漏斗、解密失败趋势
  - **按钮埋点**：每个按钮的曝光/点击 PV/UV，以及对应 CTR
  - **失败日志**：解密 / 转码失败列表 + 详情抽屉，提供「复制 JSON 给 Claude 排查」按钮
  - **配置中心**：首页指引开关与阿里云原站 IP 访问规则

---

## 路线图

- [x] 网易云 `.ncm`
- [x] 酷狗 `.kgm` / `.vpr` v2
- [x] FLAC / OGG 强制转 MP3
- [x] 数据埋点 + 运营后台
- [x] QQ 音乐 QMCv2 旧版文件
- [x] 喜马拉雅 `.xm` v2 与原始 M4A 转 MP3
- [ ] 酷我 `.kwm`
- [ ] 酷狗 KGG / 新版外部 Key 格式
- [ ] FLAC 文件 Vorbis Comments + PICTURE block 标签写入

---

## License & 合规

仅用于处理你**合法持有**的音乐文件。文件本体绝对不会上传到任何服务器；埋点只上报扩展名、大小、文件名（用于排查）、错误码 / 堆栈等元数据，不读取或上传文件二进制内容。详见 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md)。

MIT
