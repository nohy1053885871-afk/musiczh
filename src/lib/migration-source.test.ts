import assert from 'node:assert/strict'
import test from 'node:test'
import { readMigrationSource } from './migration-source.js'

test('目标主域识别旧域迁移来源，并只移除内部来源参数', () => {
  assert.deepEqual(
    readMigrationSource(
      'https://shiyinmp3.com/guide/ncm?a=1&migration_source=sleepno#step',
    ),
    {
      source: 'sleepno',
      cleanedRelativeUrl: '/guide/ncm?a=1#step',
    },
  )
})

test('重复来源参数中只要包含 sleepno 就识别并全部清理', () => {
  assert.deepEqual(
    readMigrationSource(
      'https://shiyinmp3.com/?migration_source=other&migration_source=sleepno',
    ),
    { source: 'sleepno', cleanedRelativeUrl: '/' },
  )
})

test('非目标主域、未知来源和非法 URL 均不归因也不改地址', () => {
  for (const href of [
    'https://sleepno.cn/?migration_source=sleepno',
    'https://shiyinmp3.com/?migration_source=other',
    'not-a-url',
  ]) {
    assert.deepEqual(readMigrationSource(href), {
      source: null,
      cleanedRelativeUrl: null,
    })
  }
})

test('仅在显式本地开发模式下允许 localhost 完成端到端验收', () => {
  const href = 'http://127.0.0.1:5173/test?migration_source=sleepno'
  assert.deepEqual(readMigrationSource(href), {
    source: null,
    cleanedRelativeUrl: null,
  })
  assert.deepEqual(readMigrationSource(href, true), {
    source: 'sleepno',
    cleanedRelativeUrl: '/test',
  })
})
