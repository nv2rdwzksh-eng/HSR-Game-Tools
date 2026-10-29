import { describe, expect, it, vi } from 'vitest'
import {
  resultDisplayScenarios,
  resultDisplaySnapshot,
  resultDisplayVisuals,
  syntheticConeId,
} from '../../fixtures/warp-simulator/result-display'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import reviewZhCN from '../../manual/warp-results/zh-CN.json'
import reviewEn from '../../manual/warp-results/en.json'

const scenarios = resultDisplayScenarios()
const scenario = (id: string) => scenarios.find((entry) => entry.id === id)!
const item = (id: string) => resultDisplaySnapshot.items.find((entry) => entry.id === id)!

describe('Result display review fixtures', () => {
  it('builds frozen, repeatable display records without RNG or source mutations', () => {
    const before = JSON.stringify({ warpSnapshot, warpVisuals, warpVisualDefinitions })
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Unexpected RNG')
    })
    try {
      const repeated = resultDisplayScenarios()
      expect(repeated).toEqual(scenarios)
      expect(Object.isFrozen(repeated)).toBe(true)
      const ids = new Set<number>()
      for (const fixture of repeated) {
        expect(Object.isFrozen(fixture.entries)).toBe(true)
        expect(fixture.entries.map((entry) => entry.id)).toEqual(
          fixture.entries.map((entry) => entry.batchId * 100 + fixture.entries.indexOf(entry) + 1),
        )
        for (const entry of fixture.entries) {
          expect(Object.isFrozen(entry.event.pityBefore)).toBe(true)
          expect(entry.event.bannerId).toBe('fixture:result-display')
          expect(ids.has(entry.id)).toBe(false)
          ids.add(entry.id)
        }
      }
      expect(random).not.toHaveBeenCalled()
      expect(JSON.stringify({ warpSnapshot, warpVisuals, warpVisualDefinitions })).toBe(before)
    } finally {
      random.mockRestore()
    }
  })

  it('covers all-three and equal-item UP/non-UP comparisons for both four- and five-star kinds', () => {
    expect(scenario('all-three').entries).toHaveLength(10)
    expect(
      scenario('all-three').entries.every(
        (entry) => entry.event.rarity === 3 && entry.event.isUp === null,
      ),
    ).toBe(true)
    for (const rarity of [4, 5]) {
      const entries = scenario(rarity === 4 ? 'four-mixed' : 'five-mixed').entries
      expect(entries).toHaveLength(10)
      for (const kind of ['avatar', 'light-cone']) {
        const matches = entries.filter(
          (entry) => entry.event.rarity === rarity && item(entry.event.itemId).kind === kind,
        )
        expect(matches.map((entry) => entry.event.isUp)).toEqual([true, false])
        expect(matches[0]!.event.itemId).toBe(matches[1]!.event.itemId)
      }
    }
  })

  it('keeps fixture rarity, localized metadata and image mappings consistent for singles and ten-pulls', () => {
    const adapter = createPresentation(
      resultDisplaySnapshot,
      resultDisplayVisuals,
      '/',
      warpVisualDefinitions,
    )
    const singles = scenarios.filter(({ id }) => id.startsWith('single-'))
    expect(singles.map(({ id }) => id)).toEqual([
      'single-light-cone-3',
      'single-avatar-4',
      'single-light-cone-4',
      'single-avatar-5',
      'single-light-cone-5',
    ])
    expect(singles.every(({ entries }) => entries.length === 1)).toBe(true)
    for (const fixture of scenarios.filter(({ overrides }) => !Object.keys(overrides).length)) {
      expect(Object.keys(fixture.overrides)).toHaveLength(0)
      for (const { event } of fixture.entries) {
        const source = item(event.itemId)
        expect(event.rarity).toBe(source.rarity)
        for (const locale of ['zh-CN', 'en'] as const) {
          const display = adapter.item(source.id, locale)
          expect(display.name).toBe(source.names[locale])
          expect(display.artworkUrl).toBeTruthy()
          expect(display.starsUrl).toBe('/' + warpVisualDefinitions.stars[event.rarity])
          expect(!!display.elementIconUrl).toBe(source.kind === 'avatar')
        }
      }
    }
  })

  it('isolates missing, failed and extreme-aspect images to the fallback scenario', () => {
    const { entries, overrides } = scenario('image-fallbacks')
    expect(entries).toHaveLength(10)
    const [missing, failed, wide, tall] = entries.map(({ event }) => overrides[event.itemId])
    expect(missing).toMatchObject({
      artworkUrl: undefined,
      pathIconUrl: undefined,
      revealArtwork: undefined,
    })
    expect(failed).toMatchObject({
      artworkUrl: '/tests/manual/warp-results/missing-fixture.webp',
      starsUrl: undefined,
    })
    expect(decodeURIComponent(wide!.artworkUrl!)).toContain('viewBox="0 0 800 80"')
    expect(decodeURIComponent(tall!.artworkUrl!)).toContain('viewBox="0 0 80 800"')
    expect(
      scenarios
        .filter(
          ({ id }) =>
            ![
              'image-fallbacks',
              'missing-artwork',
              'failed-artwork',
              'hd-fallback',
              'reveal-metadata-missing',
            ].includes(id),
        )
        .every(({ overrides }) => !Object.keys(overrides).length),
    ).toBe(true)
  })

  it('keeps the synthetic five-star light cone out of production data and reuses existing artwork', () => {
    expect(warpSnapshot.items.some(({ id }) => id === syntheticConeId)).toBe(false)
    expect(warpVisuals[syntheticConeId]).toBeUndefined()
    expect(item(syntheticConeId)).toMatchObject({ kind: 'light-cone', rarity: 5 })
    const artwork = resultDisplayVisuals[syntheticConeId].artworkPath
    expect(
      warpSnapshot.items.some(
        (entry) =>
          entry.kind === 'light-cone' &&
          entry.rarity === 4 &&
          warpVisuals[entry.id]?.artworkPath === artwork,
      ),
    ).toBe(true)
  })

  it('provides matching bilingual review messages for every fixed scenario', () => {
    expect(Object.keys(reviewZhCN)).toEqual(Object.keys(reviewEn))
    for (const messages of [reviewZhCN, reviewEn]) {
      expect(Object.keys(messages.scenarios)).toEqual(scenarios.map(({ id }) => id))
    }
  })
})
