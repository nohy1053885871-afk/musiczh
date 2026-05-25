# QQ 音乐安装包 SHA-256 校验

主站为 QQ 音乐用户提供旧版 v19.51（Windows）安装包下载（路径 `/downloads/qq-music-v19.51-windows.zip`，托管在服务器 `/www/wwwroot/musiczh/downloads/`，**不进 git / 不进部署 zip**）。

本文档登记安装包的 SHA-256，用于：
1. 前端 `QqGuideModal` 「注意」区显示给用户自查
2. 后端运营观测：`qq_download_click` 事件携带的 `sha256` 字段比对服务器实际值，识别是否被替换/篡改
3. 后续升级追溯（替换安装包必须更新本文档 + 跑一遍校验流程）

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

# 5. 把 sha256 填到本文档表格 + 同步到 src/components/qq-guide.tsx 的 COPY 常量
# 6. git commit + 发布前端

# 7. 抽检线上：
curl -I https://sleepno.cn/downloads/qq-music-v19.51-windows.zip
curl -L https://sleepno.cn/downloads/qq-music-v19.51-windows.zip -o /tmp/check.zip
shasum -a 256 /tmp/check.zip  # 与本文档表格一致
```

## 历史版本

无（v0.6.0 首次引入）。
