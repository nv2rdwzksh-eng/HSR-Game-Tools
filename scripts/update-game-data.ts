import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rm, realpath } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import sharp from 'sharp'
import { acquireUpdateLock, digest, inside, readJson, validateGameFiles } from './game-data/files'
import {
  finalizeProjection,
  projectGameData,
  type Overlays,
  type SourceLock,
} from './game-data/projection'
import { publishSnapshot } from './game-data/publish'
import type { GameManifest } from '../src/tools/action-planner/data/schema'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
export async function updateLocalGameData(sourceRoot: string, root = projectRoot) {
  const lock = await readJson<SourceLock>(inside(root, 'scripts/game-data/source-lock.json'))
  const source = await realpath(sourceRoot)
  if (
    path.resolve(
      execFileSync('git', ['-C', source, 'rev-parse', '--show-toplevel'], {
        encoding: 'utf8',
      }).trim(),
    ) !== source
  )
    throw new Error('Source must be its Git repository root')
  const head = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const status = execFileSync('git', ['-C', source, 'status', '--porcelain=v1'], {
    encoding: 'utf8',
  }).trim()
  if (head !== lock.commit || status) throw new Error('Source Commit mismatch or dirty worktree')
  if (
    !Number.isInteger(lock.transform.maxSize) ||
    lock.transform.maxSize < 1 ||
    lock.transform.quality < 1 ||
    lock.transform.quality > 100
  )
    throw new Error('Invalid transform')
  const runId = randomUUID()
  const staging = inside(root, '.game-data-staging/' + runId)
  const guard = await acquireUpdateLock(root, runId)
  try {
    const overlayBytes = await readFile(inside(root, 'scripts/game-data/overlays.json'))
    const overlays = JSON.parse(overlayBytes.toString('utf8')) as Overlays
    const info = await readJson<{ version: string }>(inside(source, 'info.json'))
    const pair = async (name: string) => ({
      'zh-CN': await readJson(inside(source, 'index_min/cn/' + name + '.json')),
      en: await readJson(inside(source, 'index_min/en/' + name + '.json')),
    })
    const { snapshot, requests, diagnostics } = projectGameData(
      {
        gameVersion: info.version,
        characters: await pair('characters'),
        promotions: await pair('character_promotions'),
        relicSets: await pair('relic_sets'),
        lightCones: await pair('light_cones'),
      },
      lock,
      overlays,
    )
    const manifest: GameManifest = {
      schemaVersion: 1,
      gameVersion: info.version,
      source: { repository: lock.repository, commit: head },
      generatedAt: new Date().toISOString(),
      transform: { ...lock.transform, sharpVersion: sharp.versions.sharp },
      overlaySha256: digest(overlayBytes),
      files: {},
      missingAssets: [],
      diagnostics,
    }
    await mkdir(inside(staging, 'public/game-assets'), { recursive: true })
    for (const request of requests) {
      const input = inside(source, request.sourcePath)
      let image: Buffer
      try {
        image = await readFile(input)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        manifest.missingAssets.push({ key: request.key, sourcePath: request.sourcePath })
        diagnostics.push({ code: 'missing-image', id: request.key })
        continue
      }
      const resolved = await realpath(input)
      if (!resolved.startsWith(source + path.sep)) throw new Error('Asset symlink escapes source')
      const output = await sharp(image)
        .resize({
          width: lock.transform.maxSize,
          height: lock.transform.maxSize,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: lock.transform.quality, alphaQuality: lock.transform.alphaQuality })
        .toBuffer({ resolveWithObject: true })
      const target = inside(staging, 'public/' + request.outputPath)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, output.data)
      snapshot.assets[request.key] = {
        path: request.outputPath,
        width: output.info.width,
        height: output.info.height,
      }
      manifest.files['public/' + request.outputPath] = {
        sha256: digest(output.data),
        bytes: output.data.length,
      }
    }
    finalizeProjection(snapshot, new Set(manifest.missingAssets.map((v) => v.key)))
    await mkdir(inside(staging, 'src/tools/action-planner/data/game'), { recursive: true })
    const catalog = JSON.stringify(snapshot, null, 2) + '\n'
    await writeFile(inside(staging, 'src/tools/action-planner/data/game/catalog.json'), catalog)
    manifest.files['src/tools/action-planner/data/game/catalog.json'] = {
      sha256: digest(catalog),
      bytes: Buffer.byteLength(catalog),
    }
    await writeFile(
      inside(staging, 'src/tools/action-planner/data/game/manifest.json'),
      JSON.stringify(manifest, null, 2) + '\n',
    )
    const summary = await validateGameFiles(staging, lock, manifest.overlaySha256)
    await publishSnapshot(root, staging, runId)
    return summary
  } finally {
    try {
      await rm(staging, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    } finally {
      await rm(guard, { force: true })
    }
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: { source: { type: 'string' }, root: { type: 'string' } },
  })
  if (values.source !== 'local' || !values.root)
    throw new Error('Usage: --source local --root <StarRailRes root>; remote is not implemented')
  console.log(await updateLocalGameData(values.root))
}
