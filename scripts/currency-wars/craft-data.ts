import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import lock from './source-lock.json'
import { dataDirectory, loadSnapshot, parseSource, projectRoot } from './data'
import { positiveInteger, record } from '../../src/tools/currency-wars/validation'
import {
  assertCraftCatalog,
  type CurrencyWarsCraftCatalog,
  type EmblemRecipe,
} from '../../src/tools/currency-wars/ui/crafting'
import type { Snapshot } from '../../src/tools/currency-wars/types'

const inputs = [
  'ExcelOutput/GridFightCraftConfig.json',
  'ExcelOutput/GridFightSeasonCraft.json',
  'ExcelOutput/GridFightEquipment.json',
  'ExcelOutput/GridFightItems.json',
  'TextMap/TextMapCHS.json',
]
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
export const serializeCraftData = (value: unknown) => JSON.stringify(value, null, 2) + '\n'

/** Project authoritative recipe relations; neither equipment category nor names imply recipes. */
export function projectCraftCatalog(
  input: Record<string, unknown>,
  snapshot: Snapshot,
  availableIcons: ReadonlySet<string>,
): CurrencyWarsCraftCatalog {
  function rows(name: string) {
    const value = input[`ExcelOutput/${name}.json`]
    if (!Array.isArray(value) || !value.length || !value.every(record))
      throw new Error('Missing/invalid craft source: ' + name)
    return value as Record<string, unknown>[]
  }
  function indexed(name: string, key: string) {
    const entries = new Map<number, Record<string, unknown>>()
    for (const row of rows(name)) {
      const id = row[key]
      if (!positiveInteger(id) || entries.has(id))
        throw new Error(`Duplicate/invalid ${name} ${key}`)
      entries.set(id, row)
    }
    return entries
  }
  const crafts = indexed('GridFightCraftConfig', 'CraftID')
  const equipment = indexed('GridFightEquipment', 'ID')
  const items = indexed('GridFightItems', 'ID')
  const textMap = input['TextMap/TextMapCHS.json']
  if (!record(textMap)) throw new Error('Missing Chinese craft TextMap')
  const activeIds = new Set<number>()
  const seasonPairs = new Set<string>()
  for (const row of rows('GridFightSeasonCraft')) {
    if (!positiveInteger(row.CraftID) || !positiveInteger(row.SeasonID))
      throw new Error('Invalid craft season association')
    const key = `${row.SeasonID}:${row.CraftID}`
    if (seasonPairs.has(key)) throw new Error('Duplicate craft season association')
    seasonPairs.add(key)
    if (row.SeasonID !== lock.seasonId) continue
    if (!crafts.has(row.CraftID)) throw new Error('Unknown seasonal CraftID: ' + row.CraftID)
    activeIds.add(row.CraftID)
  }
  if (!activeIds.size) throw new Error('Missing current-season crafts')
  const grouped = new Map(snapshot.emblems.map((e) => [e.id, new Map<string, EmblemRecipe>()]))
  for (const emblem of snapshot.emblems)
    if (equipment.get(emblem.id)?.EquipCategory !== 'Emblem' || !items.has(emblem.id))
      throw new Error('Missing source emblem: ' + emblem.id)
  const materialIds = new Set<number>()
  for (const craftId of [...activeIds].sort((a, b) => a - b)) {
    const row = crafts.get(craftId)!
    if (!positiveInteger(row.CraftEquipID) || !equipment.has(row.CraftEquipID))
      throw new Error('Unknown craft output: ' + craftId)
    if (
      !Array.isArray(row.CostEquipList) ||
      row.CostEquipList.length !== 2 ||
      !row.CostEquipList.every((id) => positiveInteger(id) && equipment.has(id) && items.has(id))
    )
      throw new Error('Invalid craft materials: ' + craftId)
    if (!grouped.has(row.CraftEquipID)) {
      if (equipment.get(row.CraftEquipID)!.EquipCategory === 'Emblem')
        throw new Error('Seasonal emblem absent from snapshot: ' + row.CraftEquipID)
      continue
    }
    const materials = [...row.CostEquipList].sort((a, b) => a - b) as [number, number]
    const recipes = grouped.get(row.CraftEquipID)!
    const key = materials.join(',')
    const existing = recipes.get(key)
    if (existing) existing.craftIds.push(craftId)
    else recipes.set(key, { craftIds: [craftId], materials })
    for (const id of materials) materialIds.add(id)
  }
  const materials = [...materialIds]
    .sort((a, b) => a - b)
    .map((id) => {
      const ref = items.get(id)!.ItemName
      if (!record(ref) || typeof ref.Hash !== 'string' || !/^(0|[1-9][0-9]*)$/.test(ref.Hash))
        throw new Error('Invalid material name Hash: ' + id)
      const name = textMap[ref.Hash]
      if (typeof name !== 'string' || !name.trim()) throw new Error('Missing material name: ' + id)
      return {
        id,
        name,
        ...(availableIcons.has(`${id}.webp`)
          ? { icon: `game-assets/currency-war-equipments/${id}.webp` }
          : {}),
      }
    })
  const catalog: CurrencyWarsCraftCatalog = {
    schemaVersion: 1,
    seasonId: lock.seasonId,
    materials,
    recipes: Object.fromEntries(
      [...grouped]
        .sort(([a], [b]) => a - b)
        .map(([id, recipes]) => [String(id), [...recipes.values()]]),
    ),
  }
  assertCraftCatalog(catalog, snapshot, lock.seasonId)
  return catalog
}

function coverage(catalog: CurrencyWarsCraftCatalog) {
  return {
    emblems: Object.keys(catalog.recipes).length,
    craftableEmblems: Object.values(catalog.recipes).filter((recipes) => recipes.length).length,
    recipes: Object.values(catalog.recipes).reduce((n, recipes) => n + recipes.length, 0),
    sourceCrafts: Object.values(catalog.recipes)
      .flat()
      .reduce((n, recipe) => n + recipe.craftIds.length, 0),
    materials: catalog.materials.length,
    missingIconIds: catalog.materials
      .filter((material) => !material.icon)
      .map((material) => material.id),
  }
}

export async function checkCraftData() {
  const snapshot = await loadSnapshot()
  const bytes = await readFile(path.join(dataDirectory, 'crafts.json'))
  const manifest: unknown = JSON.parse(
    await readFile(path.join(dataDirectory, 'crafts-manifest.json'), 'utf8'),
  )
  if (
    !record(manifest) ||
    manifest.repository !== lock.repository ||
    manifest.commit !== lock.commit ||
    manifest.gameVersion !== lock.gameVersion ||
    manifest.seasonId !== lock.seasonId ||
    manifest.transformVersion !== 1 ||
    manifest.craftsSha256 !== hash(bytes) ||
    manifest.snapshotSha256 !== hash(await readFile(path.join(dataDirectory, 'snapshot.json'))) ||
    !record(manifest.inputSha256) ||
    Object.keys(manifest.inputSha256).length !== inputs.length ||
    !inputs.every(
      (file) =>
        typeof (manifest.inputSha256 as Record<string, unknown>)[file] === 'string' &&
        /^[a-f0-9]{64}$/.test((manifest.inputSha256 as Record<string, string>)[file]),
    ) ||
    !record(manifest.assetSha256)
  )
    throw new Error('Currency-wars craft provenance/hash mismatch')
  const catalog: unknown = JSON.parse(bytes.toString('utf8'))
  assertCraftCatalog(catalog, snapshot, lock.seasonId)
  if (serializeCraftData(manifest.coverage) !== serializeCraftData(coverage(catalog)))
    throw new Error('Craft coverage mismatch')
  const paths = catalog.materials.flatMap((material) => (material.icon ? [material.icon] : []))
  if (Object.keys(manifest.assetSha256).length !== paths.length)
    throw new Error('Craft asset inventory mismatch')
  for (const file of paths)
    if (manifest.assetSha256[file] !== hash(await readFile(path.join(projectRoot, 'public', file))))
      throw new Error('Craft asset hash mismatch: ' + file)
  return catalog
}

async function main() {
  const args = process.argv.slice(2)
  if (args.join() === '--check') {
    console.log(JSON.stringify(coverage(await checkCraftData())))
    return
  }
  if (args.length !== 2 || args[0] !== '--root')
    throw new Error('Usage: craft-data.ts --root <local-source> | --check')
  const source = await realpath(path.resolve(args[1]!))
  const git = (...args: string[]) =>
    execFileSync('git', ['-C', source, ...args], { encoding: 'utf8' }).trim()
  if (
    path.resolve(git('rev-parse', '--show-toplevel')).toLowerCase() !== source.toLowerCase() ||
    git('rev-parse', 'HEAD') !== lock.commit ||
    git('status', '--porcelain')
  )
    throw new Error('Craft source must be a clean Git root at locked commit')
  const snapshot = await loadSnapshot()
  const input: Record<string, unknown> = {}
  const inputSha256: Record<string, string> = {}
  for (const file of inputs) {
    const bytes = await readFile(path.join(source, file))
    inputSha256[file] = hash(bytes)
    input[file] = parseSource(bytes.toString('utf8'))
  }
  const icons = new Set(
    await readdir(path.join(projectRoot, 'public/game-assets/currency-war-equipments')).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return []
        throw error
      },
    ),
  )
  const catalog = projectCraftCatalog(input, snapshot, icons)
  const bytes = serializeCraftData(catalog)
  const assetSha256: Record<string, string> = {}
  for (const material of catalog.materials)
    if (material.icon)
      assetSha256[material.icon] = hash(
        await readFile(path.join(projectRoot, 'public', material.icon)),
      )
  const manifest = {
    repository: lock.repository,
    commit: lock.commit,
    gameVersion: lock.gameVersion,
    seasonId: lock.seasonId,
    transformVersion: 1,
    inputSha256,
    snapshotSha256: hash(await readFile(path.join(dataDirectory, 'snapshot.json'))),
    craftsSha256: hash(bytes),
    assetSha256,
    coverage: coverage(catalog),
    notes: [
      'Only CraftIDs explicitly associated with the locked season are used; outputs join snapshot emblems by equipment ID.',
      'Equivalent ingredient multisets are merged while preserving every source CraftID; empty arrays explicitly record no recipe in this season.',
      'Chinese material names use exact Hash lexemes. Local material icons were supplied by the user and are mapped by item ID; missing icons retain names and use neutral UI placeholders.',
    ],
  }
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(path.join(dataDirectory, 'crafts.json'), bytes)
  await writeFile(path.join(dataDirectory, 'crafts-manifest.json'), serializeCraftData(manifest))
  console.log(JSON.stringify(manifest.coverage))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 2
  })
