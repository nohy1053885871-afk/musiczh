# QQ 音乐自托管安装包回退与 SHA-256 校验

`sleepno.cn` 目前仍为 QQ 音乐用户提供旧版 v19.51（Windows）自托管安装包回退（路径 `/downloads/qq-music-v19.51-windows.zip`，物理目录 `/www/wwwroot/musiczh-downloads/`，**不进 git / 不进部署 zip**）。v0.8.11 开发版新增按域名配置的 HTTPS 网盘跳转：外部链接存在时优先跳转；只有外部链接为空且当前构建允许自托管时才走本文件记录的 ZIP。

本文档登记安装包的 SHA-256，用于：
1. 前端自托管目标解析器给 `qq_download_click` 附带对应哈希
2. 后端运营观测：只对走自托管 ZIP 的点击比对实际文件，识别是否被替换或篡改
3. 后续升级追溯（替换安装包必须更新本文档并跑一遍校验流程）

外部网盘跳转不携带本 SHA-256，也不能用本哈希证明网盘文件内容。第一阶段 `shiyinmp3.com` 改用外部链接时仍保留本回退资产；待 `sleepno.cn` 也完成切换并稳定后，再单独删除服务器文件和 nginx `/downloads/` 规则。

---

## 当前线上

| 文件 | 版本 | 大小 | SHA-256 |
|---|---|---|---|
| qq-music-v19.51-windows.zip | QQ 音乐 v19.51（绿色去更新版） | 105 MB | `f1e2e2e35d1ffa6caadd8dea528c4b6120c5130e73260b3a73635d30531557cb` |

源文件由项目主提供：`QQMusic-v19.51绿色去更新版.7z`（85 MB，LZMA 压缩）。
v0.6.0 上线前用 `bsdtar -xf` 解出 235 MB 原始目录后用 `zip -r -9` 重打成 .zip（Deflate 压缩），为的是让 Windows / macOS 用户都能双击解压、URL 路径纯 ASCII。

## 校验流程（项目主操作步骤）

```bash
# 1. 本地把解压包重新打包成 zip
zip -r qq-music-v19.51-windows.zip qq-music-v19.51-windows/

# 2. 计算 sha256 记录下来
shasum -a 256 qq-music-v19.51-windows.zip
# 示例输出：abcdef1234...  qq-music-v19.51-windows.zip

# 3. 上传到服务器
scp qq-music-v19.51-windows.zip root@<server>:/www/wwwroot/musiczh/downloads/

# 4. 服务器上确认 sha256 一致（防止上传过程出错）
ssh root@<server> 'shasum -a 256 /www/wwwroot/musiczh/downloads/qq-music-v19.51-windows.zip'

# 5. 把 sha256 填到本文档表格 + 同步到 src/lib/qq-installer.ts
# 6. git commit + 发布前端

# 7. 抽检线上：
curl -I https://sleepno.cn/downloads/qq-music-v19.51-windows.zip
curl -L https://sleepno.cn/downloads/qq-music-v19.51-windows.zip -o /tmp/check.zip
shasum -a 256 /tmp/check.zip  # 与本文档表格一致
```

## 历史版本

无（v0.6.0 首次引入）。
