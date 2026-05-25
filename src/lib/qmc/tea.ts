/**
 * TEA cipher (Tiny Encryption Algorithm)
 *
 * 移植自 unlock-music（MIT）`src/utils/tea.ts`，原本是 Go 标准库 golang.org/x/crypto/tea 的 TS port。
 * 仅供 QQ 音乐 QMCv2 key 派生（CBC 模式自定义包裹）使用。
 *
 * TEA 是遗留密码，块大小仅 8 字节，不应用于新设计；这里只为兼容 QQ 音乐文件格式。
 */

const DELTA = 0x9e3779b9
const DEFAULT_ROUNDS = 64

export class TeaCipher {
  static readonly BlockSize = 8
  static readonly KeySize = 16

  private readonly k0: number
  private readonly k1: number
  private readonly k2: number
  private readonly k3: number
  private readonly rounds: number

  constructor(key: Uint8Array, rounds: number = DEFAULT_ROUNDS) {
    if (key.length !== 16) {
      throw new Error('TEA: incorrect key size')
    }
    if ((rounds & 1) !== 0) {
      throw new Error('TEA: odd number of rounds')
    }
    const k = new DataView(key.buffer, key.byteOffset, key.byteLength)
    this.k0 = k.getUint32(0, false)
    this.k1 = k.getUint32(4, false)
    this.k2 = k.getUint32(8, false)
    this.k3 = k.getUint32(12, false)
    this.rounds = rounds
  }

  encrypt(dst: DataView, src: DataView): void {
    let v0 = src.getUint32(0, false)
    let v1 = src.getUint32(4, false)
    let sum = 0
    for (let i = 0; i < this.rounds / 2; i++) {
      sum = (sum + DELTA) | 0
      v0 = (v0 + (((v1 << 4) + this.k0) ^ (v1 + sum) ^ ((v1 >>> 5) + this.k1))) | 0
      v1 = (v1 + (((v0 << 4) + this.k2) ^ (v0 + sum) ^ ((v0 >>> 5) + this.k3))) | 0
    }
    dst.setUint32(0, v0 >>> 0, false)
    dst.setUint32(4, v1 >>> 0, false)
  }

  decrypt(dst: DataView, src: DataView): void {
    let v0 = src.getUint32(0, false)
    let v1 = src.getUint32(4, false)
    // sum 起步 = delta * rounds / 2，但 JS 乘法会越界，必须保持 uint32 语义
    let sum = Math.imul(DELTA, this.rounds / 2) >>> 0
    for (let i = 0; i < this.rounds / 2; i++) {
      v1 = (v1 - (((v0 << 4) + this.k2) ^ (v0 + sum) ^ ((v0 >>> 5) + this.k3))) | 0
      v0 = (v0 - (((v1 << 4) + this.k0) ^ (v1 + sum) ^ ((v1 >>> 5) + this.k1))) | 0
      sum = (sum - DELTA) | 0
    }
    dst.setUint32(0, v0 >>> 0, false)
    dst.setUint32(4, v1 >>> 0, false)
  }
}
