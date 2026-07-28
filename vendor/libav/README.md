# LibAV.js M4A/AAC 备用解码构建

主站只在 WebCodecs 无法解码 M4A/AAC 时加载这里记录的自定义 LibAV.js
构建。产物托管在 `public/libav/`，不进入首页初始 JavaScript 包。

## 固定来源

- LibAV.js：`v6.9.8.1`
- 上游 commit：`65ce461de1add4c96bc74fac52bd239f900ec11f`
- 上游内置 FFmpeg：`8.1`
- Emscripten：`4.0.23`
- 变体名：`musiczh-aac`
- 配置：`musiczh-aac-config.json`

该配置只启用 MOV/MP4 解封装、AAC parser/decoder、`swresample` 和
`aresample`。未启用网络、编码器、muxer、CLI 或 GPL 组件。

## 可复现构建

```bash
git clone --branch v6.9.8.1 --depth 1 https://github.com/Yahweasel/libav.js.git
cd libav.js
./configs/mkconfig.js musiczh-aac \
  '["avformat","avcodec","swresample","demuxer-mov","parser-aac","decoder-aac"]'
make build-musiczh-aac
make dist/libav-6.9.8.1-musiczh-aac.mjs
make dist/libav-6.9.8.1-musiczh-aac.wasm.mjs
```

在 macOS 上构建 FFmpeg 静态库时，系统 `ar` 无法处理 WebAssembly
object；需在 `mk/ffmpeg.mk` 的 FFmpeg configure 参数中补
`--ar=emar`。这是构建工具选择，不改变源码或功能配置。

发布的三个文件及 SHA-256：

```text
34b3c8e9c9db9844624f642f14403685a660714466a33aa34fd5cac3f1da63b1  libav-6.9.8.1-musiczh-aac.mjs
c96e8477b3503418440c8285ef45bd6b080bb1ec3651bc00213b83cf172e2e1c  libav-6.9.8.1-musiczh-aac.wasm.mjs
5cc66517520507cb392dba8235da365496be95293e6ff1e39f374bf4ddcb273e  libav-6.9.8.1-musiczh-aac.wasm.wasm
```

许可与对应源码入口见根目录 `THIRD_PARTY_NOTICES.md` 及
`public/libav/SOURCE.md`。
