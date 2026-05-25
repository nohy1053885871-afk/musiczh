/**
 * QQ 音乐 QMCv2 流密码实现：static / map / rc4 三种 stream cipher
 *
 * 移植自 unlock-music（MIT，ipid/unlock-music master 分支）`src/decrypt/qmc_cipher.ts`。
 * 三个 cipher 都是 stream cipher：给定 offset 计算出 mask 字节，与密文 XOR 即明文。
 *
 *  - QmcStaticCipher：旧 PC 版（qmc0/qmc3/bkcXXX 等）固定 256 字节查表，无文件密钥
 *  - QmcMapCipher：v2 短 key（≤ 300 字节），mask = rotate(key[idx], idx & 7)
 *  - QmcRC4Cipher：v2 长 key（> 300 字节），分段 RC4，前 128 字节 + 5120 字节对齐段
 */

export interface QmcStreamCipher {
  decrypt(buf: Uint8Array, offset: number): void
}

// ============== Static cipher ==============

// prettier-ignore
const STATIC_CIPHER_BOX = new Uint8Array([
  0x77, 0x48, 0x32, 0x73, 0xDE, 0xF2, 0xC0, 0xC8,
  0x95, 0xEC, 0x30, 0xB2, 0x51, 0xC3, 0xE1, 0xA0,
  0x9E, 0xE6, 0x9D, 0xCF, 0xFA, 0x7F, 0x14, 0xD1,
  0xCE, 0xB8, 0xDC, 0xC3, 0x4A, 0x67, 0x93, 0xD6,
  0x28, 0xC2, 0x91, 0x70, 0xCA, 0x8D, 0xA2, 0xA4,
  0xF0, 0x08, 0x61, 0x90, 0x7E, 0x6F, 0xA2, 0xE0,
  0xEB, 0xAE, 0x3E, 0xB6, 0x67, 0xC7, 0x92, 0xF4,
  0x91, 0xB5, 0xF6, 0x6C, 0x5E, 0x84, 0x40, 0xF7,
  0xF3, 0x1B, 0x02, 0x7F, 0xD5, 0xAB, 0x41, 0x89,
  0x28, 0xF4, 0x25, 0xCC, 0x52, 0x11, 0xAD, 0x43,
  0x68, 0xA6, 0x41, 0x8B, 0x84, 0xB5, 0xFF, 0x2C,
  0x92, 0x4A, 0x26, 0xD8, 0x47, 0x6A, 0x7C, 0x95,
  0x61, 0xCC, 0xE6, 0xCB, 0xBB, 0x3F, 0x47, 0x58,
  0x89, 0x75, 0xC3, 0x75, 0xA1, 0xD9, 0xAF, 0xCC,
  0x08, 0x73, 0x17, 0xDC, 0xAA, 0x9A, 0xA2, 0x16,
  0x41, 0xD8, 0xA2, 0x06, 0xC6, 0x8B, 0xFC, 0x66,
  0x34, 0x9F, 0xCF, 0x18, 0x23, 0xA0, 0x0A, 0x74,
  0xE7, 0x2B, 0x27, 0x70, 0x92, 0xE9, 0xAF, 0x37,
  0xE6, 0x8C, 0xA7, 0xBC, 0x62, 0x65, 0x9C, 0xC2,
  0x08, 0xC9, 0x88, 0xB3, 0xF3, 0x43, 0xAC, 0x74,
  0x2C, 0x0F, 0xD4, 0xAF, 0xA1, 0xC3, 0x01, 0x64,
  0x95, 0x4E, 0x48, 0x9F, 0xF4, 0x35, 0x78, 0x95,
  0x7A, 0x39, 0xD6, 0x6A, 0xA0, 0x6D, 0x40, 0xE8,
  0x4F, 0xA8, 0xEF, 0x11, 0x1D, 0xF3, 0x1B, 0x3F,
  0x3F, 0x07, 0xDD, 0x6F, 0x5B, 0x19, 0x30, 0x19,
  0xFB, 0xEF, 0x0E, 0x37, 0xF0, 0x0E, 0xCD, 0x16,
  0x49, 0xFE, 0x53, 0x47, 0x13, 0x1A, 0xBD, 0xA4,
  0xF1, 0x40, 0x19, 0x60, 0x0E, 0xED, 0x68, 0x09,
  0x06, 0x5F, 0x4D, 0xCF, 0x3D, 0x1A, 0xFE, 0x20,
  0x77, 0xE4, 0xD9, 0xDA, 0xF9, 0xA4, 0x2B, 0x76,
  0x1C, 0x71, 0xDB, 0x00, 0xBC, 0xFD, 0x0C, 0x6C,
  0xA5, 0x47, 0xF7, 0xF6, 0x00, 0x79, 0x4A, 0x11,
])

export class QmcStaticCipher implements QmcStreamCipher {
  decrypt(buf: Uint8Array, offset: number): void {
    for (let i = 0; i < buf.length; i++) {
      let pos = offset + i
      if (pos > 0x7fff) pos %= 0x7fff
      buf[i] ^= STATIC_CIPHER_BOX[(pos * pos + 27) & 0xff]
    }
  }
}

// ============== Map cipher ==============

export class QmcMapCipher implements QmcStreamCipher {
  private readonly key: Uint8Array
  private readonly n: number

  constructor(key: Uint8Array) {
    if (key.length === 0) throw new Error('qmc/cipher_map: invalid key size')
    this.key = key
    this.n = key.length
  }

  decrypt(buf: Uint8Array, offset: number): void {
    for (let i = 0; i < buf.length; i++) {
      let pos = offset + i
      if (pos > 0x7fff) pos %= 0x7fff
      const idx = (pos * pos + 71214) % this.n
      const value = this.key[idx]
      // rotate 8-bit
      const rotate = (idx & 7) + 4
      const rotated = ((value << (rotate % 8)) | (value >>> (rotate % 8))) & 0xff
      buf[i] ^= rotated
    }
  }
}

// ============== RC4 cipher（分段：前 128 字节 + 对齐到 5120 字节段） ==============

const RC4_FIRST_SEGMENT_SIZE = 0x80
const RC4_SEGMENT_SIZE = 5120

export class QmcRC4Cipher implements QmcStreamCipher {
  private readonly key: Uint8Array
  private readonly n: number
  private readonly s: Uint8Array
  private readonly hash: number

  constructor(key: Uint8Array) {
    if (key.length === 0) throw new Error('qmc/cipher_rc4: invalid key size')
    this.key = key
    this.n = key.length

    // 初始化 S box
    const s = new Uint8Array(this.n)
    for (let i = 0; i < this.n; i++) s[i] = i & 0xff
    let j = 0
    for (let i = 0; i < this.n; i++) {
      j = (s[i] + j + key[i % this.n]) % this.n
      const tmp = s[i]
      s[i] = s[j]
      s[j] = tmp
    }
    this.s = s

    // 初始化 hash 基数
    let hash = 1
    for (let i = 0; i < this.n; i++) {
      const v = key[i]
      if (!v) continue
      const next = (hash * v) >>> 0
      if (next === 0 || next <= hash) break
      hash = next
    }
    this.hash = hash
  }

  decrypt(buf: Uint8Array, offset: number): void {
    let toProcess = buf.length
    let processed = 0
    const advance = (len: number) => {
      toProcess -= len
      processed += len
      offset += len
    }

    // 初始段（前 0x80 字节）
    if (offset < RC4_FIRST_SEGMENT_SIZE) {
      const len = Math.min(buf.length, RC4_FIRST_SEGMENT_SIZE - offset)
      this.encFirstSegment(buf.subarray(0, len), offset)
      advance(len)
      if (toProcess === 0) return
    }

    // 对齐到下一个 5120 字节边界
    if (offset % RC4_SEGMENT_SIZE !== 0) {
      const len = Math.min(RC4_SEGMENT_SIZE - (offset % RC4_SEGMENT_SIZE), toProcess)
      this.encSegment(buf.subarray(processed, processed + len), offset)
      advance(len)
      if (toProcess === 0) return
    }

    // 批量完整段
    while (toProcess > RC4_SEGMENT_SIZE) {
      this.encSegment(buf.subarray(processed, processed + RC4_SEGMENT_SIZE), offset)
      advance(RC4_SEGMENT_SIZE)
    }

    // 末尾不完整段
    if (toProcess > 0) {
      this.encSegment(buf.subarray(processed), offset)
    }
  }

  private encFirstSegment(buf: Uint8Array, offset: number): void {
    for (let i = 0; i < buf.length; i++) {
      buf[i] ^= this.key[this.getSegmentKey(offset + i)]
    }
  }

  private encSegment(buf: Uint8Array, offset: number): void {
    const S = this.s.slice(0)
    const skipLen = (offset % RC4_SEGMENT_SIZE) + this.getSegmentKey(Math.floor(offset / RC4_SEGMENT_SIZE))
    let j = 0
    let k = 0
    for (let i = -skipLen; i < buf.length; i++) {
      j = (j + 1) % this.n
      k = (S[j] + k) % this.n
      const tmp = S[k]
      S[k] = S[j]
      S[j] = tmp
      if (i >= 0) {
        buf[i] ^= S[(S[j] + S[k]) % this.n]
      }
    }
  }

  private getSegmentKey(id: number): number {
    const seed = this.key[id % this.n]
    const idx = Math.floor((this.hash / ((id + 1) * seed)) * 100.0)
    return idx % this.n
  }
}
