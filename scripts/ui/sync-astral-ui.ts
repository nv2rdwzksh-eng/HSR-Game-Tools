import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const target = fileURLToPath(new URL('../../vendor/astral-ui/', import.meta.url))
const { values } = parseArgs({
  options: { source: { type: 'string' }, check: { type: 'boolean' } },
})
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function files(directory: string, prefix = ''): Promise<string[]> {
  const entries = await readdir(path.join(directory, prefix), { withFileTypes: true })
  return (
    await Promise.all(
      entries.map((entry) => {
        const name = path.posix.join(prefix, entry.name)
        return entry.isDirectory() ? files(directory, name) : [name]
      }),
    )
  )
    .flat()
    .sort()
}
if (values.check) {
  const manifest = JSON.parse(await readFile(path.join(target, 'provenance.json'), 'utf8')) as {
    files: Record<string, string>
  }
  const actual = (await files(target)).filter((name) => name !== 'provenance.json')
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(manifest.files).sort()))
    throw new Error('Astral UI file inventory differs from provenance')
  for (const name of actual)
    if (hash(await readFile(path.join(target, name))) !== manifest.files[name])
      throw new Error('Astral UI hash mismatch: ' + name)
  console.log('Astral UI source snapshot verified')
} else {
  if (!values.source) throw new Error('Pass --source <local Astral UI fork> or --check')
  const source = path.resolve(values.source)
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' })
  const upstreamCommit = git('rev-parse', 'HEAD').trim()
  const sourcePackage = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'))
  if (sourcePackage.name !== 'astral-ui' || !sourcePackage.exports?.['./components'])
    throw new Error('Expected the extended Astral UI source package')
  if (
    source === target ||
    target.startsWith(source + path.sep) ||
    source.startsWith(target + path.sep)
  )
    throw new Error('Source must be outside the vendored destination')
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  const notices = (await readdir(source)).filter((name) => /^(licen[cs]e|notice)(\.|$)/i.test(name))
  for (const name of ['src/lib', 'docs', 'README.md', ...notices])
    await cp(path.join(source, name), path.join(target, name), { recursive: true })
  // Preserve project-owned source without inheriting the demo's development dependencies.
  await writeFile(
    path.join(target, 'package.json'),
    JSON.stringify(
      {
        name: 'astral-ui',
        version: sourcePackage.version,
        private: true,
        type: 'module',
        exports: sourcePackage.exports,
        peerDependencies: { vue: '^3.5.22' },
      },
      null,
      2,
    ) + '\n',
  )
  await writeFile(path.join(target, 'local-changes.patch'), git('diff', '--binary', 'HEAD'))
  const tracked = new Set(git('ls-files').trim().split('\n'))
  const hashes: Record<string, string> = {}
  const localFiles: string[] = []
  for (const name of await files(target)) {
    hashes[name] = hash(await readFile(path.join(target, name)))
    if (name.startsWith('src/lib/') && !tracked.has(name)) localFiles.push(name)
  }
  await writeFile(
    path.join(target, 'provenance.json'),
    JSON.stringify(
      {
        repository: 'https://github.com/Oereor/astral-ui',
        upstream: 'https://github.com/D-Pear/astral-ui',
        upstreamCommit,
        localChanges: 'local-changes.patch',
        additionalSourceFiles: localFiles,
        note: 'Snapshot includes local extensions; the commit alone does not identify these bytes. No license is inferred.',
        files: hashes,
      },
      null,
      2,
    ) + '\n',
  )
  console.log('Astral UI source snapshot synchronized from ' + upstreamCommit)
}
