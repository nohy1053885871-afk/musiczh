/**
 * 文件头嗅探：按前 16 字节 magic 判定真实格式，绕过用户瞎改的扩展名。
 *
 * 典型场景：用户拿到「xxx.kgm.flac」/「xxx.kgg (1).flac」，扩展名是 .flac，
 * 但内容其实是加密的 KGM/VPR/KGG。我们按头判定，自动 reroute 到正确处理路径。
 */

import type { AudioFormat } from './types'
import { QMC_EXT_REGEX } from './qmc/handler-map'
import { hasXmSignature } from './xm-id3'

/**
 * 真实格式：
 * - ncm/kgm/vpr/xm：本工具能解密
 * - qmc：QQ 音乐加密格式（mflac/mgg/qmcXXX/bkc 等系列），走 src/lib/qmc.ts 解密
 * - flac/ogg/m4a：本工具能直接转 MP3
 * - mp3：已经是目标格式，无需处理
 * - kgg_or_kgmv4：酷狗新版外部 Key 格式，本工具暂不支持
 * - unknown：上面都不是
 */
export type RealFormat =
  | 'ncm'
  | 'kgm'
  | 'vpr'
  | 'xm'
  | 'qmc'
  | 'flac'
  | 'ogg'
  | 'm4a'
  | 'mp3'
  | 'kgg_or_kgmv4'
  | 'unknown'

/** RealFormat → AudioFormat（加密容器之外的真实音频格式） */
export function toAudioFormat(rf: RealFormat): AudioFormat | null {
  if (rf === 'mp3' || rf === 'flac' || rf === 'ogg' || rf === 'm4a') return rf
  return null
}

/**
 * 按头部 magic 判定【已解密音频字节】的真实格式，识别不出返回 null。
 * 解密器（ncm/kgm/qmc）共用：解密产物必须命中已知 magic，否则视为"解出来不是音频"。
 * 与 sniffRealFormat 区别：这里入参是裸音频字节、不认 ncm/kgm 等加密容器。
 */
export function sniffAudioFormat(bytes: Uint8Array): AudioFormat | null {
  if (bytes.length < 4) return null
  // FLAC: "fLaC"
  if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
    return 'flac'
  }
  // OGG: "OggS"
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
    return 'ogg'
  }
  // M4A / MP4 family: 4-byte box size + "ftyp".
  // XM v2 的 M4A 产物 major brand 通常为 "M4A "；兼容 isom/mp42 等合法封装。
  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70
  ) {
    return 'm4a'
  }
  // MP3: ID3v2 tag
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return 'mp3'
  }
  // MP3: MPEG audio sync (0xFF 后 3 bit 全 1)
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return 'mp3'
  }
  return null
}

/**
 * 按头部 magic 判定【图片字节】的 MIME，识别不出返回 null。
 * 覆盖 browser-id3-writer 白名单与我们 FLAC PICTURE 写入都支持的常见格式。
 *
 * 权威信号：图片真实字节，优先于任何外部声称的 Blob.type / 扩展名 / 容器硬编码——
 * NCM 容器不带 cover mime（旧代码一律标 image/jpeg），但新版网易云封面其实是 PNG；
 * FLAC PICTURE block 必须声明真实格式，否则严格播放器按声明 MIME 解码失败 → 丢封面。
 * 用途：NCM 抠出的封面定 MIME / 远程回填封面归一化 MIME / FLAC PICTURE 写入校正。
 */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif'
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

const NCM_MAGIC = [0x43, 0x54, 0x45, 0x4e, 0x46, 0x44, 0x41, 0x4d] // "CTENFDAM"
const KGM_MAGIC = [
  0x7c, 0xd5, 0x32, 0xeb, 0x86, 0x02, 0x7f, 0x4b,
  0xa8, 0xaf, 0xa6, 0x8e, 0x0f, 0xff, 0x99, 0x14,
]
const VPR_MAGIC = [
  0x05, 0x28, 0xbc, 0x96, 0xe9, 0xe4, 0x5a, 0x43,
  0x91, 0xaa, 0xbd, 0xd0, 0x7a, 0xf5, 0x36, 0x31,
]

function startsWith(buf: Uint8Array, magic: number[]): boolean {
  if (buf.length < magic.length) return false
  for (let i = 0; i < magic.length; i++) {
    if (buf[i] !== magic[i]) return false
  }
  return true
}

export async function sniffRealFormat(file: File): Promise<RealFormat> {
  let head: Uint8Array
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  } catch {
    return 'unknown'
  }
  if (head.length < 4) return 'unknown'

  if (startsWith(head, NCM_MAGIC)) return 'ncm'
  if (startsWith(head, KGM_MAGIC)) return 'kgm'
  if (startsWith(head, VPR_MAGIC)) return 'vpr'

  // FLAC: "fLaC"
  if (head[0] === 0x66 && head[1] === 0x4c && head[2] === 0x61 && head[3] === 0x43) {
    return 'flac'
  }
  // Ogg: "OggS"
  if (head[0] === 0x4f && head[1] === 0x67 && head[2] === 0x67 && head[3] === 0x53) {
    return 'ogg'
  }
  // M4A / MP4 family: box size + "ftyp"；按 magic 接受，避免只信扩展名。
  if (
    head.length >= 12 &&
    head[4] === 0x66 &&
    head[5] === 0x74 &&
    head[6] === 0x79 &&
    head[7] === 0x70
  ) {
    return 'm4a'
  }
  // ID3 开头既可能是普通 MP3，也可能是喜马拉雅 XM 外层容器。
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    if (/\.xm$/i.test(file.name) || (await hasXmSignature(file))) return 'xm'
    return 'mp3'
  }
  // MP3: MPEG audio sync (0xFF 后 3 bit 全 1)
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    return 'mp3'
  }

  // 头不是已知 magic 但文件名暗示 KGG → 大概率酷狗新版外部 Key 格式
  // 名字识别只是辅助，magic 才是权威；这里覆盖「.kgg / .kgg (n).flac」之类
  if (/\.kgg(\.|$|[^a-z])/i.test(file.name)) return 'kgg_or_kgmv4'

  // QQ 音乐加密格式：mflac/mflac0/mflach/mgg/mgg1/mggl/mmp4/qmcflac/qmcogg/qmc0-8/bkcXXX/tkm
  // 旧版（v19.51 及以下）密钥嵌在文件尾，可解；新版（v20+）'STag' 标记会在解密阶段抛精准错误
  // 真 .flac/.mp3/.ogg 在上面的 magic 已经命中，不会被这里误伤
  if (QMC_EXT_REGEX.test(file.name)) return 'qmc'
  // [mqms*] tag 是 QQ 音乐改后缀绕过的常见标记
  if (/\[mqms\d*\]/i.test(file.name)) return 'qmc'

  // 损坏/截断的 .xm 仍交给 XM parser，给出精准错误，不伪装成 unknown。
  if (/\.xm$/i.test(file.name)) return 'xm'

  return 'unknown'
}
