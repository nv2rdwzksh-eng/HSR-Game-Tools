import { execFileSync } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import path from 'node:path'
import {
  VERSION,
  inputFiles,
  assertLock,
  validateCatalog,
  projectCatalog,
  parseSource,
  stable,
  parseConfig,
  generateSchema,
  validateConfig,
  snapshot,
  assertSchema,
  type GachaIndex,
  type CatalogManifest,
  type SourceLock,
  type BannerConfig,
} from './model'
import {
  readBytes,
  readJson,
  inside,
  metadata,
  digest,
  verifyFiles,
  transaction,
  writeJson,
  publishDirectory,
  publishSchema,
  type PublishHook,
} from './files'

const generated = 'scripts/warp-data/generated'
const configFile = 'scripts/warp-data/banners.jsonc'
const schemaFile = 'scripts/warp-data/schema/banner-config.schema.json'
const runtime = 'src/tools/warp-simulator/data/runtime'
export async function loadLock(root: string): Promise<SourceLock> {
  const lock = await readJson(root, 'scripts/warp-data/source-lock.json')
  assertLock(lock)
  return lock
}
export async function loadCatalogDirectory(dir: string, lock: SourceLock) {
  const catalog = await readJson(dir, 'catalog.json')
  const index = await readJson(dir, 'gacha-index.json')
  const manifest = await readJson(dir, 'manifest.json')
  validateCatalog(catalog, index, manifest, lock)
  await verifyFiles(dir, (manifest as CatalogManifest).files, ['manifest.json'])
  return { catalog, index: index as GachaIndex, manifest: manifest as CatalogManifest }
}
export async function loadCatalog(root: string) {
  const lock = await loadLock(root)
  return { lock, ...(await loadCatalogDirectory(await inside(root, generated), lock)) }
}
function sourceState(source: string) {
  const git = (args: string[]) =>
    execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim()
  return {
    root: git(['rev-parse', '--show-toplevel']),
    head: git(['rev-parse', 'HEAD']),
    status: git(['status', '--porcelain=v1']),
  }
}
export async function updateCatalog(root: string, sourceRoot: string, hook?: PublishHook) {
  return transaction(root, async (stage, runId) => {
    const lock = await loadLock(root),
      source = await realpath(sourceRoot)
    const state = sourceState(source)
    if (path.resolve(state.root) !== source || state.head !== lock.commit || state.status)
      throw new Error('Source must be a clean Git root at the locked Commit')
    const raw: Record<string, unknown> = {},
      sourceFiles: CatalogManifest['sourceFiles'] = {}
    for (const file of inputFiles) {
      const bytes = await readBytes(source, file)
      sourceFiles[file] = metadata(bytes)
      raw[file] = parseSource(bytes.toString('utf8'))
    }
    const projected = projectCatalog(raw)
    const manifest: CatalogManifest = {
      schemaVersion: 1,
      generatorVersion: VERSION,
      source: lock,
      sourceFiles,
      origins: projected.origins,
      files: {
        'catalog.json': metadata(stable(projected.catalog)),
        'gacha-index.json': metadata(stable(projected.index)),
      },
    }
    await writeJson(stage, 'catalog.json', projected.catalog)
    await writeJson(stage, 'gacha-index.json', projected.index)
    await writeJson(stage, 'manifest.json', manifest)
    await loadCatalogDirectory(stage, lock)
    if (stable(sourceState(source)) !== stable(state))
      throw new Error('Source changed during generation')
    // Recheck consumed bytes as well as Git state before installing the new catalog.
    for (const file of inputFiles)
      if (digest(await readBytes(source, file)) !== sourceFiles[file]!.sha256)
        throw new Error('Source file changed: ' + file)
    await publishDirectory(root, generated, stage, runId, hook)
    return { items: projected.catalog.items.length, gachaIds: projected.index.banners.length }
  })
}
export async function generateLocalSchema(root: string) {
  const schema = await publishSchema(root, async () => {
    const { catalog, index, lock } = await loadCatalog(root)
    const doc = parseConfig((await readBytes(root, configFile)).toString('utf8'), configFile)
    const schema = generateSchema(catalog, index, lock, doc.value)
    assertSchema({ $ref: 'http://json-schema.org/draft-07/schema#' }, schema, 'generated schema')
    return schema
  })
  return { schemaBytes: Buffer.byteLength(stable(schema)) }
}
export async function prepareSnapshot(root: string) {
  const state = await loadCatalog(root)
  const configBytes = await readBytes(root, configFile),
    schemaBytes = await readBytes(root, schemaFile)
  const doc = parseConfig(configBytes.toString('utf8'), configFile)
  const schema = generateSchema(state.catalog, state.index, state.lock, doc.value)
  if (schemaBytes.toString('utf8') !== stable(schema))
    throw new Error('Stale Warp Schema; run generate:warp-schema')
  const config = validateConfig(doc, state.catalog, state.index, state.lock)
  const data = snapshot(config, state.catalog)
  const manifest = runtimeManifest(config, data, state.lock, {
    catalogManifest: metadata(await readBytes(root, generated + '/manifest.json')),
    config: metadata(configBytes),
    schema: metadata(schemaBytes),
  })
  return { data, manifest }
}
function runtimeManifest(
  config: BannerConfig,
  data: ReturnType<typeof snapshot>,
  source: SourceLock,
  inputs: Record<string, ReturnType<typeof metadata>>,
) {
  return {
    schemaVersion: 1,
    generatorVersion: VERSION,
    source,
    inputs,
    configurationStatus:
      config.pending.length || !config.banners.length ? 'incomplete' : 'complete',
    counts: {
      items: data.items.length,
      sharedPools: data.sharedPools.length,
      readyBanners: data.banners.length,
      pending: config.pending.length,
    },
    files: { 'snapshot.json': metadata(stable(data)) },
  }
}
async function verifyRuntimeDirectory(
  dir: string,
  expected: Awaited<ReturnType<typeof prepareSnapshot>>,
) {
  const bytes = await readBytes(dir, 'snapshot.json'),
    manifest = await readJson(dir, 'manifest.json')
  if (
    stable(manifest) !== stable(expected.manifest) ||
    bytes.toString('utf8') !== stable(expected.data)
  )
    throw new Error('Runtime snapshot or Manifest is stale/invalid')
  await verifyFiles(dir, expected.manifest.files, ['manifest.json'])
}
export async function buildSnapshot(root: string, hook?: PublishHook) {
  return transaction(root, async (stage, runId) => {
    const expected = await prepareSnapshot(root)
    await writeJson(stage, 'snapshot.json', expected.data)
    await writeJson(stage, 'manifest.json', expected.manifest)
    await verifyRuntimeDirectory(stage, expected)
    // Detect maintenance edits during staging; never publish using a mixed input generation.
    if (stable(await prepareSnapshot(root)) !== stable(expected))
      throw new Error('Inputs changed during snapshot generation')
    await publishDirectory(root, runtime, stage, runId, hook)
    return { status: expected.manifest.configurationStatus, ...expected.manifest.counts }
  })
}
export async function validateData(root: string) {
  const expected = await prepareSnapshot(root)
  await verifyRuntimeDirectory(await inside(root, runtime), expected)
  return { status: expected.manifest.configurationStatus, ...expected.manifest.counts }
}
