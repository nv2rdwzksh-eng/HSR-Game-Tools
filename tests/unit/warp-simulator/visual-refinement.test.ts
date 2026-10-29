import { ref } from 'vue'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import manifest from '../../../src/tools/warp-simulator/data/visuals/manifest.json'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import { assertVisualCatalog } from '../../../src/tools/warp-simulator/model/visual-catalog'
import catalog from '../../../src/tools/warp-simulator/data/visuals/catalog.json'
import { useWarpOverlay } from '../../../src/tools/warp-simulator/composables/useWarpOverlay'
import { useImageSource } from '../../../src/composables/useImageSource'
import { useWarpSimulator } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import { seeded } from '../../fixtures/warp-simulator/fixture'

const adapter = createPresentation(warpSnapshot, warpVisuals, '/sub/', warpVisualDefinitions)
describe('Phase 1F visual metadata and interaction isolation', () => {
  it('maps internal path IDs independently from translated names', () => {
    for (const [id, cn, en] of [
      ['Warrior', '毁灭', 'Destruction'],
      ['Knight', '存护', 'Preservation'],
      ['Priest', '丰饶', 'Abundance'],
    ]) {
      const source = warpSnapshot.items.find((item) => warpVisuals[item.id]?.path === id)!
      expect(adapter.item(source.id, 'zh-CN')).toMatchObject({ path: id, pathName: cn })
      expect(adapter.item(source.id, 'en')).toMatchObject({ path: id, pathName: en })
      expect(adapter.item(source.id, 'en').pathIconUrl).toBe(
        '/sub/' + warpVisualDefinitions.paths[id!]!.iconPath,
      )
    }
  })
  it('uses the exact original Star3/4/5 images for the matching rarities', () => {
    for (const rarity of [3, 4, 5] as const) {
      const mapping = manifest.assets.find(
        (asset) => asset.source === `icon/deco/Star${rarity}.png`,
      )!
      expect(warpVisualDefinitions.stars[rarity]).toBe(mapping.output)
      for (const item of warpSnapshot.items.filter((row) => row.rarity === rarity))
        expect(adapter.item(item.id, 'en').starsUrl).toBe('/sub/' + mapping.output)
    }
    expect(new Set(Object.values(warpVisualDefinitions.stars)).size).toBe(3)
  })
  it('localizes metadata without giving light cones an element', () => {
    expect(adapter.item('avatar:1503', 'en')).toMatchObject({
      path: 'Elation',
      pathName: 'Elation',
      element: 'Ice',
      elementName: 'Ice',
    })
    for (const source of warpSnapshot.items.filter((item) => item.kind === 'light-cone')) {
      const item = adapter.item(source.id, 'zh-CN')
      expect(item.pathIconUrl).toBeTruthy()
      expect(item.artworkUrl).toBeTruthy()
      for (const field of ['element', 'elementName', 'elementColor', 'elementIconUrl'] as const)
        expect(item[field]).toBeUndefined()
    }
  })
  it('resolves independent HD variants while preserving lightweight card URLs', () => {
    for (const source of warpSnapshot.items) {
      const item = adapter.item(source.id, 'en')
      const row = warpVisuals[source.id]!
      expect(item.artworkUrl).toBe('/sub/' + row.artworkPath)
      expect(item.revealArtwork).toEqual({
        url: '/sub/' + row.revealArtwork!.path,
        width: row.revealArtwork!.width,
        height: row.revealArtwork!.height,
      })
      expect(item.revealArtwork!.url).not.toBe(item.artworkUrl)
      expect(item.revealPathIcon?.url).toBe(
        '/sub/' + warpVisualDefinitions.paths[item.path!]!.revealIcon!.path,
      )
      expect(!!item.revealStars).toBe(source.rarity === 5)
    }
    const fallback = createPresentation(warpSnapshot, {
      'avatar:1503': { artworkPath: 'game-assets/card.webp' },
    })
    expect(fallback.item('avatar:1503', 'en')).toMatchObject({
      artworkUrl: '/game-assets/card.webp',
      revealArtwork: undefined,
    })
    for (const revealArtwork of [
      { path: 'game-assets/../bad.webp', width: 2048, height: 2048 },
      { path: 'game-assets/good.webp', width: 0, height: 2048 },
    ]) {
      const bad = createPresentation(warpSnapshot, { 'avatar:1503': { revealArtwork } })
      expect(bad.item('avatar:1503', 'en').revealArtwork).toBeUndefined()
      const invalid = structuredClone(catalog)
      invalid.items['avatar:1503'].revealArtwork = revealArtwork
      expect(() => assertVisualCatalog(invalid, warpSnapshot)).toThrow(/reveal/)
    }
  })
  it('preserves legacy star images and bounds only the card variant with a shared height', () => {
    for (const rarity of [3, 4, 5] as const) {
      const file =
        manifest.files[
          ('public/' + warpVisualDefinitions.stars[rarity]) as keyof typeof manifest.files
        ]
      expect(file).toMatchObject({ width: 160, height: 32 })
    }
    const read = (name: string) =>
      readFileSync(
        new URL('../../../src/tools/warp-simulator/components/' + name + '.vue', import.meta.url),
        'utf8',
      )
    // Structural regression guards only; real pixel sizing is manually accepted.
    expect(read('WarpVisualIcon')).toContain('width: min(var(--warp-stars-width, 80px), 100%)')
    expect(read('WarpVisualIcon')).toContain('aspect-ratio: 5 / 1')
    expect(read('WarpVisualIcon')).toContain('calc(100cqi / var(--warp-stars-reference-aspect))')
    expect(read('WarpResultCard')).toContain(':image="item.cardStars"')
    expect(read('WarpResultCard')).not.toContain('revealArtwork')
    expect(read('WarpItemVisual')).not.toContain('revealArtwork')
  })
  it('uses the HSR-Database palette for all seven elements in both languages', () => {
    // HSR-Database ELEMENT_COLORS; Lightning is named Thunder in the Warp catalog.
    const colors = {
      Physical: '#b6b6b6',
      Fire: '#f25740',
      Ice: '#6dc4ea',
      Thunder: '#d46aeb',
      Wind: '#7ad8a5',
      Quantum: '#8a86de',
      Imaginary: '#fee554',
    }
    expect(Object.keys(warpVisualDefinitions.elements).sort()).toEqual(Object.keys(colors).sort())
    for (const [element, color] of Object.entries(colors)) {
      const characters = warpSnapshot.items.filter(
        (source) => source.kind === 'avatar' && warpVisuals[source.id]?.element === element,
      )
      expect(characters.length).toBeGreaterThan(0)
      for (const source of characters) {
        for (const locale of ['zh-CN', 'en'] as const) {
          expect(adapter.item(source.id, locale)).toMatchObject({ element, elementColor: color })
        }
      }
    }
    const missing = createPresentation(warpSnapshot, { 'avatar:1503': { path: 'Elation' } })
    expect(missing.item('avatar:1503', 'en').elementColor).toBeUndefined()
    const unknown = createPresentation(warpSnapshot, { 'avatar:1503': { element: 'Unknown' } })
    expect(unknown.item('avatar:1503', 'en').elementColor).toBeUndefined()
  })
  it('rejects invalid metadata and unsafe paths while allowing explicit missing artwork', () => {
    const invalid = structuredClone(catalog)
    invalid.elements.Quantum.color = 'red'
    expect(() => assertVisualCatalog(invalid, warpSnapshot)).toThrow(/color/)
    const unsafe = structuredClone(catalog)
    unsafe.items['avatar:1503'].artworkPath = 'game-assets/../outside.webp'
    expect(() => assertVisualCatalog(unsafe, warpSnapshot)).toThrow(/Unsafe/)
    const missing = createPresentation(
      warpSnapshot,
      { 'avatar:1503': { path: 'Elation' } },
      '/',
      warpVisualDefinitions,
    )
    expect(missing.item('avatar:1503', 'en').artworkUrl).toBeUndefined()
  })
  it('keeps overlays, language, image failures and presentation reads outside RNG and session updates', async () => {
    const rng = seeded(1984),
      simulator = useWarpSimulator({ rng, storage: () => undefined }),
      overlay = useWarpOverlay()
    simulator.openSelection()
    simulator.setSelectionDraft(simulator.activeBanner.value!.eligibleAvatarIds.slice(0, 7))
    expect(simulator.confirmSelection()).toBe(true)
    expect(await simulator.draw(10)).toBe(true)
    const session = simulator.session.value,
      consumed = rng.consumed
    expect(overlay.panel.value).toBeUndefined()
    overlay.openPanel('controls')
    overlay.openPanel('history')
    overlay.afterPanelHide('controls')
    expect(overlay.panel.value).toBe('history')
    let dialogOpened = false
    overlay.openDialog(() => {
      dialogOpened = true
    }, `warp-history-${session.history[0]!.id}`)
    expect(overlay.panel.value).toBeUndefined()
    expect(dialogOpened).toBe(false)
    overlay.afterPanelHide()
    expect(dialogOpened).toBe(true)
    expect(overlay.afterDialogHide()).toBeUndefined()
    expect(overlay.panel.value).toBe('history')
    expect(overlay.takeFocus()).toBe(`warp-history-${session.history[0]!.id}`)
    overlay.closePanel()
    expect(overlay.afterPanelHide()).toBe('warp-history-trigger')
    overlay.openDialog(() => {}, 'warp-action-selection')
    expect(overlay.afterDialogHide()).toBe('warp-action-selection')
    const url = ref(adapter.item('avatar:1503', 'en').artworkUrl),
      image = useImageSource(() => url.value)
    image.fail()
    expect(image.source.value).toBeUndefined()
    for (const locale of ['zh-CN', 'en'] as const) {
      for (const entry of simulator.latestResults.value) {
        const historical = simulator.session.value.history.find((row) => row.id === entry.id)!
        expect(adapter.item(entry.event.itemId, locale)).toEqual(
          adapter.item(historical.event.itemId, locale),
        )
      }
    }
    expect(simulator.latestResults.value.map((row) => row.id)).toEqual(
      [...session.history].reverse().map((row) => row.id),
    )
    expect(simulator.session.value).toBe(session)
    expect(rng.consumed).toBe(consumed)
  })
  it('keeps stable card keys, reduced-motion, and drawers outside the result subtree', () => {
    const page = readFileSync(
      new URL('../../../src/tools/warp-simulator/WarpSimulatorPage.vue', import.meta.url),
      'utf8',
    )
    const card = readFileSync(
      new URL('../../../src/tools/warp-simulator/components/WarpResultCard.vue', import.meta.url),
      'utf8',
    )
    const results = readFileSync(
      new URL('../../../src/tools/warp-simulator/components/WarpResultsWall.vue', import.meta.url),
      'utf8',
    )
    expect(results).toContain(':key="`${entry.batchId}:${entry.id}`"')
    expect(card).toContain('prefers-reduced-motion: reduce')
    expect(card).not.toMatch(/Math\.random|draw\(/)
    expect(page.indexOf('<WarpBannerStage')).toBeLessThan(page.indexOf('<Drawer'))
  })
})
