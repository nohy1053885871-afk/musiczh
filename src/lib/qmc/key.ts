/**
 * QQ 音乐 QMCv2 文件密钥派生
 *
 * 移植自 unlock-music（MIT，ipid/unlock-music master 分支）`src/decrypt/qmc_key.ts`，
 * 把 Node.js Buffer / base64 替换为浏览器原生 atob + Uint8Array。
 *
 * 流程：
 *   raw key（文件尾部读出的字节）→ base64 解码 → decryptV2Key（v2 才需要的额外两层 TEA）
 *   → simpleMakeKey 生成静态 TEA key 与前 8 字节混合 → TEA-CBC 自定义包裹解出尾部
 *   → 拼接得到最终 keyDec（map cipher 用 length ≤ 300，rc4 用 > 300）
 */

import { TeaCipher } from './tea'

const SALT_LEN = 2
const ZERO_LEN = 7

// v2 密钥外层两道 TEA-CBC 用的固定 key
// prettier-ignore
const MIX_KEY_1 = new Uint8Array([
  0x33, 0x38, 0x36, 0x5a, 0x4a, 0x59, 0x21, 0x40,
  0x23, 0x2a, 0x24, 0x25, 0x5e, 0x26, 0x29, 0x28,
])
// prettier-ignore
const MIX_KEY_2 = new Uint8Array([
  0x2a, 0x2a, 0x23, 0x21, 0x28, 0x23, 0x24, 0x25,
  0x26, 0x5e, 0x61, 0x31, 0x63, 0x5a, 0x2c, 0x54,
])

const V2_PREFIX = 'QQMusic EncV2,Key:'

/** raw（来自文件尾的字节流）→ 解密后的实际派生 key */
export function deriveQmcKey(raw: Uint8Array): Uint8Array {
  const text = bytesToLatin1(raw)
  let rawDec = base64ToBytes(text)
  if (rawDec.length < 16) {
    throw new Error('QMC key length too short')
  }

  rawDec = decryptV2Key(rawDec)

  // simpleMakeKey 派生 8 字节 + raw 前 8 字节交错成 16 字节 TEA key
  const simpleKey = simpleMakeKey(106, 8)
  const teaKey = new Uint8Array(16)
  for (let i = 0; i < 8; i++) {
    teaKey[i << 1] = simpleKey[i]
    teaKey[(i << 1) + 1] = rawDec[i]
  }
  const sub = decryptTencentTea(rawDec.subarray(8), teaKey)
  // 拼回前 8 字节 + 解出来的尾部
  const out = new Uint8Array(8 + sub.length)
  out.set(rawDec.subarray(0, 8), 0)
  out.set(sub, 8)
  return out
}

export function simpleMakeKey(salt: number, length: number): Uint8Array {
  const buf = new Uint8Array(length)
  for (let i = 0; i < length; i++) {
    const t = Math.tan(salt + i * 0.1)
    buf[i] = 0xff & (Math.abs(t) * 100.0)
  }
  return buf
}

function decryptV2Key(key: Uint8Array): Uint8Array {
  if (key.length < V2_PREFIX.length) return key
  const prefix = bytesToLatin1(key.subarray(0, V2_PREFIX.length))
  if (prefix !== V2_PREFIX) return key

  // v2 嵌套：去掉 prefix → 两道 TEA-CBC → 再 base64 解码
  let out = decryptTencentTea(key.subarray(V2_PREFIX.length), MIX_KEY_1)
  out = decryptTencentTea(out, MIX_KEY_2)
  const keyDec = base64ToBytes(bytesToLatin1(out))
  if (keyDec.length < 16) {
    throw new Error('QMC EncV2 key decode failed')
  }
  return keyDec
}

/**
 * 自定义 TEA-CBC 解密：
 *   密文 = PadLen(1B) + Padding(0-7B) + Salt(2B) + Body(N B) + Zero(7B)
 *   每 8 字节一个 TEA block，CBC IV 用前一个密文块。
 */
function decryptTencentTea(input: Uint8Array, key: Uint8Array): Uint8Array {
  if (input.length % 8 !== 0) {
    throw new Error('QMC TEA: input not multiple of block size')
  }
  if (input.length < 16) {
    throw new Error('QMC TEA: input too small')
  }

  const blk = new TeaCipher(key, 32)

  const tmpBuf = new Uint8Array(8)
  const tmpView = new DataView(tmpBuf.buffer)

  // 解出第一块到 tmpBuf
  blk.decrypt(
    tmpView,
    new DataView(input.buffer, input.byteOffset, 8),
  )

  const padLen = tmpBuf[0] & 0x7
  const outLen = input.length - 1 /* PadLen byte */ - padLen - SALT_LEN - ZERO_LEN
  if (outLen < 0) {
    throw new Error('QMC TEA: invalid pad len')
  }
  const out = new Uint8Array(outLen)

  let ivPrev = new Uint8Array(8) // 全 0 起步
  let ivCur = input.slice(0, 8)
  let inPos = 8
  let tmpIdx = 1 + padLen // 跳过 PadLen + Padding

  const cryptBlock = () => {
    ivPrev = ivCur
    ivCur = input.slice(inPos, inPos + 8)
    for (let j = 0; j < 8; j++) tmpBuf[j] ^= ivCur[j]
    blk.decrypt(tmpView, tmpView)
    inPos += 8
    tmpIdx = 0
  }

  // 跳过 Salt
  for (let i = 1; i <= SALT_LEN; ) {
    if (tmpIdx < 8) {
      tmpIdx++
      i++
    } else {
      cryptBlock()
    }
  }

  // 还原明文
  let outPos = 0
  while (outPos < outLen) {
    if (tmpIdx < 8) {
      out[outPos] = tmpBuf[tmpIdx] ^ ivPrev[tmpIdx]
      outPos++
      tmpIdx++
    } else {
      cryptBlock()
    }
  }

  // 校验末尾 7 字节 Zero
  for (let i = 1; i <= ZERO_LEN; i++) {
    if (tmpIdx < 8) {
      if (tmpBuf[tmpIdx] !== ivPrev[tmpIdx]) {
        throw new Error('QMC TEA: zero check failed')
      }
      tmpIdx++
    } else {
      cryptBlock()
    }
  }

  return out
}

// ============== 浏览器友好的字节 / base64 工具 ==============

function bytesToLatin1(bytes: Uint8Array): string {
  let s = ''
  // 大块解码避免 charCodeAt 调用过多；chunk 64KB 避免 String.fromCharCode 参数过长
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)))
  }
  return s
}

function base64ToBytes(str: string): Uint8Array {
  // QMC key footer 区域常带杂质：末尾可能跟一个或多个 NUL 字节（v2 key blob 是定长 1009/505 字节，
  // base64 实际内容不足时用 NUL 填充）。浏览器 atob 严格只接受合法 base64 字符，遇到 NUL 就抛
  // InvalidCharacterError——unlock-music 原版能跑是因为 Node Buffer.from(str, 'base64') 默认忽略
  // 非 base64 字符。这里手动剥掉所有非 base64 字符再 decode，行为对齐 Node Buffer。
  const clean = str.replace(/[^A-Za-z0-9+/=]/g, '')
  const pad = (4 - (clean.length % 4)) % 4
  const binary = atob(clean + '='.repeat(pad))
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}
