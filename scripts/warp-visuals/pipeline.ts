import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  inspectStarCrop,
  validStarCrop,
  cardStarDimensions,
  cardStarKey,
  type StarCrop,
} from './card-stars'
import sourceLock from './source-lock.json'
import { digest, metadata, inside, exists, readBytes } from '../warp-data/files'
import type { WarpSnapshot } from '../../src/tools/warp-simulator/data/schema'
import {
  assertVisualCatalog,
  visualAssetPaths,
  type WarpVisualCatalog,
  type VisualMetadata,
  type VisualDefinition,
  type VisualImage,
} from '../../src/tools/warp-simulator/model/visual-catalog'

export const visualDirectory = 'src/tools/warp-simulator/data/visuals'
export const assetDirectory = 'public/game-assets/warp'
const snapshotFile = 'src/tools/warp-simulator/data/runtime/snapshot.json'
const plannerCatalogFile = 'src/tools/action-planner/data/game/catalog.json'
const plannerManifestFile = 'src/tools/action-planner/data/game/manifest.json'
type SourceLock = typeof sourceLock
type FileMeta = ReturnType<typeof metadata>
export interface VisualManifest {
  schemaVersion: 3
  source: { repository: string; commit: string }
  generatedAt: string
  transform: SourceLock['transform'] & { sharpVersion: string }
  snapshotSha256: string
  inputs: Record<string, FileMeta & { width?: number; height?: number }>
  localInputs: Record<string, FileMeta>
  files: Record<string, FileMeta & { width?: number; height?: number }>
  assets: {
    id: string
    slot: string
    purpose: ConversionPurpose
    source: string
    output: string
    transformKey: string
    crop?: StarCrop
  }[]
  missingAssets: { id: string; slot: string; sourcePath?: string; reason: string }[]
}
type ConversionPurpose =
  | 'artwork-avatar'
  | 'artwork-light-cone'
  | 'icon'
  | 'stars'
  | 'reveal-artwork'
  | 'result-portrait'
  | 'reveal-icon'
  | 'reveal-stars'
  | 'reveal-star-big'
  | 'card-stars'
  | 'light-cone-preview'
function profile(
  purpose: ConversionPurpose,
  lock: SourceLock,
  source?: { width?: number; height?: number },
): [number, number] {
  const t = lock.transform
  switch (purpose) {
    case 'result-portrait':
      if (t.resultPortraitSize !== 'source' || !source?.width || !source.height)
        throw new Error('Missing native portrait dimensions/profile')
      // A larger inside bound never enlarges pixels. Retaining the existing HD key
      // for native canvases that already fit avoids duplicate encodes and files.
      return [Math.max(source.width, source.height, t.revealArtworkSize), t.resultPortraitQuality]
    case 'artwork-avatar':
      return [t.avatarSize, t.quality]
    case 'artwork-light-cone':
      return [t.lightConeSize, t.quality]
    case 'icon':
      return [t.iconSize, t.iconQuality]
    case 'stars':
      return [t.starSize, t.iconQuality]
    case 'reveal-artwork':
      return [t.revealArtworkSize, t.revealQuality]
    case 'light-cone-preview':
      return [t.lightConePreviewSize, t.revealQuality]
    case 'reveal-icon':
      return [t.revealIconSize, t.iconQuality]
    case 'reveal-stars':
      return [t.revealStarSize, t.iconQuality]
    case 'reveal-star-big':
      return [t.revealStarBigSize, t.iconQuality]
    default:
      throw new Error('Invalid visual conversion purpose')
  }
}
export interface SourceReader {
  read: (file: string) => Buffer | undefined
}
/** Read immutable objects; even untracked OS files in the checkout are irrelevant. */
export async function gitSource(
  root: string,
  lock: SourceLock = sourceLock,
): Promise<SourceReader> {
  const resolved = path.normalize(await realpath(root))
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', resolved, ...args], {
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  const gitRoot = path.normalize(
    await realpath(git('rev-parse', '--show-toplevel').toString().trim()),
  )
  const sameRoot =
    process.platform === 'win32'
      ? gitRoot.toLowerCase() === resolved.toLowerCase()
      : gitRoot === resolved
  if (!sameRoot) throw new Error('Source must be a Git root')
  git('cat-file', '-e', lock.commit + '^{commit}')
  const files = new Set(
    git('ls-tree', '-r', '--name-only', lock.commit).toString().trim().split('\n'),
  )
  return { read: (file) => (files.has(file) ? git('show', lock.commit + ':' + file) : undefined) }
}
async function json<T>(root: string, relative: string): Promise<T> {
  return JSON.parse((await readBytes(root, relative)).toString()) as T
}
async function write(root: string, relative: string, bytes: Buffer | string) {
  const file = await inside(root, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, bytes, { flag: 'wx' })
}
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + '\n'
async function list(root: string, relative: string): Promise<string[]> {
  const directory = await inside(root, relative)
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = relative + '/' + entry.name
    if (entry.isSymbolicLink()) throw new Error('Refuse asset symlink')
    if (entry.isDirectory()) files.push(...(await list(root, file)))
    else if (entry.isFile()) files.push(file)
    else throw new Error('Unexpected asset entry')
  }
  return files.sort()
}

/** Normal validation reads only committed project outputs and small normalized snapshots. */
export async function validateVisuals(
  root: string,
  lock: SourceLock = sourceLock,
  sharedRoot = root,
) {
  const snapshot = await json<WarpSnapshot>(root, snapshotFile)
  const catalog = await json<unknown>(root, visualDirectory + '/catalog.json')
  assertVisualCatalog(catalog, snapshot)
  const manifest = await json<VisualManifest>(root, visualDirectory + '/manifest.json')
  if (
    manifest.schemaVersion !== 3 ||
    manifest.source.repository !== lock.repository ||
    manifest.source.commit !== lock.commit ||
    JSON.stringify(manifest.transform) !==
      JSON.stringify({ ...lock.transform, sharpVersion: sharp.versions.sharp }) ||
    manifest.snapshotSha256 !== digest(await readBytes(root, snapshotFile))
  )
    throw new Error('Warp visual source/transform/snapshot mismatch')
  if (
    JSON.stringify(Object.keys(manifest.localInputs).sort()) !==
    JSON.stringify([plannerCatalogFile, plannerManifestFile].sort())
  )
    throw new Error('Shared provenance inventory mismatch')
  for (const locale of ['cn', 'en'])
    for (const name of ['characters', 'light_cones', 'paths', 'elements'])
      if (!manifest.inputs[`index_new/${locale}/${name}.json`])
        throw new Error('Missing visual index provenance')
  let starSourceHeight: number | undefined
  for (const asset of manifest.assets) {
    const source = manifest.inputs[asset.source]
    if (asset.purpose === 'card-stars') {
      const settings = lock.transform.cardStars
      const crop = asset.crop
      const output = manifest.files['public/' + asset.output]
      if (
        !source ||
        !Number.isSafeInteger(source.width) ||
        !Number.isSafeInteger(source.height) ||
        !validStarCrop(crop, Number(source.width), Number(source.height), Number(asset.id)) ||
        settings.method !== 'alpha-trim' ||
        settings.threshold !== 0 ||
        !Number.isSafeInteger(settings.contentHeight) ||
        settings.contentHeight <= 0 ||
        !Number.isSafeInteger(settings.padding) ||
        settings.padding < 0 ||
        asset.slot !== 'card-stars' ||
        asset.source !== `icon/deco/Star${asset.id}.png` ||
        asset.transformKey !==
          cardStarKey(source.sha256, crop, settings, lock.transform.alphaQuality) ||
        asset.output !== `game-assets/warp/${digest(asset.transformKey)}.webp` ||
        (starSourceHeight !== undefined && crop.height !== starSourceHeight)
      )
        throw new Error('Invalid card star crop/provenance')
      const dimensions = cardStarDimensions(crop, settings)
      if (output?.width !== dimensions.width || output?.height !== dimensions.height)
        throw new Error('Invalid card star dimensions')
      starSourceHeight = crop.height
      continue
    }
    const [hash, size, quality, alpha, extra] = asset.transformKey.split(':')
    const [expectedSize, expectedQuality] = profile(asset.purpose, lock, source)
    const output = manifest.files['public/' + asset.output]
    const scale = Math.min(
      1,
      expectedSize / Number(source?.width),
      expectedSize / Number(source?.height),
    )
    if (
      !source ||
      asset.crop !== undefined ||
      (asset.purpose === 'result-portrait' &&
        (asset.slot !== 'result-portrait' ||
          !asset.id.startsWith('avatar:') ||
          asset.source !== `image/character_portrait/${asset.id.split(':')[1]}.png`)) ||
      (asset.purpose === 'reveal-star-big' &&
        (asset.source !== 'icon/deco/StarBig.png' || asset.slot !== 'reveal-star-big')) ||
      (asset.purpose === 'light-cone-preview' &&
        (asset.slot !== 'light-cone-preview' ||
          !asset.id.startsWith('light-cone:') ||
          asset.source !== `image/light_cone_preview/${asset.id.split(':')[1]}.png`)) ||
      /[\\:?#%]/.test(asset.source) ||
      asset.source.split('/').some((part) => !part || part === '.' || part === '..') ||
      source.sha256 !== hash ||
      extra !== undefined ||
      !Number.isSafeInteger(source.width) ||
      !Number.isSafeInteger(source.height) ||
      Number(source.width) <= 0 ||
      Number(source.height) <= 0 ||
      Number(size) !== expectedSize ||
      Number(quality) !== expectedQuality ||
      Number(alpha) !== lock.transform.alphaQuality ||
      asset.output !== `game-assets/warp/${digest(asset.transformKey)}.webp` ||
      output?.width !== Math.round(Number(source.width) * scale) ||
      output?.height !== Math.round(Number(source.height) * scale)
    )
      throw new Error('Invalid visual conversion provenance')
  }
  const referenced = new Set<VisualManifest['assets'][number]>()
  function reference(
    id: string,
    slot: string,
    file: string | undefined,
    purpose: ConversionPurpose,
    image?: VisualImage,
  ) {
    if (!file) {
      if (!manifest.missingAssets.some((missing) => missing.id === id && missing.slot === slot))
        throw new Error('Missing visual mapping diagnostic: ' + id + '/' + slot)
      return
    }
    const asset = manifest.assets.find(
      (row) => row.id === id && row.slot === slot && row.purpose === purpose && row.output === file,
    )
    const output = manifest.files['public/' + file]
    if (!asset || (image && (image.width !== output?.width || image.height !== output?.height)))
      throw new Error('Visual mapping conversion mismatch: ' + id + '/' + slot)
    referenced.add(asset)
  }
  for (const item of snapshot.items) {
    const row = catalog.items[item.id]!
    if (
      manifest.missingAssets.some(
        (missing) => missing.id === item.id && missing.slot === 'metadata',
      )
    ) {
      if (Object.keys(row).length) throw new Error('Unexpected mapping for absent metadata')
      continue
    }
    reference(
      item.id,
      'artwork',
      row.artworkPath,
      item.kind === 'avatar' ? 'artwork-avatar' : 'artwork-light-cone',
    )
    reference(
      item.id,
      'reveal-artwork',
      row.revealArtwork?.path,
      'reveal-artwork',
      row.revealArtwork,
    )
    if (item.kind === 'avatar')
      reference(
        item.id,
        'result-portrait',
        row.resultPortrait?.path,
        'result-portrait',
        row.resultPortrait,
      )
    if (item.kind === 'light-cone')
      reference(
        item.id,
        'light-cone-preview',
        row.lightConePreview?.path,
        'light-cone-preview',
        row.lightConePreview,
      )
  }
  for (const [group, definitions] of [
    ['paths', catalog.paths],
    ['elements', catalog.elements],
  ] as const)
    for (const [id, row] of Object.entries(definitions)) {
      reference(id, 'icon', row.iconPath, 'icon')
      if (group === 'paths')
        reference(id, 'reveal-icon', row.revealIcon?.path, 'reveal-icon', row.revealIcon)
    }
  for (const rarity of [3, 4, 5] as const)
    reference(String(rarity), 'stars', catalog.stars[rarity], 'stars')
  for (const rarity of [3, 4, 5] as const)
    reference(
      String(rarity),
      'card-stars',
      catalog.cardStars?.[rarity]?.path,
      'card-stars',
      catalog.cardStars?.[rarity],
    )
  reference(
    '5',
    'reveal-stars',
    catalog.revealStars?.[5]?.path,
    'reveal-stars',
    catalog.revealStars?.[5],
  )
  reference(
    '5',
    'reveal-star-big',
    catalog.revealStarBig?.path,
    'reveal-star-big',
    catalog.revealStarBig,
  )
  if (referenced.size !== manifest.assets.length) throw new Error('Unreferenced visual conversion')
  const expectedInputs = [
    ...new Set([
      ...['cn', 'en'].flatMap((locale) =>
        ['characters', 'light_cones', 'paths', 'elements'].map(
          (name) => `index_new/${locale}/${name}.json`,
        ),
      ),
      ...manifest.assets.map((asset) => asset.source),
    ]),
  ].sort()
  if (JSON.stringify(expectedInputs) !== JSON.stringify(Object.keys(manifest.inputs).sort()))
    throw new Error('Unexpected visual source inventory')
  for (const [relative, meta] of Object.entries(manifest.localInputs))
    if (JSON.stringify(metadata(await readBytes(sharedRoot, relative))) !== JSON.stringify(meta))
      throw new Error('Shared source changed: ' + relative)
  const expected = [
    visualDirectory + '/catalog.json',
    ...visualAssetPaths(catalog).map((file) => 'public/' + file),
  ].sort()
  if (JSON.stringify(expected) !== JSON.stringify(Object.keys(manifest.files).sort()))
    throw new Error('Warp visual inventory mismatch')
  for (const [file, meta] of Object.entries(manifest.files)) {
    const bytes = await readBytes(
      file.startsWith(assetDirectory + '/') || file.startsWith(visualDirectory + '/')
        ? root
        : sharedRoot,
      file,
    )
    if (digest(bytes) !== meta.sha256 || bytes.length !== meta.bytes)
      throw new Error('Warp visual checksum mismatch: ' + file)
    if (file.endsWith('.webp')) {
      const actual = await sharp(bytes).metadata()
      if (actual.format !== 'webp' || actual.width !== meta.width || actual.height !== meta.height)
        throw new Error('Warp image dimensions mismatch')
    }
  }
  const owned = expected.filter((file) => file.startsWith(assetDirectory + '/'))
  if (JSON.stringify(await list(root, assetDirectory)) !== JSON.stringify(owned))
    throw new Error('Unexpected Warp image files')
  if (
    JSON.stringify(await list(root, visualDirectory)) !==
    JSON.stringify([visualDirectory + '/catalog.json', visualDirectory + '/manifest.json'])
  )
    throw new Error('Unexpected Warp metadata files')
  return {
    items: Object.keys(catalog.items).length,
    newAssets: owned.length,
    reusedAssets: expected.length - owned.length - 1,
    assetBytes: owned.reduce((n, file) => n + manifest.files[file]!.bytes, 0),
    missing: manifest.missingAssets.length,
  }
}

interface IndexRow {
  id: string
  path?: string
  element?: string
  rarity?: number
  portrait?: string
  preview?: string
  icon?: string
  name: string
  color?: string
}
type Index = Record<string, IndexRow>
export async function generateVisuals(
  root: string,
  stage: string,
  source: SourceReader,
  lock: SourceLock = sourceLock,
) {
  const snapshotBytes = await readBytes(root, snapshotFile)
  const snapshot = JSON.parse(snapshotBytes.toString()) as WarpSnapshot
  const manifest: VisualManifest = {
    schemaVersion: 3,
    source: { repository: lock.repository, commit: lock.commit },
    generatedAt: new Date().toISOString(),
    transform: { ...lock.transform, sharpVersion: sharp.versions.sharp },
    snapshotSha256: digest(snapshotBytes),
    inputs: {},
    localInputs: {},
    files: {},
    assets: [],
    missingAssets: [],
  }
  function input(file: string) {
    const bytes = source.read(file)
    if (bytes) manifest.inputs[file] = metadata(bytes)
    return bytes
  }
  const indices: Record<string, Index> = {}
  for (const locale of ['cn', 'en'])
    for (const name of ['characters', 'light_cones', 'paths', 'elements']) {
      const file = `index_new/${locale}/${name}.json`,
        bytes = input(file)
      if (!bytes) throw new Error('Missing source index: ' + file)
      indices[locale + '/' + name] = JSON.parse(bytes.toString()) as Index
    }
  for (const file of [plannerCatalogFile, plannerManifestFile])
    manifest.localInputs[file] = metadata(await readBytes(root, file))
  const planner = await json<{
    characters: { id: string; assetKey?: string }[]
    assets: Record<string, { path: string }>
  }>(root, plannerCatalogFile)
  const plannerManifest = await json<{
    source: { commit: string }
    files: Record<string, FileMeta>
  }>(root, plannerManifestFile)
  if (plannerManifest.source.commit !== lock.commit)
    throw new Error('Shared portraits must use the locked source')
  const items: Record<string, VisualMetadata> = {},
    paths: Record<string, VisualDefinition> = {},
    elements: Record<string, VisualDefinition & { color: string }> = {},
    stars: Partial<Record<3 | 4 | 5, string>> = {},
    revealStars: Partial<Record<3 | 4 | 5, VisualImage>> = {},
    cardStars: Partial<Record<3 | 4 | 5, VisualImage>> = {}
  let starSample: { height: number; hash: string } | undefined
  const converted = new Map<string, string>()
  // Reuse only checksum-verified outputs of the same locked source and exact
  // conversion key. Re-encoding an unchanged lossy image need not be byte stable.
  const previous = (await exists(await inside(root, visualDirectory + '/manifest.json')))
    ? await json<VisualManifest>(root, visualDirectory + '/manifest.json')
    : undefined
  const reusable =
    previous?.source.commit === lock.commit &&
    previous.source.repository === lock.repository &&
    previous.transform.sharpVersion === sharp.versions.sharp
      ? previous
      : undefined
  async function asset(
    id: string,
    slot: string,
    sourcePath: string | undefined,
    size: number,
    quality: number,
    purpose: ConversionPurpose = slot === 'artwork'
      ? id.startsWith('avatar:')
        ? 'artwork-avatar'
        : 'artwork-light-cone'
      : slot === 'icon'
        ? 'icon'
        : 'stars',
  ): Promise<string | undefined> {
    if (
      !sourcePath ||
      /[\\:?#%]/.test(sourcePath) ||
      sourcePath.split('/').some((part) => !part || part === '.' || part === '..')
    ) {
      manifest.missingAssets.push({ id, slot, reason: 'missing-or-unsafe-source-path' })
      return undefined
    }
    const bytes = input(sourcePath)
    if (!bytes) {
      manifest.missingAssets.push({ id, slot, sourcePath, reason: 'missing-source-file' })
      return undefined
    }
    const original = await sharp(bytes).metadata()
    if (!original.width || !original.height) throw new Error('Missing source image dimensions')
    manifest.inputs[sourcePath] = {
      ...metadata(bytes),
      width: original.width,
      height: original.height,
    }
    if (purpose === 'result-portrait') {
      if (sourcePath !== `image/character_portrait/${id.split(':')[1]}.png`)
        throw new Error('Invalid native portrait source path')
      ;[size, quality] = profile(purpose, lock, original)
    }
    let crop: StarCrop | undefined
    if (purpose === 'card-stars') {
      const inspected = await inspectStarCrop(bytes, Number(id))
      crop = inspected.crop
      if (
        starSample &&
        (starSample.height !== crop.height || starSample.hash !== inspected.starHash)
      )
        throw new Error('Inconsistent star scale/content across rarities')
      starSample = { height: crop.height, hash: inspected.starHash }
    }
    const settings = lock.transform.cardStars
    const transformKey = crop
      ? cardStarKey(digest(bytes), crop, settings, lock.transform.alphaQuality)
      : `${digest(bytes)}:${size}:${quality}:${lock.transform.alphaQuality}`
    let output = converted.get(transformKey)
    if (!output) {
      output = `game-assets/warp/${digest(transformKey)}.webp`
      const old = reusable?.files['public/' + output]
      const cached =
        old &&
        reusable?.assets.some(
          (asset) =>
            asset.transformKey === transformKey &&
            asset.output === output &&
            asset.source === sourcePath,
        ) &&
        (await exists(await inside(root, 'public/' + output)))
          ? await readBytes(root, 'public/' + output)
          : undefined
      const conversion = crop
        ? sharp(bytes)
            .extract(crop)
            .resize({ height: settings.contentHeight, withoutEnlargement: true })
            .extend({
              top: settings.padding,
              bottom: settings.padding,
              left: settings.padding,
              right: settings.padding,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
        : sharp(bytes).resize({
            width: size,
            height: size,
            fit: 'inside',
            withoutEnlargement: true,
          })
      const result =
        cached && digest(cached) === old?.sha256 && cached.length === old.bytes
          ? { data: cached, info: await sharp(cached).metadata() }
          : await conversion
              .webp({ quality, alphaQuality: lock.transform.alphaQuality })
              .toBuffer({ resolveWithObject: true })
      await write(stage, 'public/' + output, result.data)
      manifest.files['public/' + output] = {
        ...metadata(result.data),
        width: result.info.width,
        height: result.info.height,
      }
      converted.set(transformKey, output)
    }
    manifest.assets.push({
      id,
      slot,
      purpose,
      source: sourcePath,
      output,
      transformKey,
      ...(crop ? { crop } : {}),
    })
    return output
  }
  async function revealAsset(
    id: string,
    purpose:
      | 'reveal-artwork'
      | 'reveal-icon'
      | 'reveal-stars'
      | 'reveal-star-big'
      | 'light-cone-preview'
      | 'result-portrait',
    sourcePath: string | undefined,
  ): Promise<VisualImage | undefined> {
    const [size, quality] =
      purpose === 'result-portrait'
        ? [0, lock.transform.resultPortraitQuality]
        : profile(purpose, lock)
    const file = await asset(id, purpose, sourcePath, size, quality, purpose)
    if (!file) return undefined
    const meta = manifest.files['public/' + file]!
    return { path: file, width: meta.width!, height: meta.height! }
  }
  async function definition(
    group: 'paths' | 'elements',
    id: string,
  ): Promise<VisualDefinition & { color?: string }> {
    const cn = indices['cn/' + group]![id],
      en = indices['en/' + group]![id]
    if (
      !cn ||
      !en ||
      cn.id !== id ||
      en.id !== id ||
      cn.icon !== en.icon ||
      !cn.name ||
      !en.name ||
      (group === 'elements' && cn.color !== en.color)
    )
      throw new Error('Invalid bilingual definition: ' + id)
    return {
      names: { 'zh-CN': cn.name, en: en.name },
      iconPath: await asset(
        id,
        'icon',
        cn.icon,
        lock.transform.iconSize,
        lock.transform.iconQuality,
      ),
      ...(group === 'paths'
        ? { revealIcon: await revealAsset(id, 'reveal-icon', cn.icon) }
        : { color: cn.color }),
    }
  }
  for (const item of snapshot.items) {
    const group = item.kind === 'avatar' ? 'characters' : 'light_cones',
      numericId = item.id.split(':')[1]!
    const cn = indices['cn/' + group]![numericId],
      en = indices['en/' + group]![numericId]
    if (!cn || !en) {
      items[item.id] = {}
      manifest.missingAssets.push({ id: item.id, slot: 'metadata', reason: 'missing-source-row' })
      continue
    }
    if (
      cn.id !== numericId ||
      en.id !== numericId ||
      cn.rarity !== item.rarity ||
      en.rarity !== item.rarity ||
      cn.path !== en.path ||
      cn.element !== en.element ||
      cn.portrait !== en.portrait ||
      (item.kind === 'light-cone' && cn.preview !== en.preview)
    )
      throw new Error('Item identity or bilingual mismatch: ' + item.id)
    if (cn.path && !paths[cn.path]) paths[cn.path] = await definition('paths', cn.path)
    if (item.kind === 'avatar' && cn.element && !elements[cn.element]) {
      const row = await definition('elements', cn.element)
      if (!row.color || !/^#[\da-f]{6}$/i.test(row.color))
        throw new Error('Invalid source element color')
      elements[cn.element] = { ...row, color: row.color }
    }
    let portraitPath: string | undefined
    if (item.kind === 'avatar') {
      const character = planner.characters.find((row) => row.id === numericId)
      const shared = character?.assetKey ? planner.assets[character.assetKey] : undefined
      if (shared) {
        const relative = 'public/' + shared.path,
          bytes = await readBytes(root, relative),
          recorded = plannerManifest.files[relative]
        if (!recorded || recorded.sha256 !== digest(bytes) || recorded.bytes !== bytes.length)
          throw new Error('Shared portrait checksum mismatch')
        const actual = await sharp(bytes).metadata()
        manifest.files[relative] = {
          ...metadata(bytes),
          width: actual.width,
          height: actual.height,
        }
        portraitPath = shared.path
      }
    }
    items[item.id] = {
      path: cn.path,
      ...(item.kind === 'avatar' ? { element: cn.element } : {}),
      portraitPath,
      revealArtwork: await revealAsset(item.id, 'reveal-artwork', cn.portrait),
      ...(item.kind === 'avatar'
        ? { resultPortrait: await revealAsset(item.id, 'result-portrait', cn.portrait) }
        : {}),
      ...(item.kind === 'light-cone'
        ? { lightConePreview: await revealAsset(item.id, 'light-cone-preview', cn.preview) }
        : {}),
      artworkPath: await asset(
        item.id,
        'artwork',
        cn.portrait,
        item.kind === 'avatar' ? lock.transform.avatarSize : lock.transform.lightConeSize,
        lock.transform.quality,
      ),
    }
  }
  for (const rarity of [3, 4, 5] as const) {
    const file = await asset(
      String(rarity),
      'stars',
      `icon/deco/Star${rarity}.png`,
      lock.transform.starSize,
      lock.transform.iconQuality,
    )
    if (file) stars[rarity] = file
  }
  const revealFiveStars = await revealAsset('5', 'reveal-stars', 'icon/deco/Star5.png')
  if (revealFiveStars) revealStars[5] = revealFiveStars
  const revealStarBig = await revealAsset('5', 'reveal-star-big', 'icon/deco/StarBig.png')
  for (const rarity of [3, 4, 5] as const) {
    const file = await asset(
      String(rarity),
      'card-stars',
      `icon/deco/Star${rarity}.png`,
      lock.transform.cardStars.contentHeight,
      lock.transform.cardStars.quality,
      'card-stars',
    )
    if (file) {
      const meta = manifest.files['public/' + file]!
      cardStars[rarity] = { path: file, width: meta.width!, height: meta.height! }
    }
  }
  const catalog: WarpVisualCatalog = {
    schemaVersion: 1,
    items,
    paths,
    elements,
    stars,
    revealStars,
    revealStarBig,
    cardStars,
  }
  assertVisualCatalog(catalog, snapshot)
  const catalogBytes = serialize(catalog)
  manifest.files[visualDirectory + '/catalog.json'] = metadata(catalogBytes)
  await mkdir(await inside(stage, assetDirectory), { recursive: true })
  await write(stage, snapshotFile, snapshotBytes)
  await write(stage, visualDirectory + '/catalog.json', catalogBytes)
  await write(stage, visualDirectory + '/manifest.json', serialize(manifest))
  await validateVisuals(stage, lock, root)
  return manifest
}

export class RecoveryError extends AggregateError {}
/** Both owned directories roll back together; shared assets are never moved. */
export async function publishVisuals(
  root: string,
  stage: string,
  runId: string,
  hook?: (index: number) => void,
) {
  const backup = await inside(root, '.warp-visuals-backup/' + runId)
  if (await exists(backup)) throw new Error('Refuse existing Warp visual backup')
  await mkdir(backup, { recursive: true })
  const moved: { target: string; saved: string }[] = [],
    installed: string[] = []
  try {
    for (const [index, relative] of [assetDirectory, visualDirectory].entries()) {
      const target = await inside(root, relative),
        saved = path.join(backup, String(index))
      if (await exists(target)) {
        await rename(target, saved)
        moved.push({ target, saved })
      }
      await mkdir(path.dirname(target), { recursive: true })
      await rename(await inside(stage, relative), target)
      installed.push(target)
      hook?.(index)
    }
  } catch (error) {
    try {
      for (const target of installed.reverse()) await rm(target, { recursive: true })
      for (const { target, saved } of moved.reverse()) await rename(saved, target)
    } catch (recovery) {
      throw new RecoveryError(
        [error, recovery],
        'Warp visual rollback failed; preserve staging, backup and lock',
      )
    }
    throw error
  }
  await rm(backup, { recursive: true })
}
export async function withUpdateLock(
  root: string,
  operation: (stage: string, runId: string) => Promise<void>,
) {
  const runId = randomUUID(),
    guard = await inside(root, '.warp-visuals-staging/update.lock')
  await mkdir(path.dirname(guard), { recursive: true })
  await writeFile(guard, runId, { flag: 'wx' })
  const stage = await inside(root, '.warp-visuals-staging/' + runId)
  let recoveryFailed = false
  try {
    await operation(stage, runId)
  } catch (error) {
    recoveryFailed = error instanceof RecoveryError
    throw error
  } finally {
    if (!recoveryFailed) {
      await rm(stage, { recursive: true, force: true })
      await rm(guard)
    }
  }
}
export async function updateVisuals(root: string, sourceRoot: string) {
  const source = await gitSource(sourceRoot)
  await withUpdateLock(root, async (stage, runId) => {
    await generateVisuals(root, stage, source)
    await publishVisuals(root, stage, runId)
  })
  return validateVisuals(root)
}
