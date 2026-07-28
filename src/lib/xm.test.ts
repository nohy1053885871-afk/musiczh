import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import aesjs from 'aes-js'
import { decryptAudioFile, SUPPORTED_EXT_REGEX } from './decrypt'
import { decryptXm } from './xm'
import { sniffRealFormat } from './sniff'
import { DecryptError, type AudioFormat } from './types'

const OUTER_KEY = new TextEncoder().encode(
  'ximalayaximalayaximalayaximalaya',
)
const INNER_SEED = '123456781234567812345678'
const IV_HEX = 'eae7664720fe3039fbda3f54f6cd2024'
const TRACK_ID = '1001037749'

const PAYLOADS: Record<AudioFormat, Uint8Array> = {
  mp3: Uint8Array.from([
    0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xff, 0xfb, 0x90, 0x64, 1, 2, 3, 4,
  ]),
  flac: Uint8Array.from([
    0x66, 0x4c, 0x61, 0x43, 0x80, 0x00, 0x00, 0x22,
    ...new Uint8Array(34),
    1, 2, 3, 4,
  ]),
  ogg: Uint8Array.from([
    0x4f, 0x67, 0x67, 0x53, 0x00, 0x02, 0, 0, 0, 0, 0, 0,
    1, 2, 3, 4,
  ]),
  m4a: Uint8Array.from([
    0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70,
    0x4d, 0x34, 0x41, 0x20, 0x00, 0x00, 0x02, 0x00,
    0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x32,
    1, 2, 3, 4, 5, 6, 7, 8,
  ]),
}

for (const format of ['mp3', 'flac', 'ogg', 'm4a'] as const) {
  test(`XM v2 按真实 magic 输出 ${format}`, async () => {
    const payload = PAYLOADS[format]
    const file = buildXm(payload)
    const result = await decryptXm(file)
    assert.equal(result.format, format)
    assert.equal(result.meta.source, 'xm')
    assert.equal(result.meta.format, format)
    assert.equal(result.meta.musicName, 'XM 测试')
    assert.equal(
      result.meta.albumPic,
      'https://imagev2.xmcdn.com/test-cover.jpg',
    )
    assert.deepEqual(
      new Uint8Array(await result.audio.arrayBuffer()),
      payload,
    )
  })
}

test('普通 ID3 MP3 不误判为 XM', async () => {
  const mp3 = new File([ownedBuffer(PAYLOADS.mp3)], 'normal.mp3')
  assert.equal(await sniffRealFormat(mp3), 'mp3')
})

test('原始 M4A 通过上传准入并按 magic 识别', async () => {
  const m4a = new File([ownedBuffer(PAYLOADS.m4a)], 'direct-upload.m4a')
  assert.equal(SUPPORTED_EXT_REGEX.test(m4a.name), true)
  assert.equal(await sniffRealFormat(m4a), 'm4a')
})

test('XM 内容即使改后缀仍按特征识别', async () => {
  const xm = buildXm(PAYLOADS.m4a, 'renamed.mp3')
  assert.equal(await sniffRealFormat(xm), 'xm')
})

test('XM v12 返回精准不支持错误', async () => {
  const xm = buildXm(PAYLOADS.m4a, 'v12.xm', 'v12')
  await assert.rejects(
    decryptXm(xm),
    (error: unknown) =>
      error instanceof DecryptError &&
      error.code === 'XM_VERSION_UNSUPPORTED',
  )
})

test('XM 解出未知 magic 时不放出乱码', async () => {
  const xm = buildXm(Uint8Array.from({ length: 64 }, (_, i) => i + 1))
  await assert.rejects(
    decryptXm(xm),
    (error: unknown) =>
      error instanceof DecryptError &&
      error.code === 'OUTPUT_NOT_AUDIO',
  )
})

test('截断 XM 返回解析错误', async () => {
  const full = buildXm(PAYLOADS.m4a)
  const truncated = new File(
    [await full.slice(0, full.size - 20).arrayBuffer()],
    'truncated.xm',
  )
  await assert.rejects(
    decryptXm(truncated),
    (error: unknown) =>
      error instanceof DecryptError &&
      error.code === 'XM_PARSE_FAILED',
  )
})

test('VPR 扩展名仍分发到 KGM/VPR 解密器', async () => {
  const bytes = new Uint8Array(0x400)
  bytes.set([
    0x05, 0x28, 0xbc, 0x96, 0xe9, 0xe4, 0x5a, 0x43,
    0x91, 0xaa, 0xbd, 0xd0, 0x7a, 0xf5, 0x36, 0x31,
  ])
  // header_len == file.size，解密器应返回自己的头错误；若分发回归
  // 成未知格式，这里会变成 UNSUPPORTED_FORMAT。
  bytes.set([0x00, 0x04, 0x00, 0x00], 0x10)
  const file = new File([ownedBuffer(bytes)], 'contract.vpr')
  await assert.rejects(
    decryptAudioFile(file),
    (error: unknown) =>
      error instanceof DecryptError &&
      error.code === 'INVALID_HEADER' &&
      error.message === '文件头长度异常',
  )
})

const goldenPath = process.env.XM_GOLDEN_FILE
test(
  '用户 XM 黄金样本输出稳定',
  { skip: !goldenPath },
  async () => {
    const bytes = await readFile(goldenPath!)
    const file = new File([bytes], goldenPath!.split('/').pop()!)
    const result = await decryptXm(file)
    const output = new Uint8Array(await result.audio.arrayBuffer())
    assert.equal(result.format, 'm4a')
    assert.equal(output.length, 5_545_216)
    assert.equal(
      createHash('sha256').update(output).digest('hex'),
      'c61bbb2f9dc5073299958caf39d7f4be359a9c07a7a36b27a762e6caee9a16eb',
    )
    assert.equal(result.meta.duration, 342)
    assert.match(
      result.meta.albumPic ?? '',
      /^https:\/\/imagev2\.xmcdn\.com\/storages\/.+\.jpe?g$/i,
    )
  },
)

function buildXm(
  payload: Uint8Array,
  name = 'test.xm',
  version = 'v2',
): File {
  const restoredLength = Math.min(payload.length, 32)
  const restoredHead = payload.subarray(0, restoredLength)
  const tail = payload.subarray(restoredLength)
  const restoredBase64 = toBase64(restoredHead)
  const split = Math.min(16, restoredBase64.length)
  const headerPrefix = restoredBase64.slice(0, split)
  const headerSuffix = restoredBase64.slice(split)

  const innerKeyText =
    INNER_SEED.slice(0, 24 - TRACK_ID.length) + TRACK_ID
  const innerKey = new TextEncoder().encode(innerKeyText)
  const innerEncrypted = encryptCbcPkcs7(
    new TextEncoder().encode(headerSuffix),
    innerKey,
    innerKey.subarray(0, 16),
  )
  const outerPlain = new TextEncoder().encode(toBase64(innerEncrypted))
  const encrypted = encryptCbcPkcs7(
    outerPlain,
    OUTER_KEY,
    aesjs.utils.hex.toBytes(IV_HEX),
  )

  const frames = [
    textFrame('TIT2', 'XM 测试'),
    textFrame('TPE1', '测试主播'),
    textFrame('TALB', '测试专辑'),
    malformedXmCommentFrame('//imagev2.xmcdn.com/test-cover.jpg'),
    textFrame('TLEN', '12'),
    textFrame('TRCK', TRACK_ID),
    textFrame('TCOM', version),
    textFrame('TSIZ', String(encrypted.length)),
    textFrame('TSSE', headerPrefix),
    textFrame('TENC', IV_HEX),
  ]
  const tagBody = concat(frames)
  const id3 = concat([
    Uint8Array.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00]),
    syncsafe(tagBody.length),
    tagBody,
  ])
  return new File(
    [ownedBuffer(id3), ownedBuffer(encrypted), ownedBuffer(tail)],
    name,
  )
}

function ownedBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer
}

function textFrame(id: string, value: string): Uint8Array {
  const text = new TextEncoder().encode(value)
  const payload = concat([Uint8Array.of(3), text])
  const size = Uint8Array.of(
    (payload.length >>> 24) & 0xff,
    (payload.length >>> 16) & 0xff,
    (payload.length >>> 8) & 0xff,
    payload.length & 0xff,
  )
  return concat([
    new TextEncoder().encode(id),
    size,
    Uint8Array.of(0, 0),
    payload,
  ])
}

function malformedXmCommentFrame(url: string): Uint8Array {
  const utf16le = new Uint8Array(url.length * 2)
  for (let i = 0; i < url.length; i++) {
    const code = url.charCodeAt(i)
    utf16le[i * 2] = code & 0xff
    utf16le[i * 2 + 1] = code >>> 8
  }
  // 复刻真实 XM：2 字节 language "en" 后提前写 BOM，随后空 description + URL BOM。
  const payload = concat([
    Uint8Array.of(1, 0x65, 0x6e, 0xff, 0xfe, 0, 0, 0xff, 0xfe),
    utf16le,
  ])
  const size = Uint8Array.of(
    (payload.length >>> 24) & 0xff,
    (payload.length >>> 16) & 0xff,
    (payload.length >>> 8) & 0xff,
    payload.length & 0xff,
  )
  return concat([
    new TextEncoder().encode('COMM'),
    size,
    Uint8Array.of(0, 0),
    payload,
  ])
}

function encryptCbcPkcs7(
  plain: Uint8Array,
  key: Uint8Array,
  iv: Uint8Array,
): Uint8Array {
  const cipher = new aesjs.ModeOfOperation.cbc(key, iv)
  return cipher.encrypt(aesjs.padding.pkcs7.pad(plain))
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function syncsafe(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 21) & 0x7f,
    (value >>> 14) & 0x7f,
    (value >>> 7) & 0x7f,
    value & 0x7f,
  )
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
