import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

const [rootArg] = process.argv.slice(2)
if (!rootArg) throw new Error('用法: node verify-static-directory.mjs <root-dir>')

const root = resolve(rootArg)
const manifestPath = resolve(root, '.deploy-manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
if (!manifest.version || !manifest.commit || !manifest.files) {
  throw new Error('部署清单缺少 version、commit 或 files')
}

for (const [name, expected] of Object.entries(manifest.files)) {
  const absolute = resolve(root, name)
  if (!absolute.startsWith(`${root}${sep}`)) {
    throw new Error(`部署清单包含越界路径: ${name}`)
  }
  const info = await stat(absolute)
  if (!info.isFile() || info.size !== expected.bytes) {
    throw new Error(`${name} 的文件类型或大小与部署清单不一致`)
  }
  const bytes = await readFile(absolute)
  const actual = createHash('sha256').update(bytes).digest('hex')
  if (actual !== expected.sha256) {
    throw new Error(`${name} 的 SHA-256 与部署清单不一致`)
  }
}

console.log(
  `[directory] ${manifest.target} v${manifest.version} ${manifest.commit.slice(0, 12)} · ${Object.keys(manifest.files).length} files OK`,
)
