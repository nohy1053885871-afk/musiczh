import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeSiteHost,
  resolveEventSiteHost,
  resolveHomepageAnnouncementSiteHost,
} from './siteHost.js'

test('normalizes host names and ports', () => {
  assert.equal(normalizeSiteHost(' ShiyinMP3.com:443 '), 'shiyinmp3.com')
  assert.equal(normalizeSiteHost('sleepno.cn.'), 'sleepno.cn')
  assert.equal(normalizeSiteHost(''), null)
})

test('uses the trusted Cloudflare forwarded host over the reported value', () => {
  assert.equal(resolveEventSiteHost({
    requestHost: 'origin.shiyinmp3.com',
    forwardedHost: 'shiyinmp3.com',
    trustForwardedHost: true,
    reportedHost: 'sleepno.cn',
  }), 'shiyinmp3.com')
})

test('uses the direct formal host and rejects a spoofed formal report', () => {
  assert.equal(resolveEventSiteHost({
    requestHost: 'sleepno.cn',
    forwardedHost: 'shiyinmp3.com',
    trustForwardedHost: false,
    reportedHost: 'shiyinmp3.com',
  }), 'sleepno.cn')
  assert.equal(resolveEventSiteHost({
    requestHost: '127.0.0.1:8787',
    forwardedHost: null,
    trustForwardedHost: false,
    reportedHost: 'shiyinmp3.com',
  }), '127.0.0.1')
})

test('keeps a non-production reported host for local diagnostics', () => {
  assert.equal(resolveEventSiteHost({
    requestHost: '127.0.0.1:8787',
    forwardedHost: null,
    trustForwardedHost: false,
    reportedHost: 'localhost',
  }), 'localhost')
})

test('resolves homepage announcement host from direct and trusted ingress', () => {
  assert.equal(resolveHomepageAnnouncementSiteHost({
    requestHost: 'sleepno.cn',
    forwardedHost: null,
    trustForwardedHost: false,
  }), 'sleepno.cn')
  assert.equal(resolveHomepageAnnouncementSiteHost({
    requestHost: 'origin.shiyinmp3.com',
    forwardedHost: 'shiyinmp3.com',
    trustForwardedHost: true,
  }), 'shiyinmp3.com')
})

test('maps Cloudflare aliases and keeps unknown production hosts closed', () => {
  for (const alias of [
    'www.shiyinmp3.com',
    'preview.shiyinmp3.com',
    'shiyinmp3.musiczh.workers.dev',
  ]) {
    assert.equal(resolveHomepageAnnouncementSiteHost({
      requestHost: alias,
      forwardedHost: null,
      trustForwardedHost: false,
    }), 'shiyinmp3.com')
  }
  assert.equal(resolveHomepageAnnouncementSiteHost({
    requestHost: 'unknown.example',
    forwardedHost: null,
    trustForwardedHost: false,
  }), null)
  assert.equal(resolveHomepageAnnouncementSiteHost({
    requestHost: 'localhost:8787',
    forwardedHost: null,
    trustForwardedHost: false,
    allowLocalFallback: true,
  }), 'shiyinmp3.com')
})
