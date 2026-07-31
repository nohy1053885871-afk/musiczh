/** 全站封面资源策略：所有来源共用，避免格式模块各自漂移。 */
export const MAX_COVER_BYTES = 16 * 1024 * 1024
export const REMOTE_COVER_EDGE = 500
export const REMOTE_COVER_DEADLINE_MS = 2_000
export const REMOTE_COVER_CONCURRENCY = 3

export const MAX_OGG_COMMENT_BYTES =
  Math.ceil((MAX_COVER_BYTES * 4) / 3) + 1024 * 1024

export type CoverFailureCode =
  | 'COVER_TIMEOUT'
  | 'COVER_TOO_LARGE'
  | 'COVER_HTTP_ERROR'
  | 'COVER_NETWORK_ERROR'
  | 'COVER_UNSUPPORTED_IMAGE'
  | 'COVER_TAG_WRITE_FAILED'
  | 'COVER_EMBED_VERIFY_FAILED'

export function isCoverSizeAllowed(size: number): boolean {
  return size > 0 && size <= MAX_COVER_BYTES
}
