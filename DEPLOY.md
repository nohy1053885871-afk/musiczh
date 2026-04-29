# 部署进度与计划

> 一份"现在到了哪一步、下一步该干什么"的备忘录。每完成一项就划掉一行。

---

## 项目信息

| | |
|---|---|
| 项目名 | musiczh — NCM 转 MP3 转换工具 |
| 仓库 | https://github.com/nohy1053885871-afk/musiczh |
| 域名 | sleepno.cn（已备案 ✅） |
| 服务器 | 阿里云 ECS · 47.96.23.48 · 杭州 · 2C2G |
| 服务器面板 | 宝塔 Linux 11.1.0（http://47.96.23.48:8888/login） |
| 服务器内网 IP | 172.26.6.239 |
| 网站根目录（计划） | /www/wwwroot/musiczh |

---

## 总体进度

- [x] 阶段 0：项目脚手架（Vite + React + TS + Tailwind）
- [x] 阶段 1：核心 NCM 解密 + ID3 标签写入
- [x] 阶段 2：体验打磨（进度条、批量下载、错误恢复、限制、交互反馈）
- [x] 推送至 GitHub
- [ ] **阶段 3：部署上线（进行中）**

---

## 部署阶段细分

### 已完成
- [x] 4.1 阿里云控制台登入服务器，找到宝塔面板入口
- [x] 4.2 安全组开放端口：8888 (BT 面板) / 80 (HTTP) / 443 (HTTPS)
- [x] 4.3 宝塔软件商店安装 Nginx 1.28.1
- [x] 4.4 本地构建生产版本（`npm run build`，产物在 `dist/`）

### 进行中 / 下一步

- [ ] **4.5 在宝塔面板创建网站**
  - 路径：宝塔 → 网站 → 添加站点
  - 域名：`sleepno.cn` + `www.sleepno.cn`（两行）
  - 根目录：`/www/wwwroot/musiczh`
  - PHP 版本：**纯静态**
  - 不创建 FTP / 数据库

- [ ] **4.6 阿里云配置 DNS 解析**
  - 路径：阿里云控制台 → 域名 → sleepno.cn → 解析
  - 添加两条 A 记录：
    | 主机记录 | 记录类型 | 记录值 | TTL |
    |---|---|---|---|
    | `@` | A | `47.96.23.48` | 10 分钟 |
    | `www` | A | `47.96.23.48` | 10 分钟 |

- [ ] **4.7 上传 dist/ 文件到服务器**
  - 路径：宝塔 → 文件 → 进入 `/www/wwwroot/musiczh`
  - 上传本地 `dist/` 文件夹中的 **所有内容**（不是 dist 文件夹本身，是它里面的 `index.html` 和 `assets/`）

- [ ] **4.8 验证访问**
  - 浏览器打开 `http://sleepno.cn`
  - 应该看到首页"NCM 转 MP3 转换工具"
  - 拖一个真实 ncm 文件测试解密 + 下载

- [x] **4.9 启用 HTTPS**
  - 宝塔 → 网站 → 站点设置 → SSL → Let's Encrypt → 申请
  - 申请成功后开启"强制 HTTPS"
  - 验证 `https://sleepno.cn` 可访问

- [ ] **4.10 收尾**
  - 修改宝塔默认 8888 端口（安全加固）
  - 在仓库根目录写 README，说明项目用途
  - 把当前部署信息记入此文件

---

## 部署后还可以继续做的事

- [ ] FLAC 文件的标签写入（Vorbis Comments + PICTURE block）
- [ ] 移动端适配 / 暗色模式
- [ ] 合规护盾：首次访问的"使用须知"弹窗
- [ ] CI/CD：GitHub Actions 自动构建 + SCP 部署到服务器
- [ ] 访问量统计（轻量埋点，如百度统计 / Umami）

---

## 备忘 · 经常用到的命令

### 本地构建（每次代码改动后）
```bash
cd /Users/bojue/musiczh
npm run build
# 产物在 dist/ 目录
```

### 本地开发
```bash
npm run dev
# 浏览器打开 http://localhost:5173
```

### Git 提交进度（每次改完代码必做！）

> 原则：**GitHub 仓库永远保持最新代码**。每次本地改动后，立刻三步走。

```bash
cd /Users/bojue/musiczh
git status                  # 1. 看改了啥
git add .                   # 2. 暂存（.gitignore 已配好，放心用 .）
git commit -m "改了什么"    # 3. 提交
git push                    # 4. 推到 GitHub
```

### 宝塔常用入口
| 操作 | 入口 |
|---|---|
| 文件管理 | 左侧 "文件" |
| 网站管理 | 左侧 "网站" |
| 软件管理 | 左侧 "软件商店" |
| 终端 | 左侧 "终端" |
| 看面板登录信息 | SSH `sudo bt default` |
| 改面板密码 | SSH `sudo bt 5` |
| 改面板端口 | SSH `sudo bt 8` |

---

## 排错速查

**域名解析不生效**：
- 用 `dig sleepno.cn` 或在线工具 https://tool.chinaz.com/dns 查 A 记录是否指到 47.96.23.48
- DNS 可能要等几分钟生效

**网站打不开**：
- 检查阿里云安全组 80 端口是否放行
- 检查宝塔站点是否启用
- `curl -I http://47.96.23.48` 看是否返回 200

**HTTPS 申请失败**：
- 80 端口必须可访问（Let's Encrypt 走 HTTP-01 验证）
- 域名解析必须已生效
- 此前没有同域名证书在排队
