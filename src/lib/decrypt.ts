/**
 * 拾音 · 统一解密入口
 *
 * 按文件扩展名分发到对应解密器。新增格式时在这里加 case 即可。
 */

import { decryptNcm } from './ncm'
import { decryptKgm } from './kgm'
import { DecryptError, type DecryptResult, type ProgressCallback } from './types'

export const SUPPORTED_EXTS = ['ncm', 'kgm', 'vpr'] as const
export type SupportedExt = (typeof SUPPORTED_EXTS)[number]
// 上传准入 regex：含 .flac / .kgg。
// flac 在 App.tsx processQueue 走 transcode-only 或自动 reroute 路径（基于文件头嗅探）。
// kgg 进队列后 sniff 出 kgg_or_kgmv4 给精准错误（而不是上传被拒），便于诊断与统计。
export const SUPPORTED_EXT_REGEX = /\.(ncm|kgm|vpr|flac|kgg)$/i

/**
 * 按文件名扩展名分发到具体解密器。
 * formatOverride：调用方已经按文件头嗅探出真实格式，强制走对应解密器（绕过扩展名误导）。
 */
export async function decryptAudioFile(
  file: File,
  onProgress?: ProgressCallback,
  formatOverride?: SupportedExt,
): Promise<DecryptResult> {
  const ext =
    formatOverride ??
    (file.name.split('.').pop()?.toLowerCase() as SupportedExt | undefined)
  switch (ext) {
    case 'ncm':
      return decryptNcm(file, onProgress)
    case 'kgm':
    case 'vpr':
      return decryptKgm(file, onProgress)
    default:
      throw new DecryptError(
        'UNSUPPORTED_FORMAT',
        `不支持的格式：.${ext ?? '?'}`,
      )
  }
}

export {
  DecryptError,
  type DecryptResult,
  type ProgressCallback,
  type DecryptErrorCode,
  type AudioFormat,
  type AudioMeta,
} from './types'
