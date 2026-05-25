/**
 * QQ 音乐 QMCv2 扩展名 → 解密后目标格式映射
 *
 * 移植自 unlock-music（MIT，ipid/unlock-music master 分支）`src/decrypt/qmc.ts` HandlerMap。
 * version 字段在 unlock-music 里区分 v1（bkcXXX/tkm 等旧 PC 版，无 key footer）与 v2（mflac/mgg
 * 等带 key footer 的新版）。本项目当前仅实现 v2，v1 历史很老（≥10 年前）实际流量极低，
 * 上线后看埋点决定是否补。
 */

export type QmcTargetExt = 'flac' | 'ogg' | 'mp3' | 'm4a' | 'wav' | 'ape' | 'wma' | 'mmp4'

export interface QmcHandler {
  /** 解密后真实音频格式（用于决定 mime / 输出文件后缀） */
  ext: QmcTargetExt
  /** 1 = 旧版 PC（bkc 系列），2 = 新版（mflac/mgg/qmcXXX） */
  version: 1 | 2
}

export const QMC_HANDLER_MAP: Record<string, QmcHandler> = {
  mgg: { ext: 'ogg', version: 2 },
  mgg0: { ext: 'ogg', version: 2 },
  mggl: { ext: 'ogg', version: 2 },
  mgg1: { ext: 'ogg', version: 2 },
  mflac: { ext: 'flac', version: 2 },
  mflac0: { ext: 'flac', version: 2 },
  mflach: { ext: 'flac', version: 2 },
  mmp4: { ext: 'mmp4', version: 2 },

  qmcflac: { ext: 'flac', version: 2 },
  qmcogg: { ext: 'ogg', version: 2 },

  qmc0: { ext: 'mp3', version: 2 },
  qmc2: { ext: 'ogg', version: 2 },
  qmc3: { ext: 'mp3', version: 2 },
  qmc4: { ext: 'ogg', version: 2 },
  qmc6: { ext: 'ogg', version: 2 },
  qmc8: { ext: 'ogg', version: 2 },

  bkcmp3: { ext: 'mp3', version: 1 },
  bkcm4a: { ext: 'm4a', version: 1 },
  bkcflac: { ext: 'flac', version: 1 },
  bkcwav: { ext: 'wav', version: 1 },
  bkcape: { ext: 'ape', version: 1 },
  bkcogg: { ext: 'ogg', version: 1 },
  bkcwma: { ext: 'wma', version: 1 },
  tkm: { ext: 'm4a', version: 1 },
}

/** 全部支持的 QMC 扩展名（不含点） */
export const QMC_EXTS: ReadonlyArray<string> = Object.freeze(Object.keys(QMC_HANDLER_MAP))

/** 用于上传准入 / sniff 文件名识别的正则（含点前缀，i 大小写不敏感） */
export const QMC_EXT_REGEX = /\.(mflac\d*|mflach|mgg\d*|mggl|mmp4|qmcflac|qmcogg|qmc[02346]|bkc(mp3|m4a|flac|wav|ape|ogg|wma)|tkm)(\.|$)/i

export function lookupQmcHandler(ext: string | undefined): QmcHandler | undefined {
  if (!ext) return undefined
  return QMC_HANDLER_MAP[ext.toLowerCase()]
}
