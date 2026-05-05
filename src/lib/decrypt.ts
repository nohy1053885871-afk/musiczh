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
export const SUPPORTED_EXT_REGEX = /\.(ncm|kgm|vpr)$/i

export async function decryptAudioFile(
  file: File,
  onProgress?: ProgressCallback,
): Promise<DecryptResult> {
  const ext = file.name.split('.').pop()?.toLowerCase() as
    | SupportedExt
    | undefined
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
