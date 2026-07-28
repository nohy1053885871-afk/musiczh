import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { isMp3CompatibleJpeg } from './cover-normalize'

const JPEG_SOI = [0xff, 0xd8]
const JFIF_APP0 = [
  0xff, 0xe0, 0x00, 0x10,
  0x4a, 0x46, 0x49, 0x46, 0x00,
  0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
]
const BASELINE_SOF0 = [
  0xff, 0xc0, 0x00, 0x0b,
  0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
]
const PROGRESSIVE_SOF2 = [
  0xff, 0xc2, 0x00, 0x0b,
  0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
]
const ADOBE_APP14 = [
  0xff, 0xee, 0x00, 0x07, 0x41, 0x64, 0x6f, 0x62, 0x65,
]
const SOS = [0xff, 0xda]

test('JFIF Baseline JPEG 可直接写入 MP3 APIC', async () => {
  const fixture = new Uint8Array([
    ...JPEG_SOI,
    ...JFIF_APP0,
    ...BASELINE_SOF0,
    ...SOS,
  ])
  assert.equal(isMp3CompatibleJpeg(fixture), true)

  const path = process.env.MP3_COMPATIBLE_COVER_FILE
  if (!path) return
  assert.equal(
    isMp3CompatibleJpeg(new Uint8Array(await readFile(path))),
    true,
  )
})

test('Progressive 或 Adobe JPEG 必须归一化后再写 APIC', async () => {
  const progressive = new Uint8Array([
    ...JPEG_SOI,
    ...JFIF_APP0,
    ...PROGRESSIVE_SOF2,
    ...SOS,
  ])
  const adobe = new Uint8Array([
    ...JPEG_SOI,
    ...JFIF_APP0,
    ...ADOBE_APP14,
    ...BASELINE_SOF0,
    ...SOS,
  ])
  assert.equal(isMp3CompatibleJpeg(progressive), false)
  assert.equal(isMp3CompatibleJpeg(adobe), false)

  const path = process.env.MP3_INCOMPATIBLE_COVER_FILE
  if (!path) return
  assert.equal(
    isMp3CompatibleJpeg(new Uint8Array(await readFile(path))),
    false,
  )
})
