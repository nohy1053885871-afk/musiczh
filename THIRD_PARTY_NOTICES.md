# 第三方组件说明

## Mediabunny 1.51.0

- 用途：M4A/MP4 解封装，以及 WebCodecs AAC 解码路径。
- 来源：https://github.com/Vanilagy/mediabunny/tree/v1.51.0
- 许可：Mozilla Public License 2.0。
- 许可正文：`public/licenses/Mediabunny-MPL-2.0.txt`。

Mediabunny 通过 npm 源码依赖参与构建；主站仅在用户主动将 M4A 转为
MP3 时动态加载对应模块。

## LibAV.js 6.9.8.1 / FFmpeg 8.1

- 用途：浏览器 WebCodecs 不可用或 AAC 解码失败时的 M4A fallback。
- LibAV.js 来源：
  https://github.com/Yahweasel/libav.js/tree/65ce461de1add4c96bc74fac52bd239f900ec11f
- FFmpeg 来源：https://ffmpeg.org/releases/ffmpeg-8.1.tar.xz
- 许可：LibAV.js 前端为 ISC；裁剪构建内的 FFmpeg 为 LGPL 2.1+。
- LGPL 正文：`public/licenses/FFmpeg-LGPL-2.1.txt`。
- 构建配置和可复现步骤：`vendor/libav/README.md`。
- 随站发布的源码入口：`public/libav/SOURCE.md`。

自定义变体只包含 MOV/MP4 demux、AAC parser/decoder、重采样和本地文件
读取能力；未启用网络、编码器、muxer、CLI 或 GPL 组件。
