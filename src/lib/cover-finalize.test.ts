import assert from 'node:assert/strict'
import test from 'node:test'
import { CoverFinalizer, needsRemoteCoverFinalization } from './cover-finalize'
import type { DecryptResult } from './types'

test('所有有远程地址的无封面文件都进入收尾', () => {
  assert.equal(needsRemoteCoverFinalization(result('mp3', true)), true)
  assert.equal(needsRemoteCoverFinalization(result('flac', true)), true)
  assert.equal(needsRemoteCoverFinalization(result('m4a', true)), true)
  assert.equal(needsRemoteCoverFinalization(result('ogg', true)), true)
  assert.equal(needsRemoteCoverFinalization(result('mp3', false)), false)
  assert.equal(
    needsRemoteCoverFinalization({ ...result('mp3', true), cover: new Blob(['cover']) }),
    false,
  )
})

test('OGG 没有安全写回器时明确降级，不把音频标成失败', async () => {
  const source = result('ogg', true)
  const outcome = await new CoverFinalizer().enqueue(source)
  assert.equal(outcome.ok, false)
  assert.equal(outcome.result, source)
  if (!outcome.ok) assert.equal(outcome.errorCode, 'COVER_TAG_WRITE_FAILED')
})

test('封面任务并发不超过 3', async () => {
  let active = 0
  let peak = 0
  const finalizer = new CoverFinalizer(async (input) => {
    active++
    peak = Math.max(peak, active)
    await delay(20)
    active--
    return { ok: true as const, result: input }
  }, 3, 500)
  await Promise.all(Array.from({ length: 8 }, (_, i) => (
    finalizer.enqueue(result('mp3', true, String(i)))
  )))
  assert.equal(peak, 3)
})

test('总期限从入队开始计算，包含排队时间', async () => {
  const started: string[] = []
  const finalizer = new CoverFinalizer(async (input) => {
    started.push(input.meta.musicName || '')
    await delay(80)
    return { ok: true as const, result: input }
  }, 1, 35)
  const [first, second] = await Promise.all([
    finalizer.enqueue(result('mp3', true, 'first')),
    finalizer.enqueue(result('mp3', true, 'second')),
  ])
  assert.equal(first.ok, false)
  assert.equal(second.ok, false)
  if (!first.ok) assert.equal(first.errorCode, 'COVER_TIMEOUT')
  if (!second.ok) assert.equal(second.errorCode, 'COVER_TIMEOUT')
  assert.deepEqual(started, ['first'])
})

test('超时后的迟到成功结果被丢弃', async () => {
  const source = result('mp3', true, 'late')
  const late = { ...source, suggestedName: 'late-success.mp3' }
  const finalizer = new CoverFinalizer(async () => {
    await delay(60)
    return { ok: true as const, result: late }
  }, 1, 20)
  const outcome = await finalizer.enqueue(source)
  assert.equal(outcome.ok, false)
  assert.equal(outcome.result.suggestedName, source.suggestedName)
  await delay(70)
  assert.equal(outcome.result.suggestedName, source.suggestedName)
})

function result(
  format: DecryptResult['format'],
  remote: boolean,
  name = 'test',
): DecryptResult {
  return {
    audio: new Blob([Uint8Array.of(0xff, 0xfb, 0x90, 0x64)]),
    format,
    meta: {
      musicName: name,
      albumPic: remote ? 'https://example.com/cover.jpg' : undefined,
    },
    cover: null,
    suggestedName: `${name}.${format}`,
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
