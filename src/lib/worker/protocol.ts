/**
 * 拾音 · Worker 通讯协议
 *
 * audio.worker.ts 与 client.ts 共同 import，是消息形状的唯一真源。
 * File / Blob 走结构化克隆按引用传递（不拷贝字节），可直接 postMessage。
 */

import {
  DecryptError,
  type DecryptErrorCode,
  type DecryptResult,
} from '../types'
import type { SupportedExt } from '../decrypt'

export type WorkerRequest =
  | {
      kind: 'decrypt'
      id: number
      file: File
      formatOverride?: SupportedExt | 'qmc'
    }
  | { kind: 'transcode'; id: number; source: Blob }

export interface SerializedWorkerError {
  /** 有值 ⇒ 原错误是 DecryptError，主线程按同 code 重建 */
  decryptCode?: DecryptErrorCode
  message: string
  stack?: string
}

export type WorkerResponse =
  | { kind: 'progress'; id: number; value: number }
  | { kind: 'decrypt-done'; id: number; result: DecryptResult }
  | { kind: 'transcode-done'; id: number; blob: Blob }
  | { kind: 'fail'; id: number; error: SerializedWorkerError }

export function serializeWorkerError(err: unknown): SerializedWorkerError {
  if (err instanceof DecryptError) {
    return { decryptCode: err.code, message: err.message, stack: err.stack }
  }
  // File 底层文件在处理途中失效（NotFoundError）或被修改（NotReadableError）
  // —— 流式分块 lazy 读把暴露窗口拉长到整个转码时长，移动端临时文件被回收时在此现形。
  // 在序列化咽喉点统一映射，解密/转码两条路径同时覆盖。
  if (
    err instanceof DOMException &&
    (err.name === 'NotFoundError' || err.name === 'NotReadableError')
  ) {
    return {
      decryptCode: 'FILE_UNREADABLE',
      message:
        '读取音频文件失败：文件在处理过程中被移动、删除或被系统清理。请把文件先保存到本机存储，再重新上传',
      stack: err.stack,
    }
  }
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack }
  }
  return { message: String(err) }
}

/**
 * Error 结构化克隆会丢自定义 code 字段，且跨 realm 后 instanceof DecryptError 失效，
 * 必须在主线程用本侧的 DecryptError 类重建（App 的 catch 分支才能照常工作）。
 * 保留 worker 侧堆栈，trackFailure 的 error_stack 才有定位价值。
 */
export function reviveWorkerError(s: SerializedWorkerError): Error {
  const e = s.decryptCode
    ? new DecryptError(s.decryptCode, s.message)
    : new Error(s.message)
  if (s.stack) e.stack = s.stack
  return e
}
