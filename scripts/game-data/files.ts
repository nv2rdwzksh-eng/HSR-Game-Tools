import { createHash } from 'node:crypto'
import { readFile, readdir, lstat, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  safeRelativePath,
  validateSnapshot,
  validateManifest,
} from '../../src/tools/action-planner/data/schema'
import type { SourceLock } from './projection'

export const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
export const readJson = async <T = unknown>(file: string): Promise<T> =>
  JSON.parse(await readFile(file, 'utf8')) as T
export function inside(root: string, relative: string): string {
  if (!safeRelativePath(relative)) throw new Error('Unsafe relative path')
  const resolved = path.resolve(root, relative)
  if (!resolved.startsWith(path.resolve(root) + path.sep))
    throw new Error('Path escaped output root')
  return resolved
}
export async function acquireUpdateLock(root: string, runId: string) {
  const guard = inside(root, '.game-data-staging/update.lock')
  await mkdir(path.dirname(guard), { recursive: true })
  await writeFile(guard, runId, { flag: 'wx' })
  return guard
}
async function listFiles(root: string): Promise<string[]> {
  const output: string[] = []
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name)
    if (entry.isSymbolicLink()) throw new Error('Unexpected asset symlink')
    if (entry.isDirectory()) output.push(...(await listFiles(file)))
    else if (entry.isFile()) output.push(file)
  }
  return output
}
export async function validateGameFiles(root: string, lock?: SourceLock, overlaySha256?: string) {
  const snapshot = await readJson(inside(root, 'src/tools/action-planner/data/game/catalog.json'))
  validateSnapshot(snapshot)
  const manifest = await readJson(inside(root, 'src/tools/action-planner/data/game/manifest.json'))
  validateManifest(manifest)
  if (manifest.gameVersion !== snapshot.gameVersion)
    throw new Error('Manifest game version mismatch')
  if (overlaySha256 && manifest.overlaySha256 !== overlaySha256)
    throw new Error('Manifest overlay mismatch')
  if (
    lock &&
    (manifest.source.commit !== lock.commit ||
      manifest.source.repository !== lock.repository ||
      JSON.stringify(snapshot.characters.map((c) => c.id).sort()) !==
        JSON.stringify([...lock.reviewedCharacterIds].sort()) ||
      Object.entries(lock.transform).some(
        ([key, value]) => manifest.transform[key as keyof typeof manifest.transform] !== value,
      ))
  )
    throw new Error('Manifest source lock mismatch')
  if (manifest.missingAssets.some((m) => Object.hasOwn(snapshot.assets, m.key)))
    throw new Error('Missing asset is still referenced')
  const expected = new Set([
    'src/tools/action-planner/data/game/catalog.json',
    ...Object.values(snapshot.assets).map((a) => 'public/' + a.path),
  ])
  if (JSON.stringify([...expected].sort()) !== JSON.stringify(Object.keys(manifest.files).sort()))
    throw new Error('Manifest file inventory mismatch')
  for (const relative of expected) {
    const file = inside(root, relative)
    if ((await lstat(file)).isSymbolicLink()) throw new Error('Unexpected output symlink')
    const bytes = await readFile(file)
    const meta = manifest.files[relative]
    if (meta.bytes !== bytes.length || meta.sha256 !== digest(bytes))
      throw new Error('Checksum mismatch ' + relative)
  }
  const actualAssets = (await listFiles(inside(root, 'public/game-assets')))
    .map((f) => path.relative(root, f).split(path.sep).join('/'))
    // Other tools own these explicit namespaces; planner inventory stays strict.
    .filter(
      (f) =>
        !f.startsWith('public/game-assets/emblem/') &&
        !f.startsWith('public/game-assets/currency-war-traits/') &&
        !f.startsWith('public/game-assets/currency-war-equipments/') &&
        !f.startsWith('public/game-assets/warp/'),
    )
  if (
    JSON.stringify(actualAssets.sort()) !==
    JSON.stringify([...expected].filter((p) => p.startsWith('public/')).sort())
  )
    throw new Error('Unexpected or missing asset files')
  for (const asset of Object.values(snapshot.assets)) {
    const meta = await sharp(await readFile(inside(root, 'public/' + asset.path))).metadata()
    if (meta.format !== 'webp' || meta.width !== asset.width || meta.height !== asset.height)
      throw new Error('Asset format/dimensions mismatch')
  }
  return {
    characters: snapshot.characters.length,
    presets: snapshot.presets.length,
    assets: Object.keys(snapshot.assets).length,
    bytes: Object.values(manifest.files).reduce((n, f) => n + f.bytes, 0),
    missing: manifest.missingAssets.length,
    diagnostics: manifest.diagnostics.length,
  }
}
