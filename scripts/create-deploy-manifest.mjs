import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'

const [outputDirArg, target, version, commit] = process.argv.slice(2)
if (!outputDirArg || !target || !version || !commit) {
  throw new Error(
    '用法: node scripts/create-deploy-manifest.mjs <dist-dir> <target> <version> <commit>',
  )
}

const outputDir = resolve(outputDirArg)
const manifestName = '.deploy-manifest.json'

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolute = join(dir, entry.name)
      if (entry.isDirectory()) return listFiles(absolute)
      if (!entry.isFile() || entry.name === manifestName) return []
      return [absolute]
    }),
  )
  return nested.flat()
}

const files = {}
for (const absolute of (await listFiles(outputDir)).sort()) {
  const name = relative(outputDir, absolute).split(sep).join('/')
  const bytes = await readFile(absolute)
  files[name] = {
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

const manifest = {
  schema: 1,
  target,
  version,
  commit,
  created_at: new Date().toISOString(),
  files,
}
await writeFile(
  join(outputDir, manifestName),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
console.log(
  `[manifest] ${target} v${version} ${commit.slice(0, 12)} · ${Object.keys(files).length} files`,
)
