import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  projectCraftCatalog,
  checkCraftData,
  serializeCraftData,
} from '../../../scripts/currency-wars/craft-data'
import { parseSource } from '../../../scripts/currency-wars/data'
import {
  assertCraftCatalog,
  createEmblemDemand,
  summarizeEmblemDemand,
} from '../../../src/tools/currency-wars/ui/crafting'
import { assetUrl } from '../../../src/tools/currency-wars/ui/visuals'
import { loadPageData } from '../../../src/tools/currency-wars/ui/data'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import { emblem, request, role, toy } from './helpers'

function fixture() {
  const snapshot = toy([role(1, [2007]), role(2, [2008])], [2004, 2012, 1001])
  const craft = (CraftID: number, CraftEquipID: number, CostEquipList: number[]) => ({
    CraftID,
    CraftEquipID,
    CostEquipList,
  })
  const input: Record<string, unknown> = {
    'ExcelOutput/GridFightCraftConfig.json': [
      craft(1, emblem(2004), [11, 12]),
      craft(2, emblem(2012), [12, 13]),
      craft(3, emblem(2012), [11, 13]),
      craft(4, emblem(2012), [13, 11]),
      craft(5, emblem(1001), [11, 12]),
      craft(6, 99, [11, 11]),
    ],
    'ExcelOutput/GridFightSeasonCraft.json': [1, 2, 3, 4, 6]
      .map((CraftID) => ({ CraftID, SeasonID: 1 }))
      .concat([{ CraftID: 5, SeasonID: 2 }]),
    'ExcelOutput/GridFightEquipment.json': [
      ...snapshot.emblems.map((e) => ({ ID: e.id, EquipCategory: 'Emblem' })),
      { ID: 11, EquipCategory: 'Basic' },
      { ID: 12, EquipCategory: 'Material' },
      { ID: 13, EquipCategory: 'Trash' },
      { ID: 99, EquipCategory: 'Advanced' },
    ],
    'ExcelOutput/GridFightItems.json': [...snapshot.emblems.map((e) => e.id), 11, 12, 13, 99].map(
      (ID) => ({ ID, ItemName: { Hash: ID === 13 ? '18446744073709551615' : String(ID) } }),
    ),
    'TextMap/TextMapCHS.json': {
      '11': '基础装备',
      '12': '钻石',
      '18446744073709551615': '特殊材料',
    },
  }
  const icons = new Set(['11.webp', '12.webp', '13.webp'])
  return { snapshot, input, icons }
}

describe('independent craft catalog', () => {
  it('joins by equipment ID, filters seasons, preserves alternatives and deduplicates ingredient order with provenance', () => {
    const { snapshot, input, icons } = fixture()
    const catalog = projectCraftCatalog(input, snapshot, icons)
    expect(catalog.recipes[String(emblem(2004))]).toEqual([{ craftIds: [1], materials: [11, 12] }])
    expect(catalog.recipes[String(emblem(2012))]).toEqual([
      { craftIds: [2], materials: [12, 13] },
      { craftIds: [3, 4], materials: [11, 13] },
    ])
    expect(catalog.recipes[String(emblem(1001))]).toEqual([])
    expect(catalog.materials.map((m) => [m.id, m.name])).toEqual([
      [11, '基础装备'],
      [12, '钻石'],
      [13, '特殊材料'],
    ])
    expect(() => assertCraftCatalog(catalog, snapshot)).not.toThrow()
  })

  it('preserves repeated ingredients and exact large Hash lexemes', () => {
    const { snapshot, input, icons } = fixture()
    const crafts = input['ExcelOutput/GridFightCraftConfig.json'] as { CostEquipList: number[] }[]
    crafts[0]!.CostEquipList = [13, 13]
    expect(parseSource('{"Hash":18446744073709551615}')).toEqual({ Hash: '18446744073709551615' })
    const catalog = projectCraftCatalog(input, snapshot, icons)
    expect(catalog.recipes[String(emblem(2004))]![0]!.materials).toEqual([13, 13])
    expect(catalog.materials.find((m) => m.id === 13)!.name).toBe('特殊材料')
  })

  it('is byte-deterministic under reordered source arrays and keeps missing icons distinct from missing names', () => {
    const { snapshot, input } = fixture()
    const first = projectCraftCatalog(input, snapshot, new Set())
    const shuffled = Object.fromEntries(
      Object.entries(input)
        .reverse()
        .map(([file, value]) => [file, Array.isArray(value) ? [...value].reverse() : value]),
    )
    expect(serializeCraftData(projectCraftCatalog(shuffled, snapshot, new Set()))).toBe(
      serializeCraftData(first),
    )
    expect(first.materials.every((m) => m.icon === undefined)).toBe(true)
    expect(first.recipes[String(emblem(2012))]).toHaveLength(2)
  })

  it.each([
    'source',
    'season',
    'output',
    'material',
    'item',
    'name',
    'hash',
    'duplicateCraft',
    'duplicateSeason',
    'unlistedEmblem',
  ])('fails explicitly for invalid %s data instead of recording no recipes', (defect) => {
    const { snapshot, input, icons } = fixture()
    const crafts = input['ExcelOutput/GridFightCraftConfig.json'] as {
      CraftID: number
      CraftEquipID: number
      CostEquipList: number[]
    }[]
    const seasons = input['ExcelOutput/GridFightSeasonCraft.json'] as {
      CraftID: number
      SeasonID: number
    }[]
    if (defect === 'source') delete input['ExcelOutput/GridFightCraftConfig.json']
    if (defect === 'season') seasons.push({ CraftID: 999, SeasonID: 1 })
    if (defect === 'output') crafts[0]!.CraftEquipID = 999
    if (defect === 'material') crafts[0]!.CostEquipList = [11, 999]
    if (defect === 'item')
      input['ExcelOutput/GridFightItems.json'] = (
        input['ExcelOutput/GridFightItems.json'] as { ID: number }[]
      ).filter((i) => i.ID !== 13)
    if (defect === 'name')
      delete (input['TextMap/TextMapCHS.json'] as Record<string, string>)['18446744073709551615']
    if (defect === 'hash')
      (
        input['ExcelOutput/GridFightItems.json'] as { ID: number; ItemName: { Hash: unknown } }[]
      ).find((i) => i.ID === 13)!.ItemName.Hash = Number('18446744073709551615')
    if (defect === 'duplicateCraft') crafts.push(crafts[0]!)
    if (defect === 'duplicateSeason') seasons.push(seasons[0]!)
    if (defect === 'unlistedEmblem')
      (
        input['ExcelOutput/GridFightEquipment.json'] as { ID: number; EquipCategory: string }[]
      ).find((e) => e.ID === 99)!.EquipCategory = 'Emblem'
    expect(() => projectCraftCatalog(input, snapshot, icons)).toThrow()
  })

  it.each(['coverage', 'pair', 'craftId', 'material', 'icon', 'season'])(
    'rejects a damaged normalized catalog: %s',
    (defect) => {
      const { snapshot, input, icons } = fixture()
      const catalog = projectCraftCatalog(input, snapshot, icons)
      if (defect === 'coverage') delete catalog.recipes[String(emblem(1001))]
      if (defect === 'pair')
        catalog.recipes[String(emblem(2012))]!.push({ craftIds: [100], materials: [13, 12] })
      if (defect === 'craftId') catalog.recipes[String(emblem(2012))]![0]!.craftIds = [1]
      if (defect === 'material') catalog.recipes[String(emblem(2012))]![0]!.materials = [11, 999]
      if (defect === 'icon')
        catalog.materials[0]!.icon = 'game-assets/currency-war-equipments/../11.webp'
      if (defect === 'season') catalog.seasonId = 2
      expect(() => assertCraftCatalog(catalog, snapshot)).toThrow()
    },
  )

  it('validates the checked-in locked-season catalog and all referenced local assets without upstream reads', async () => {
    const { snapshot, crafts } = loadPageData()
    expect(await checkCraftData()).toEqual(crafts)
    expect(Object.keys(crafts.recipes)).toHaveLength(snapshot.emblems.length)
    expect(Object.values(crafts.recipes).filter((r) => r.length)).toHaveLength(17)
    expect(Object.values(crafts.recipes).flat()).toHaveLength(18)
    expect(crafts.recipes['35052012']).toEqual([
      { craftIds: [57], materials: [350602, 352101] },
      { craftIds: [58], materials: [350601, 352101] },
    ])
    expect(
      Object.entries(crafts.recipes)
        .filter(([, r]) => !r.length)
        .map(([id]) => Number(id)),
    ).toEqual([35051001, 35051013, 35052005, 35052009, 35052010])
    expect(crafts.materials).toHaveLength(11)
    expect(crafts.materials.every((m) => !!m.icon)).toBe(true)
    const bytes = readFileSync(
      new URL('../../../data/currency-wars/crafts.json', import.meta.url),
      'utf8',
    )
    expect(serializeCraftData(crafts)).toBe(bytes)
  })
})

describe('single-lineup emblem demand', () => {
  it('counts all used IDs, including noncraftable emblems, with stable quantity/ID ordering and no mutations', () => {
    const { snapshot, input, icons } = fixture()
    const solution = {
      lineup: {
        members: [
          { formId: '1', emblemIds: [emblem(2004), emblem(2012)] },
          { formId: '2', emblemIds: [emblem(2004), emblem(1001)] },
        ],
      },
    }
    const before = structuredClone(solution)
    const evaluation = evaluateLineup(snapshot, request([], { emblemBudget: 4 }), solution.lineup)
    expect(evaluation.valid, evaluation.errors.join(';')).toBe(true)
    const summary = summarizeEmblemDemand(solution)
    expect(summary).toEqual([
      { emblemId: emblem(2004), count: 2 },
      { emblemId: emblem(1001), count: 1 },
      { emblemId: emblem(2012), count: 1 },
    ])
    expect(summary.reduce((n, row) => n + row.count, 0)).toBe(evaluation.emblemCount)
    const demands = createEmblemDemand(
      solution,
      snapshot,
      projectCraftCatalog(input, snapshot, icons),
      {
        schemaVersion: 1,
        costs: {},
        portraits: {},
        emblems: {
          2004: 'game-assets/emblem/2004.webp',
          1001: 'game-assets/emblem/1001.webp',
          2012: 'game-assets/emblem/2012.webp',
        },
      },
      '/hsr/',
    )
    expect(demands[0]!.icon).toBe('/hsr/game-assets/emblem/2004.webp')
    expect(demands[0]!.recipes[0]!.materials[0]!.icon).toBe(
      '/hsr/game-assets/currency-war-equipments/11.webp',
    )
    expect(demands[1]!.recipes).toEqual([])
    expect(demands[2]!.recipes).toHaveLength(2)
    expect(solution).toEqual(before)
  })

  it('keeps input lineups independent, handles empty lineups and permits missing material icons', () => {
    const { snapshot, input } = fixture()
    const a = { lineup: { members: [{ formId: '1', emblemIds: [emblem(2012)] }] } }
    const b = { lineup: { members: [{ formId: '1', emblemIds: [] }] } }
    expect(summarizeEmblemDemand(a)).toEqual([{ emblemId: emblem(2012), count: 1 }])
    expect(summarizeEmblemDemand(b)).toEqual([])
    expect(summarizeEmblemDemand({ lineup: { members: [] } })).toEqual([])
    const demands = createEmblemDemand(
      a,
      snapshot,
      projectCraftCatalog(input, snapshot, new Set()),
      { schemaVersion: 1, costs: {}, portraits: {}, emblems: {} },
      '/',
    )
    expect(demands[0]!.recipes[0]!.materials.every((m) => m.icon === undefined && m.name)).toBe(
      true,
    )
    expect(assetUrl('game-assets/currency-war-equipments/11.webp', '/')).toBe(
      '/game-assets/currency-war-equipments/11.webp',
    )
    expect(assetUrl('https://example.test/11.webp', '/')).toBeUndefined()
  })
})
