import test from 'node:test'
import assert from 'node:assert/strict'
import {
  compareBrowserVersions,
  detectBrowserCompatibility,
  type BrowserNavigatorInfo,
} from './browser-compat'

const chrome = (version: string): BrowserNavigatorInfo => ({
  userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/${version}.0.0.0 Safari/537.36`,
})

const edge = (version: string): BrowserNavigatorInfo => ({
  userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/${version}.0.0.0 Safari/537.36 Edg/${version}.0.0.0`,
})

const firefox = (version: string): BrowserNavigatorInfo => ({
  userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:${version}.0) Gecko/20100101 Firefox/${version}.0`,
})

const safari = (version: string): BrowserNavigatorInfo => ({
  userAgent: `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/${version} Safari/605.1.15`,
})

test('版本比较按数字段判断，不按字符串字典序判断', () => {
  assert.equal(compareBrowserVersions('16.4', '16.4.0'), 0)
  assert.equal(compareBrowserVersions('16.10', '16.4'), 1)
  assert.equal(compareBrowserVersions('110', '111'), -1)
  assert.equal(compareBrowserVersions('not-a-version', '16.4'), null)
})

test('Chromium、Edge 与 Firefox 门槛前一版不支持，门槛版支持', () => {
  assert.equal(detectBrowserCompatibility(chrome('110')).status, 'unsupported')
  assert.equal(detectBrowserCompatibility(chrome('111')).status, 'supported')
  assert.equal(detectBrowserCompatibility(edge('110')).status, 'unsupported')
  assert.equal(detectBrowserCompatibility(edge('111')).status, 'supported')
  assert.equal(detectBrowserCompatibility(firefox('113')).status, 'unsupported')
  assert.equal(detectBrowserCompatibility(firefox('114')).status, 'supported')
})

test('Safari 14.1、15.6、16.3 不支持，Safari 16.4 支持', () => {
  for (const version of ['14.1', '15.6', '16.3']) {
    const result = detectBrowserCompatibility(safari(version))
    assert.equal(result.status, 'unsupported')
    assert.equal(result.family, 'safari')
    assert.equal(result.detectedVersion, version)
    assert.equal(result.requiredVersion, '16.4')
  }
  assert.equal(detectBrowserCompatibility(safari('16.4')).status, 'supported')
})

test('iOS 浏览器按系统 WebKit 版本判断，不使用 CriOS 产品版本', () => {
  const ios163 = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1',
  }
  const ios164 = {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 FxiOS/120.0 Mobile/15E148 Safari/605.1.15',
  }
  assert.deepEqual(detectBrowserCompatibility(ios163), {
    status: 'unsupported',
    family: 'ios_webkit',
    detectedVersion: '16.3',
    requiredVersion: '16.4',
  })
  assert.equal(detectBrowserCompatibility(ios164).status, 'supported')
})

test('iPad 桌面模式通过触控 MacIntel 特征识别为 iOS WebKit', () => {
  const result = detectBrowserCompatibility({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/16.4 Mobile/15E148 Safari/604.1',
    platform: 'MacIntel',
    maxTouchPoints: 5,
  })
  assert.equal(result.status, 'supported')
  assert.equal(result.family, 'ios_webkit')
})

test('Android WebView 使用内核 Chromium 版本判断', () => {
  const result = detectBrowserCompatibility({
    userAgent: 'Mozilla/5.0 (Linux; Android 12; Pixel 5 Build/SP2A; wv) AppleWebKit/537.36 Version/4.0 Chrome/110.0.5481.65 Mobile Safari/537.36',
  })
  assert.equal(result.status, 'unsupported')
  assert.equal(result.family, 'chromium')
})

test('User-Agent Client Hints 优先识别 Edge，未知浏览器不猜测', () => {
  const edgeResult = detectBrowserCompatibility({
    userAgent: chrome('120').userAgent,
    userAgentData: {
      brands: [
        { brand: 'Chromium', version: '110' },
        { brand: 'Microsoft Edge', version: '110' },
      ],
    },
  })
  assert.equal(edgeResult.status, 'unsupported')
  assert.equal(edgeResult.family, 'edge')
  assert.deepEqual(detectBrowserCompatibility({ userAgent: 'ExampleBrowser/1.0' }), {
    status: 'unknown',
    family: 'unknown',
  })
})
