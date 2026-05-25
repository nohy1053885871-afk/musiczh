/**
 * 拾音 · 解密相关共享类型
 *
 * 跨多个解密器（NCM / KGM / VPR）共享的类型定义。
 */

export type DecryptErrorCode =
  | 'INVALID_HEADER'
  | 'FILE_TOO_SMALL'
  | 'FILE_TOO_LARGE'
  | 'DECRYPT_FAILED'
  | 'KGM_V4_UNSUPPORTED'
  // QQ 音乐新版（v20+）：密钥已迁移到云端，文件尾部仅有 'STag' 标记，无法纯前端解密。
  // 引导用户下载旧版（v19.51 Windows）重新生成可解密文件。
  | 'QMC_NEW_VERSION_UNSUPPORTED'
  | 'UNSUPPORTED_FORMAT'
  // 真 FLAC 头但浏览器内置 codec 解不了（高概率是 24-bit / 96kHz+ Hi-Res FLAC）
  | 'HIRES_NOT_SUPPORTED'
  | 'UNKNOWN'

export class DecryptError extends Error {
  code: DecryptErrorCode
  cause?: unknown
  constructor(code: DecryptErrorCode, message: string, cause?: unknown) {
    super(message)
    this.name = 'DecryptError'
    this.code = code
    this.cause = cause
  }
}

/** 来源平台 */
export type AudioSource = 'ncm' | 'kgm' | 'vpr' | 'qmc'

/** 输出音频格式 */
export type AudioFormat = 'mp3' | 'flac' | 'ogg'

/** 元数据：NCM 内嵌完整信息；KGM/VPR 多数没有，字段全可选 */
export interface AudioMeta {
  musicName?: string
  artist?: [string, number][]
  album?: string
  format?: string
  duration?: number
  bitrate?: number
  albumPic?: string
  source?: AudioSource
}

export interface DecryptResult {
  audio: Blob
  format: AudioFormat
  meta: AudioMeta
  cover: Blob | null
  suggestedName: string
}

export type ProgressCallback = (progress: number) => void
