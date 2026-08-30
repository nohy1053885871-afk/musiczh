import assert from 'node:assert/strict'
import test from 'node:test'
import {
  QQ_INSTALLER_PATH,
  QQ_INSTALLER_SHA256,
  resolveQqInstallerTarget,
} from './qq-installer'

test('配置的 HTTPS 网盘链接优先于自托管安装包', () => {
  const url = 'https://pan.example.com/s/qq-v19-51'
  assert.deepEqual(resolveQqInstallerTarget(url, true), { url })
  assert.deepEqual(resolveQqInstallerTarget(url, false), { url })
})

test('未配置外部链接时按构建能力回退或失败安全', () => {
  assert.deepEqual(resolveQqInstallerTarget(null, true), {
    url: QQ_INSTALLER_PATH,
    sha256: QQ_INSTALLER_SHA256,
  })
  assert.equal(resolveQqInstallerTarget(null, false), null)
})

test('危险或非 HTTPS 配置不会覆盖既有回退策略', () => {
  for (const url of [
    'http://pan.example.com/file',
    '//pan.example.com/file',
    'javascript:alert(1)',
    '/downloads/file.zip',
  ]) {
    assert.equal(resolveQqInstallerTarget(url, false), null)
    assert.equal(resolveQqInstallerTarget(url, true)?.url, QQ_INSTALLER_PATH)
  }
})
