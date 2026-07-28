# LibAV.js / FFmpeg source

These files are a custom WebAssembly build of LibAV.js `v6.9.8.1`
(commit `65ce461de1add4c96bc74fac52bd239f900ec11f`) and its bundled FFmpeg
`8.1` source.

- LibAV.js source: https://github.com/Yahweasel/libav.js/tree/65ce461de1add4c96bc74fac52bd239f900ec11f
- LibAV.js source archive: https://github.com/Yahweasel/libav.js/archive/65ce461de1add4c96bc74fac52bd239f900ec11f.tar.gz
- FFmpeg 8.1 source: https://ffmpeg.org/releases/ffmpeg-8.1.tar.xz
- Build configuration and instructions:
  https://github.com/nohy1053885871-afk/musiczh/tree/main/vendor/libav
- LGPL 2.1 license: `/licenses/FFmpeg-LGPL-2.1.txt`

Build fragments:

```json
["avformat","avcodec","swresample","demuxer-mov","parser-aac","decoder-aac"]
```

No networking, encoders, muxers, command-line tools, or GPL components are
enabled in this variant.
