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
  | 'UNSUPPORTED_FORMAT'
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
export type AudioSource = 'ncm' | 'kgm' | 'vpr'

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
