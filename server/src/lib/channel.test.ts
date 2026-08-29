import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyChannel } from './channel.js'

test('两个正式域名及其子域名都归类为站内', () => {
  for (const referrer of [
    'https://sleepno.cn/',
    'https://www.sleepno.cn/help',
    'https://shiyinmp3.com/',
    'https://preview.shiyinmp3.com/admin/',
  ]) {
    assert.equal(classifyChannel(referrer), '站内')
  }
})

test('相似恶意域名不会被误判为站内', () => {
  assert.equal(classifyChannel('https://evilsleepno.cn/'), '外部网站')
  assert.equal(classifyChannel('https://shiyinmp3.com.evil.example/'), '外部网站')
})

test('保留直接访问、搜索、社交和非法来源分类', () => {
  assert.equal(classifyChannel(null), '直接访问')
  assert.equal(classifyChannel('https://www.google.com/search?q=music'), '搜索引擎')
  assert.equal(classifyChannel('https://www.zhihu.com/question/1'), '社交')
  assert.equal(classifyChannel('not a url'), '其他')
})
