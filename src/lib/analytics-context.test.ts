import assert from 'node:assert/strict'
import test from 'node:test'
import { currentSiteHost, normalizeSiteHost } from './analytics-context.js'

test('normalizes the analytics site host without guessing a formal domain', () => {
  assert.equal(normalizeSiteHost(' ShiyinMP3.com. '), 'shiyinmp3.com')
  assert.equal(normalizeSiteHost('sleepno.cn'), 'sleepno.cn')
  assert.equal(normalizeSiteHost('preview.shiyinmp3.com'), 'preview.shiyinmp3.com')
  assert.equal(normalizeSiteHost(undefined), 'unknown')
})

test('reads the current page hostname for the common event field', () => {
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { hostname: 'sleepno.cn' },
  })
  try {
    assert.equal(currentSiteHost(), 'sleepno.cn')
  } finally {
    Reflect.deleteProperty(globalThis, 'location')
  }
})
