import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import lock from './source-lock.json'
import { dataDirectory, loadSnapshot, projectRoot } from './data'
import {
  assertVisualCatalog,
  type RoleCost,
  type RolePosition,
  type VisualCatalog,
} from '../../src/tools/currency-wars/ui/visuals'
import { record } from '../../src/tools/currency-wars/validation'

const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex')
const json = (data: unknown) => JSON.stringify(data, null, 2) + '\n'
const inputs = ['ExcelOutput/GridFightRoleBasicInfo.json', 'ExcelOutput/GridFightShopPrice.json']

// The locked source has three position categories. Its CHS tutorial 11904329349261263864
// explicitly calls Herta (1013) and Tribbie (1403) dual-position; both omit FrontBackType.
// Review omissions by source role ID, never apply that interpretation to arbitrary missing data.
export function projectPosition(role: { ID: number; FrontBackType?: unknown }): RolePosition {
  if (role.FrontBackType === 'Front') {
    if (lock.dualPositionRoleIds.includes(role.ID))
      throw new Error('Reviewed position changed: ' + role.ID)
    return 'front'
  }
  if (role.FrontBackType === 'Back') {
    if (lock.dualPositionRoleIds.includes(role.ID))
      throw new Error('Reviewed position changed: ' + role.ID)
    return 'back'
  }
  if (role.FrontBackType === undefined && lock.dualPositionRoleIds.includes(role.ID)) return 'both'
  throw new Error('Unreviewed role position: ' + role.ID + ' / ' + String(role.FrontBackType))
}
const assetPaths = (catalog: VisualCatalog) =>
  [
    ...new Set([
      ...Object.values(catalog.portraits),
      ...Object.values(catalog.emblems),
      ...Object.values(catalog.traits ?? {}),
    ]),
  ].sort()

export async function checkVisualData() {
  const snapshot = await loadSnapshot()
  const bytes = await readFile(path.join(dataDirectory, 'visuals.json'))
  const manifest: unknown = JSON.parse(
    await readFile(path.join(dataDirectory, 'visuals-manifest.json'), 'utf8'),
  )
  if (
    !record(manifest) ||
    manifest.repository !== lock.repository ||
    manifest.commit !== lock.commit ||
    manifest.transformVersion !== 4 ||
    manifest.visualsSha256 !== hash(bytes) ||
    manifest.snapshotSha256 !== hash(await readFile(path.join(dataDirectory, 'snapshot.json'))) ||
    !record(manifest.assetSha256) ||
    !record(manifest.inputSha256) ||
    !inputs.every(
      (file) => typeof (manifest.inputSha256 as Record<string, unknown>)[file] === 'string',
    )
  )
    throw new Error('Currency-wars visual provenance mismatch')
  const catalog: unknown = JSON.parse(bytes.toString('utf8'))
  assertVisualCatalog(catalog, snapshot)
  if (!catalog.positions) throw new Error('Formal visual catalog requires positions')
  const paths = assetPaths(catalog)
  if (Object.keys(manifest.assetSha256).length !== paths.length)
    throw new Error('Asset inventory mismatch')
  for (const file of paths)
    if (manifest.assetSha256[file] !== hash(await readFile(path.join(projectRoot, 'public', file))))
      throw new Error('Visual asset hash mismatch: ' + file)
  return catalog
}

async function main() {
  const args = process.argv.slice(2)
  if (args.join() === '--check') {
    const visuals = await checkVisualData()
    console.log(`货币战争展示数据有效：${Object.keys(visuals.costs).length} 个形态费用。`)
    return
  }
  if (args.length !== 2 || args[0] !== '--root')
    throw new Error('Usage: visual-data.ts --root <local-source> | --check')
  const source = await realpath(path.resolve(args[1]!))
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim()
  if (
    path.resolve(git('rev-parse', '--show-toplevel')).toLowerCase() !== source.toLowerCase() ||
    git('rev-parse', 'HEAD') !== lock.commit ||
    git('status', '--porcelain')
  )
    throw new Error('Visual source must be a clean Git root at locked commit')
  const snapshot = await loadSnapshot()
  const inputSha256: Record<string, string> = {}
  const raw: unknown[] = []
  for (const file of inputs) {
    const bytes = await readFile(path.join(source, file))
    inputSha256[file] = hash(bytes)
    raw.push(JSON.parse(bytes.toString('utf8')) as unknown)
  }
  const roles = raw[0] as {
    ID: number
    AvatarID: number
    Rarity: number
    FrontBackType?: unknown
  }[]
  const prices = raw[1] as { Rarity: number; BuyGoldStar1: number }[]
  if (
    ![1, 2, 3, 4, 5].every((cost) =>
      prices.some((p) => p.Rarity === cost && p.BuyGoldStar1 === cost),
    )
  )
    throw new Error('Rarity no longer corresponds to one-star purchase cost')
  const catalog: VisualCatalog = {
    schemaVersion: 1,
    costs: {},
    positions: {},
    portraits: {},
    emblems: {},
  }
  for (const form of snapshot.roles) {
    // The synthetic tie form retains its source roleId, not a fabricated avatar or cost.
    const sourceRole = roles.find((r) => r.ID === form.roleId && r.AvatarID === form.avatarId)
    if (!sourceRole || ![1, 2, 3, 4, 5].includes(sourceRole.Rarity))
      throw new Error('Missing cost: ' + form.id)
    catalog.costs[form.id] = sourceRole.Rarity as RoleCost
    catalog.positions![form.id] = projectPosition(sourceRole)
    const portraitId = [8007, 8009].includes(form.avatarId) ? 8008 : form.avatarId
    catalog.portraits[String(form.avatarId)] = `game-assets/character/${portraitId}.webp`
  }
  for (const emblem of snapshot.emblems)
    catalog.emblems[String(emblem.traitId)] = `game-assets/emblem/${emblem.traitId}.webp`
  // These user-provided local images are independent of the locked upstream cost data.
  const traitDirectory = path.join(projectRoot, 'public/game-assets/currency-war-traits')
  const available = new Set(
    await readdir(traitDirectory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return []
      throw error
    }),
  )
  catalog.traits = Object.fromEntries(
    snapshot.traits
      .filter((trait) => available.has(`${trait.id}.webp`))
      .map((trait) => [String(trait.id), `game-assets/currency-war-traits/${trait.id}.webp`]),
  )
  assertVisualCatalog(catalog, snapshot)
  const assetSha256: Record<string, string> = {}
  for (const file of assetPaths(catalog))
    assetSha256[file] = hash(await readFile(path.join(projectRoot, 'public', file)))
  const bytes = json(catalog)
  const manifest = {
    repository: lock.repository,
    commit: lock.commit,
    gameVersion: lock.gameVersion,
    transformVersion: 4,
    inputSha256,
    snapshotSha256: hash(await readFile(path.join(dataDirectory, 'snapshot.json'))),
    visualsSha256: hash(bytes),
    assetSha256,
    notes: [
      'Costs use source role Rarity, checked against GridFightShopPrice.BuyGoldStar1.',
      'Costs are keyed by form ID and never enter optimization.',
      'Positions use FrontBackType: Front/front, Back/back, and the 20 reviewed missing-field role IDs in source-lock.json/both. Unknown values or unreviewed omissions are rejected. Synthetic forms retain their source role position; Trailblazer uses its selected front/back form.',
      'Position evidence at the locked commit: TextMap/TextMapCHS.json keys 819603370658695851 and 13120044587005628083 explain all three positions; 11904329349261263864 explicitly identifies Herta and Tribbie as dual-position, corresponding to omitted FrontBackType in GridFightRoleBasicInfo.',
      'Portraits use avatarId, with 8007 and 8009 explicitly mapped to the visually verified local Stelle portrait 8008.webp; emblem images use traitId.',
      'Trait icons use stable traitId and user-provided local currency-war-traits files, not the upstream cost source. Missing icons are omitted and use a neutral UI fallback.',
    ],
  }
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(path.join(dataDirectory, 'visuals.json'), bytes)
  await writeFile(path.join(dataDirectory, 'visuals-manifest.json'), json(manifest))
  console.log(`已生成 ${Object.keys(catalog.costs).length} 个形态的独立展示数据。`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  })
