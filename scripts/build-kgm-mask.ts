/**
 * 一次性脚本：把 KGM v2 完整 73MB MASK_LARGE 切片成 13MB 并 gzip，
 * 写到 public/kgm-v2-mask.bin，把 KGM/VPR 解密的单文件上限从 100MB 扩到 200MB。
 *
 * 用法：
 *   npx tsx scripts/build-kgm-mask.ts <path-to-full-73mb-mask>
 *
 * 步骤：
 *   1. 读取入参指定的完整 MASK_LARGE 原始字节流（73MB），不含任何 header
 *   2. 校验前 6,815,744 字节（6.5MB）与现有 public/kgm-v2-mask.bin 解压后一致——
 *      防止换错文件 / 字节序错位 / 偏移不对
 *   3. 切前 13 * 1024 * 1024 = 13,631,488 字节
 *   4. gzip -9 写出到 public/kgm-v2-mask.bin
 *   5. 提示同步把 src/lib/kgm.ts 里 MASK_LARGE_RAW_BYTES 改成 13 * 1024 * 1024
 *
 * 73MB MASK_LARGE 来源：KGM v2 公开常量；网上能找到，但本仓不便落盘。
 * 找到后用 sha256 比对前 6.5MB 应与现有 mask 一致。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

const TARGET_RAW_BYTES = 13 * 1024 * 1024 // 13 MB → 覆盖 200MB 加密音频
const OLD_RAW_BYTES = 6 * 1024 * 1024 + 512 * 1024 // 现有 1.1MB gzip 解压后 6.5MB

function main() {
  const arg = process.argv[2]
  if (!arg) {
    console.error('用法：npx tsx scripts/build-kgm-mask.ts <path-to-full-73mb-mask>')
    process.exit(1)
  }
  const root = resolve(import.meta.dirname, '..')
  const oldGz = readFileSync(resolve(root, 'public/kgm-v2-mask.bin'))
  const oldRaw = gunzipSync(oldGz)
  if (oldRaw.byteLength !== OLD_RAW_BYTES) {
    console.error(`现有 mask 解压后字节数 ${oldRaw.byteLength} 与预期 ${OLD_RAW_BYTES} 不一致；请检查 public/kgm-v2-mask.bin`)
    process.exit(2)
  }

  const fullRaw = readFileSync(resolve(arg))
  if (fullRaw.byteLength < TARGET_RAW_BYTES) {
    console.error(`输入 mask 字节数 ${fullRaw.byteLength} 小于目标 ${TARGET_RAW_BYTES}；至少要 13MB`)
    process.exit(3)
  }
  // 校验前 6.5MB 与现有 mask 完全一致
  for (let i = 0; i < OLD_RAW_BYTES; i++) {
    if (fullRaw[i] !== oldRaw[i]) {
      console.error(`输入 mask 第 ${i} 字节 (0x${fullRaw[i].toString(16)}) 与现有 mask (0x${oldRaw[i].toString(16)}) 不一致——可能是错位 / 字节序 / 来源不对`)
      process.exit(4)
    }
  }

  const sliced = fullRaw.subarray(0, TARGET_RAW_BYTES)
  const gz = gzipSync(sliced, { level: 9 })
  const outPath = resolve(root, 'public/kgm-v2-mask.bin')
  writeFileSync(outPath, gz)
  console.log(`✓ 已写入 ${outPath}`)
  console.log(`  raw ${TARGET_RAW_BYTES} bytes → gzip ${gz.byteLength} bytes`)
  console.log(`记得同步把 src/lib/kgm.ts 里 MASK_LARGE_RAW_BYTES 改成 13 * 1024 * 1024`)
}

main()
