/**
 * 文件头嗅探：按前 16 字节 magic 判定真实格式，绕过用户瞎改的扩展名。
 *
 * 典型场景：用户拿到「xxx.kgm.flac」/「xxx.kgg (1).flac」，扩展名是 .flac，
 * 但内容其实是加密的 KGM/VPR/KGG。我们按头判定，自动 reroute 到正确处理路径。
 */

import type { AudioFormat } from './types'
import { QMC_EXT_REGEX } from './qmc/handler-map'

/**
 * 真实格式：
 * - ncm/kgm/vpr：本工具能解密
 * - qmc：QQ 音乐加密格式（mflac/mgg/qmcXXX/bkc 等系列），走 src/lib/qmc.ts 解密
 * - flac/ogg：本工具能直接转 MP3
 * - mp3：已经是目标格式，无需处理
 * - kgg_or_kgmv4：酷狗新版（KGG/KGM v4，需联网拿密钥），本工具不支持
 * - unknown：上面都不是
 */
export type RealFormat =
  | 'ncm'
  | 'kgm'
  | 'vpr'
  | 'qmc'
  | 'flac'
  | 'ogg'
  | 'mp3'
  | 'kgg_or_kgmv4'
  | 'unknown'

/** RealFormat → AudioFormat（仅 mp3/flac/ogg 三种重叠） */
export function toAudioFormat(rf: RealFormat): AudioFormat | null {
  if (rf === 'mp3' || rf === 'flac' || rf === 'ogg') return rf
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
  // MP3: ID3v2 tag ("ID3")
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    return 'mp3'
  }
  // MP3: MPEG audio sync (0xFF 后 3 bit 全 1)
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    return 'mp3'
  }

  // 头不是已知 magic 但文件名暗示 KGG → 大概率酷狗新版（KGG / KGM v4）
  // 名字识别只是辅助，magic 才是权威；这里覆盖「.kgg / .kgg (n).flac」之类
  if (/\.kgg(\.|$|[^a-z])/i.test(file.name)) return 'kgg_or_kgmv4'

  // QQ 音乐加密格式：mflac/mflac0/mflach/mgg/mgg1/mggl/mmp4/qmcflac/qmcogg/qmc0-8/bkcXXX/tkm
  // 旧版（v19.51 及以下）密钥嵌在文件尾，可解；新版（v20+）'STag' 标记会在解密阶段抛精准错误
  // 真 .flac/.mp3/.ogg 在上面的 magic 已经命中，不会被这里误伤
  if (QMC_EXT_REGEX.test(file.name)) return 'qmc'
  // [mqms*] tag 是 QQ 音乐改后缀绕过的常见标记
  if (/\[mqms\d*\]/i.test(file.name)) return 'qmc'

  return 'unknown'
}
