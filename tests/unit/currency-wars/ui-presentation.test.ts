import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileStyle } from 'vue/compiler-sfc'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import { loadPageData } from '../../../src/tools/currency-wars/ui/data'
import {
  assetUrl,
  assertVisualCatalog,
  createVisuals,
} from '../../../src/tools/currency-wars/ui/visuals'
import { checkVisualData, projectPosition } from '../../../scripts/currency-wars/visual-data'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import { request, task } from './helpers'

describe('currency-wars UI data and visuals', () => {
  it.each(['zh-CN', 'en'] as const)(
    'resolves crafting UI messages in the correct namespace (%s)',
    (locale) => {
      const { global: messages } = createI18n({
        legacy: false,
        locale,
        fallbackLocale: false,
        messages: { 'zh-CN': zhCN, en },
      })
      for (const name of ['title', 'empty', 'quantity', 'recipes', 'or']) {
        const key = `currencyWars.crafting.${name}`
        expect(messages.te(key)).toBe(true)
        expect(messages.t(key, { name: 'Test emblem', count: 3 })).not.toBe(key)
      }
      const quantity = messages.t('currencyWars.crafting.quantity', {
        name: 'Test emblem',
        count: 3,
      })
      expect(quantity).toContain('Test emblem')
      expect(quantity).toContain('3')
    },
  )

  it('maps real trait IDs to local icons, supports subpaths and permits absent icons and legacy catalogs', () => {
    const { snapshot, visuals } = loadPageData()
    expect(Object.keys(visuals.traits!)).toHaveLength(32)
    expect(
      snapshot.traits.filter((trait) => !visuals.traits![trait.id]).map((trait) => trait.id),
    ).toEqual([1014])
    expect(createVisuals(snapshot, visuals).traitUrl(1001)).toBe(
      '/game-assets/currency-war-traits/1001.webp',
    )
    expect(createVisuals(snapshot, visuals, '/hsr/').traitUrl(1001)).toBe(
      '/hsr/game-assets/currency-war-traits/1001.webp',
    )
    expect(createVisuals(snapshot, visuals, '/hsr').traitUrl(1014)).toBeUndefined()
    const legacy = { ...visuals, traits: undefined }
    expect(() => assertVisualCatalog(legacy, snapshot)).not.toThrow()
    expect(createVisuals(snapshot, legacy).traitUrl(1001)).toBeUndefined()
    for (const path of [
      'https://example.test/1001.webp',
      'game-assets/currency-war-traits/../1001.webp',
    ])
      expect(assetUrl(path, '/')).toBeUndefined()
    expect(() =>
      assertVisualCatalog(
        { ...visuals, traits: { '1001': 'game-assets/currency-war-traits/1002.webp' } },
        snapshot,
      ),
    ).toThrow()
    expect(() =>
      assertVisualCatalog(
        { ...visuals, traits: { '9999': 'game-assets/currency-war-traits/9999.webp' } },
        snapshot,
      ),
    ).toThrow()
  })

  it('loads all 25 formal tasks and independently verified display metadata', async () => {
    const data = loadPageData()
    expect(data.tasks).toHaveLength(25)
    expect(await checkVisualData()).toEqual(data.visuals)
    expect(new Set(Object.values(data.visuals.costs))).toEqual(new Set([1, 2, 3, 4, 5]))
    expect(data.visuals.costs['15061']).toBe(3)
    expect(data.visuals.costs['15062']).toBe(4)
    expect(data.visuals.costs['15063']).toBe(5)
    expect(data.visuals.costs['1204']).toBe(5)
    expect(data.visuals.costs['12041']).toBe(1)
    expect(data.visuals.costs['12042']).toBe(3)
    expect(data.visuals.costs['11011:tie']).toBe(data.visuals.costs['11011'])
  })

  it('uses avatarId for portraits, traitId for emblems, and always returns three slots', () => {
    const { snapshot, visuals } = loadPageData()
    const view = createVisuals(snapshot, visuals, '/hsr/')
    const lineup = { members: [{ formId: '15062', emblemIds: [35051007] }] }
    const evaluated = evaluateLineup(snapshot, request(), lineup)
    const member = view.member(lineup.members[0]!, evaluated.members[0]!)
    expect(member.portraitUrl).toBe('/hsr/game-assets/character/1506.webp')
    expect(member.cost).toBe(4)
    expect(member.slots).toHaveLength(3)
    expect(member.slots[0]!.url).toBe('/hsr/game-assets/emblem/1007.webp')
    expect(member.slots.slice(1)).toEqual([undefined, undefined])
    expect(assetUrl('https://example.test/image.webp', '/')).toBeUndefined()
    expect(assetUrl('game-assets/character/../1.webp', '/')).toBeUndefined()
  })

  it('projects reviewed positions without guessing unknown fields or missing legacy metadata', () => {
    const { snapshot, visuals } = loadPageData()
    const view = createVisuals(snapshot, visuals)
    const display = (id: string) =>
      view.member(
        { formId: id, emblemIds: [] },
        { formId: id, innateTraits: [], emblemTraits: [], extraTraits: [], finalTraits: [] },
      ).position
    expect(display('8007')).toBe('front')
    expect(display('8009')).toBe('back')
    expect(display('1013')).toBe('both')
    expect(display('1403')).toBe('both')
    expect(display('11011:tie')).toBe(display('11011'))
    expect(Object.values(visuals.positions).filter((p) => p === 'both')).toHaveLength(20)
    for (const [ID, FrontBackType, position] of [
      [8007, 'Front', 'front'],
      [8009, 'Back', 'back'],
      [1013, undefined, 'both'],
    ] as const)
      expect(projectPosition({ ID, FrontBackType })).toBe(position)
    for (const entry of [
      { ID: 99999 },
      { ID: 8007, FrontBackType: 'Unknown' },
      { ID: 1013, FrontBackType: 'Front' },
      { ID: 1013, FrontBackType: null },
    ])
      expect(() => projectPosition(entry)).toThrow()
    const legacy = createVisuals(snapshot, { ...visuals, positions: undefined })
    const evaluated = {
      formId: '1013',
      innateTraits: [],
      emblemTraits: [],
      extraTraits: [],
      finalTraits: [],
    }
    expect(legacy.member({ formId: '1013', emblemIds: [] }, evaluated).position).toBeUndefined()
    expect(legacy.member({ formId: '8009', emblemIds: [] }, evaluated).position).toBe('back')
    for (const positions of [
      { ...visuals.positions, '8007': 'both' },
      { ...visuals.positions, '1013': 'unknown' },
      Object.fromEntries(Object.entries(visuals.positions).filter(([id]) => id !== '1013')),
    ])
      expect(() => assertVisualCatalog({ ...visuals, positions }, snapshot)).toThrow()
  })

  it('uses actual navigator and Bronya metadata and calculator-supplied extra traits', () => {
    const { snapshot, visuals } = loadPageData()
    const lineup = {
      members: [
        { formId: '1510', emblemIds: [], navigatorTarget: '1218' },
        { formId: '1218', emblemIds: [35051001, 35052010, 35052012] },
      ],
    }
    const evaluated = evaluateLineup(
      snapshot,
      request([task(2007, 2), task(2010, 2), task(2012, 2)], { emblemBudget: 3 }),
      lineup,
    )
    expect(evaluated.valid, evaluated.errors.join('; ')).toBe(true)
    const member = createVisuals(snapshot, visuals).member(
      lineup.members[0]!,
      evaluated.members[0]!,
    )
    expect(member.target!.name).toBe('椒丘')
    expect(member.extra.map((t) => t.id)).toEqual([2007, 2008])
    expect(member.targetCost).toBe(visuals.costs['1218'])
    expect(member.finalTraits.map((t) => t.id)).toEqual(
      [...new Set(evaluated.members[0]!.finalTraits)].sort((a, b) => a - b),
    )
    const duplicated = createVisuals(snapshot, visuals).member(lineup.members[0]!, {
      ...evaluated.members[0]!,
      finalTraits: [...evaluated.members[0]!.finalTraits, 2008],
    })
    expect(duplicated.finalTraits).toEqual(member.finalTraits)
    expect(evaluated.tasks.map((t) => [t.actualCount, t.completed])).toEqual([
      [2, true],
      [1, false],
      [1, false],
    ])
    for (const traitId of [2010, 2012])
      expect(evaluated.traits.find((t) => t.traitId === traitId)!.contributors).toEqual(['1218'])
    const target = createVisuals(snapshot, visuals).member(
      lineup.members[1]!,
      evaluated.members[1]!,
    )
    expect(target.slots.map((slot) => slot!.traitId)).toEqual([1001, 2010, 2012])
  })

  it('keeps the vendored theme opt-in and every theme selector inside its explicit boundary', () => {
    const library = new URL('../../../vendor/astral-ui/src/lib/', import.meta.url)
    const entry = readFileSync(new URL('components.ts', library), 'utf8')
    expect(entry).not.toContain("import './theme.css'")
    const source = readFileSync(new URL('scoped-theme.css', library), 'utf8')
    const result = compileStyle({ source, filename: 'scoped-theme.css', id: 'scope-check' })
    expect(result.errors).toEqual([])
    const selectors: string[] = []
    result.rawResult!.root.walkRules((rule) => {
      selectors.push(...rule.selectors)
    })
    expect(selectors.length).toBeGreaterThan(20)
    expect(selectors.every((selector) => selector.includes(':where(.h-theme)'))).toBe(true)
    expect(source).not.toContain('font.ttf')
  })

  it('registers a lazy page, keeps image-error fallback, and never calls the solver from the page thread', () => {
    const source = (file: string) =>
      readFileSync(new URL('../../../' + file, import.meta.url), 'utf8')
    expect(source('src/router/index.ts')).toContain("path: '/currency-wars'")
    expect(source('src/tools/catalog.ts')).toContain("route: '/currency-wars'")
    expect(source('src/tools/currency-wars/CurrencyWarsPage.vue')).not.toMatch(
      /solveCurrencyWars|highsSolver/,
    )
    expect(source('src/tools/currency-wars/browser/solver.worker.ts')).toContain(
      'solveCurrencyWars(snapshot, request, browserSolver)',
    )
    const image = source('src/tools/currency-wars/components/CurrencyImage.vue')
    expect(image).toContain('@error=')
    expect(image).toContain('v-else')
    expect(source('src/tools/currency-wars/ui/trait-details.ts')).toContain(
      'activeThreshold !== null',
    )
  })
})
