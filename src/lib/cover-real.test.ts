import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  ALL_FORMATS,
  BlobSource,
  EncodedPacketSink,
  Input,
} from 'mediabunny'
import { CoverFinalizer } from './cover-finalize'
import { readMetaFromBlob } from './metadata'
import { decryptNcm } from './ncm'
import { decryptXm } from './xm'

const ncmPath = process.env.NCM_COVER_GOLDEN_FILE
const xmPaths = [
  process.env.XM_GOLDEN_FILE,
  process.env.XM_GOLDEN_FILE_2,
].filter((path): path is string => !!path)

test('真实 NCM 回填 APIC 且 MPEG 音频帧不变', { skip: !ncmPath }, async () => {
  const bytes = await readFile(ncmPath!)
  const source = await decryptNcm(new File([bytes], fileName(ncmPath!)))
  assert.equal(source.format, 'mp3')
  assert.equal(source.cover, null)
  assert.match(source.meta.albumPic || '', /^https?:\/\/p\d+\.music\.126\.net\//)

  const startedAt = performance.now()
  const outcome = await new CoverFinalizer().enqueue(source)
  const elapsedMs = performance.now() - startedAt
  assert.equal(outcome.ok, true)
  assert.ok(elapsedMs <= 2050, `封面收尾耗时 ${elapsedMs.toFixed(1)}ms`)
  const parsed = await readMetaFromBlob(outcome.result.audio, 'mp3')
  assert.ok(parsed.cover)
  assert.equal(await mpegDigest(outcome.result.audio), await mpegDigest(source.audio))
})

for (const [index, xmPath] of xmPaths.entries()) {
  test(`真实 XM ${index + 1} 回填 covr 且 AAC packets 不变`, async () => {
    const bytes = await readFile(xmPath)
    const source = await decryptXm(new File([bytes], fileName(xmPath)))
    assert.equal(source.format, 'm4a')
    assert.match(source.meta.albumPic || '', /^https?:\/\/imagev2\.xmcdn\.com\//)

    const startedAt = performance.now()
    const outcome = await new CoverFinalizer().enqueue(source)
    const elapsedMs = performance.now() - startedAt
    assert.equal(outcome.ok, true)
    assert.ok(elapsedMs <= 2050, `封面收尾耗时 ${elapsedMs.toFixed(1)}ms`)
    const parsed = await readMetaFromBlob(outcome.result.audio, 'm4a')
    assert.ok(parsed.cover)
    assert.deepEqual(
      await packetDigest(outcome.result.audio),
      await packetDigest(source.audio),
    )
  })
}

async function mpegDigest(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let off = 0
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    off = 10 +
      ((bytes[6] & 0x7f) << 21) +
      ((bytes[7] & 0x7f) << 14) +
      ((bytes[8] & 0x7f) << 7) +
      (bytes[9] & 0x7f)
  }
  return createHash('sha256').update(bytes.subarray(off)).digest('hex')
}

async function packetDigest(blob: Blob) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    const hash = createHash('sha256')
    let count = 0
    for await (const packet of sink.packets()) {
      hash.update(packet.data)
      count++
    }
    return { count, sha256: hash.digest('hex') }
  } finally {
    input.dispose()
  }
}

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}
