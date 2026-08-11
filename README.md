# 拾音 · 加密音乐文件转 MP3

一个纯前端的加密音乐解密工具——把 **网易云 `.ncm`**、**酷狗 `.kgm` / `.vpr`** 解密还原为 MP3 / FLAC / OGG。
所有文件都在浏览器本地处理，不上传任何服务器。**永久免费，永无广告**。

🎵 在线试用：[https://sleepno.cn](https://sleepno.cn)

> 项目背景与技术栈见 [CLAUDE.md](CLAUDE.md)。
> 数据埋点规范见 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md)。

---

## 主要特性

- **纯前端，零上传** — AES + RC4 解密、FLAC/OGG 转码全部在浏览器内完成。
- **批量处理** — 单次最多 50 个文件，单文件 100MB 上限，支持 ZIP 打包下载。
- **保留元数据** — 自动写入 ID3 标签与专辑封面。
- **强制转 MP3** — FLAC / OGG 可一键转码（基于浏览器原生 AudioContext + lamejs）。
- **暗色拟物 UI** — 黑胶唱片旋转动画 + 中性灰拾物风格。

## 支持的格式

| 格式 | 来源 | 还原后 |
|---|---|---|
| `.ncm` | 网易云音乐客户端 | MP3 / FLAC |
| `.kgm` | 酷狗音乐客户端 | MP3 / FLAC |
| `.vpr` | 酷狗音乐 v2 | MP3 / FLAC |

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

React 19 · TypeScript · Tailwind CSS 4 · Vite 8 · JSZip · aes-js · browser-id3-writer · @breezystack/lamejs · Hono · better-sqlite3

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
```

每个 build 命令仅触碰自己的子项目，**不会牵连其他**。

---

## 生产部署（阿里云 ECS + 宝塔面板）

### 服务器目录布局

| 路径 | 内容 |
|---|---|
| `/www/wwwroot/musiczh/` | 用户端 `dist/` 解压 |
| `/www/wwwroot/musiczh-admin/` | 运营后台 `admin/dist/` 解压 |
| `/www/wwwroot/musiczh-api/` | 后端代码（含 `node_modules` 与 `analytics.db`） |

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

### nginx 配置（宝塔站点 → 配置文件）

```nginx
location /api/ {
  proxy_pass http://127.0.0.1:8787;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  client_max_body_size 1m;          # /api/track 不需要大体积
}

location /admin {
  alias /www/wwwroot/musiczh-admin/;
  try_files $uri $uri/ /admin/index.html;
}

location / {
  root /www/wwwroot/musiczh;
  try_files $uri $uri/ /index.html;
}
```

### 用户端 / 后台前端部署

```bash
# 本地
npm run build         # 产物在 dist/
npm run build:admin   # 产物在 admin/dist/

# 把 dist/ 压成 zip 上传宝塔，解压到 /www/wwwroot/musiczh/
# 把 admin/dist/ 压成 zip 上传宝塔，解压到 /www/wwwroot/musiczh-admin/
```

### SQLite 每日备份（宝塔计划任务）

新增一个 shell 计划任务，每天凌晨 04:00 执行：

```bash
#!/bin/bash
SRC=/www/wwwroot/musiczh-api/analytics.db
DST=/www/backup/musiczh
mkdir -p $DST
sqlite3 $SRC ".backup $DST/analytics-$(date +\%Y\%m\%d).db"
# 保留 30 天，超出删除
find $DST -name 'analytics-*.db' -mtime +30 -delete
```

### 数据保留

后端启动时会自动启动「365 天保留」cron（每日 03:00），删除超过 365 天的 `events` 与 `failures`。可通过 `RETENTION_DAYS` 环境变量调整。

---

## 运营后台

- 访问地址：`https://sleepno.cn/admin`
- 登录账号：单管理员，初始用户名/密码由后端环境变量 seed
- 功能：
  - **概览**：PV/UV、人维度（上传 UV / 下载 UV）、件维度（上传文件总数、解密成功/失败、转码成功/失败）、PV/UV 趋势、漏斗、解密失败趋势
  - **按钮埋点**：每个按钮的曝光/点击 PV/UV，以及对应 CTR
  - **失败日志**：解密 / 转码失败列表 + 详情抽屉，提供「复制 JSON 给 Claude 排查」按钮
  - **配置中心**（占位）：本期未实现

---

## 路线图

- [x] 网易云 `.ncm`
- [x] 酷狗 `.kgm` / `.vpr` v2
- [x] FLAC / OGG 强制转 MP3
- [x] 数据埋点 + 运营后台
- [ ] QQ 音乐 `.qmc` / `.mflac`
- [ ] 酷我 `.kwm`
- [ ] 酷狗 KGG / 新版外部 Key 格式
- [ ] FLAC 文件 Vorbis Comments + PICTURE block 标签写入

---

## License & 合规

仅用于处理你**合法持有**的音乐文件。文件本体绝对不会上传到任何服务器；埋点只上报扩展名、大小、文件名（用于排查）、错误码 / 堆栈等元数据，不读取或上传文件二进制内容。详见 [docs/ANALYTICS_SPEC.md](docs/ANALYTICS_SPEC.md)。

MIT
