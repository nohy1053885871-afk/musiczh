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
import { decryptXm } from '../xm'
import { readMetaFromBlob, writeM4aMeta } from './index'

const goldenPath = process.env.XM_GOLDEN_FILE

test(
  'XM M4A 写入 covr 时保持 AAC encoded packets 不变',
  { skip: !goldenPath },
  async () => {
    const sourceBytes = await readFile(goldenPath!)
    const source = await decryptXm(
      new File([sourceBytes], goldenPath!.split('/').pop()!),
    )
    assert.equal(source.format, 'm4a')

    const cover = new Blob([TEST_PNG], { type: 'image/png' })
    const tagged = await writeM4aMeta(source.audio, cover, source.meta)
    const parsed = await readMetaFromBlob(tagged, 'm4a')

    assert.equal(parsed.title, source.meta.musicName)
    assert.equal(parsed.artist, source.meta.artist?.[0]?.[0])
    assert.equal(parsed.album, source.meta.album)
    assert.equal(parsed.cover?.type, 'image/png')
    assert.deepEqual(
      new Uint8Array(await parsed.cover!.arrayBuffer()),
      TEST_PNG,
    )
    assert.deepEqual(
      await packetDigest(tagged),
      await packetDigest(source.audio),
    )
  },
)

async function packetDigest(blob: Blob) {
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  })
  try {
    const track = await input.getPrimaryAudioTrack()
    assert.ok(track)
    const sink = new EncodedPacketSink(track)
    const hash = createHash('sha256')
    let count = 0
    let bytes = 0
    for await (const packet of sink.packets()) {
      hash.update(packet.data)
      count++
      bytes += packet.data.length
    }
    return { count, bytes, sha256: hash.digest('hex') }
  } finally {
    input.dispose()
  }
}

const TEST_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137,
  0, 0, 0, 13, 73, 68, 65, 84, 8, 215, 99, 248, 207, 192, 240,
  31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69,
  78, 68, 174, 66, 96, 130,
])
