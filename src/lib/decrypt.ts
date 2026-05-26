/**
 * 拾音 · 统一解密入口
 *
 * 按文件扩展名分发到对应解密器。新增格式时在这里加 case 即可。
 */

import { decryptNcm } from './ncm'
import { decryptKgm } from './kgm'
import { decryptQmc } from './qmc'
import { QMC_EXTS } from './qmc/handler-map'
import { DecryptError, type DecryptResult, type ProgressCallback } from './types'

export const SUPPORTED_EXTS = ['ncm', 'kgm', 'vpr', ...QMC_EXTS] as const
export type SupportedExt = (typeof SUPPORTED_EXTS)[number]
// 上传准入 regex：含 .flac / .ogg / .kgg / 全部 QMC 扩展名。
// flac / ogg 在 App.tsx processQueue 走 transcode-only 路径（跳过解密，AudioContext 直解后 lamejs 编码）。
// kgg 进队列后 sniff 出 kgg_or_kgmv4 给精准错误（而不是上传被拒），便于诊断与统计。
// QMC 系列进队列后走 decryptQmc；新版 STag 文件会在解密阶段抛 QMC_NEW_VERSION_UNSUPPORTED 引导用户。
export const SUPPORTED_EXT_REGEX =
  /\.(ncm|kgm|vpr|flac|ogg|kgg|mflac\d*|mflach|mgg\d*|mggl|mmp4|qmcflac|qmcogg|qmc[02346]|bkc(mp3|m4a|flac|wav|ape|ogg|wma)|tkm)$/i

/**
 * 按文件名扩展名分发到具体解密器。
 * formatOverride：调用方已经按文件头嗅探出真实格式，强制走对应解密器（绕过扩展名误导）。
 *   值为 'qmc' 时直接走 QMC 解密器（不要求扩展名匹配，应对改后缀绕过场景）。
 */
export async function decryptAudioFile(
  file: File,
  onProgress?: ProgressCallback,
  formatOverride?: SupportedExt | 'qmc',
): Promise<DecryptResult> {
  if (formatOverride === 'qmc') {
    return decryptQmc(file, onProgress)
  }
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
      // QMC 系列扩展名（mflac/mgg/qmcXXX/bkcXXX/tkm 等）
      if (ext && (QMC_EXTS as ReadonlyArray<string>).includes(ext)) {
        return decryptQmc(file, onProgress)
      }
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
