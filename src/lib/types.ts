/**
 * 拾音 · 解密相关共享类型
 *
 * 跨多个解密器（NCM / KGM / VPR / QMC / XM）共享的类型定义。
 */

export type DecryptErrorCode =
  | 'INVALID_HEADER'
  | 'FILE_TOO_SMALL'
  | 'FILE_TOO_LARGE'
  | 'DECRYPT_FAILED'
  // 解密流程跑完了，但产物头部不是任何已知音频 magic（fLaC/ID3/MPEG/OggS）。
  // 说明解密对齐出错或文件损坏——绝不把乱码当"成功"放出，单独成码便于失败看板精确计数。
  | 'OUTPUT_NOT_AUDIO'
  // 历史错误码名保留以兼容既有埋点；当前表示酷狗新版外部 Key / KGG 类文件。
  | 'KGM_V4_UNSUPPORTED'
  // QQ 音乐新版（v20+）：密钥已迁移到云端，文件尾部仅有 'STag' 标记，无法纯前端解密。
  // 引导用户下载旧版（v19.51 Windows）重新生成可解密文件。
  | 'QMC_NEW_VERSION_UNSUPPORTED'
  // 喜马拉雅 XM 容器标签/长度字段损坏，无法进入解密阶段。
  | 'XM_PARSE_FAILED'
  // 当前只支持已验证的 XM v2；v12 等其他版本必须精准拦截。
  | 'XM_VERSION_UNSUPPORTED'
  // XM 两层 AES-CBC / base64 还原失败。
  | 'XM_DECRYPT_FAILED'
  | 'UNSUPPORTED_FORMAT'
  // 真 FLAC 头但浏览器内置 codec 解不了（高概率是 24-bit / 96kHz+ Hi-Res FLAC）
  | 'HIRES_NOT_SUPPORTED'
  // 转码过程中 Worker 崩溃（WASM 堆溢出等不可恢复错误）
  | 'TRANSCODE_OOM'
  // 读 File 时底层文件已被移动/删除/系统回收（DOMException NotFoundError/NotReadableError）。
  // 流式分块 lazy 读把暴露窗口拉长到整个处理时长；移动端从网盘/聊天应用临时目录
  // 选取的文件（临时副本被清理）最易触发。环境性失败，引导用户存到本机后重传。
  | 'FILE_UNREADABLE'
  // M4A/AAC 解码器（WebCodecs + LibAV fallback）都无法解出 PCM。
  | 'AAC_DECODE_FAILED'
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
export type AudioSource = 'ncm' | 'kgm' | 'vpr' | 'qmc' | 'xm'

/** 输出音频格式 */
export type AudioFormat = 'mp3' | 'flac' | 'ogg' | 'm4a'

/** 所有能复用「一键转 MP3」管线的非 MP3 格式；UI、批量过滤、转码入口共用唯一真源。 */
export const MP3_TRANSCODABLE_FORMATS = ['flac', 'ogg', 'm4a'] as const
export type Mp3TranscodableFormat = (typeof MP3_TRANSCODABLE_FORMATS)[number]

export function isMp3TranscodableFormat(
  format: AudioFormat | null | undefined,
): format is Mp3TranscodableFormat {
  return format != null && (MP3_TRANSCODABLE_FORMATS as readonly AudioFormat[]).includes(format)
}

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
  /** 主偏移解出的不是合法音频、靠 magic 锚定扫描找回了音频起点时为 true（仅 NCM）。
   *  正常路径不带此字段；App 见 true 时埋 decrypt_offset_recovered 预警"出现新偏移变体"。 */
  offsetRecovered?: boolean
}

export type ProgressCallback = (progress: number) => void
