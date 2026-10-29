import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { effectScope } from 'vue'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import {
  assertVisualCatalog,
  visualAssetPaths,
} from '../../../src/tools/warp-simulator/model/visual-catalog'
import {
  useWarpRevealSource,
  revealPixelLimit,
} from '../../../src/tools/warp-simulator/composables/useWarpRevealSource'
import catalog from '../../../src/tools/warp-simulator/data/visuals/catalog.json'
import manifest from '../../../src/tools/warp-simulator/data/visuals/manifest.json'
import { resultDisplayScenarios } from '../../fixtures/warp-simulator/result-display'

describe('Transparent light cone preview contract', () => {
  it('keeps manual failure scenarios on the preview fallback path', () => {
    const failure = resultDisplayScenarios().find((s) => s.id === 'failed-artwork')!
    const override = failure.overrides[failure.entries[0]!.event.itemId]!
    expect(override.lightConePreview?.url).toContain('missing-preview')
    expect(override.artworkUrl).toContain('missing-fixture')
  })
  it('maps every reachable cone to a locked local preview with native dimensions and alpha', async () => {
    assertVisualCatalog(catalog, warpSnapshot)
    const adapter = createPresentation(warpSnapshot, warpVisuals, '/base/', warpVisualDefinitions)
    for (const source of warpSnapshot.items) {
      const item = adapter.item(source.id, 'en')
      if (source.kind === 'avatar') {
        expect(item.lightConePreview).toBeUndefined()
        continue
      }
      expect(item.lightConePreview).toMatchObject({ width: 348, height: 408 })
      expect(item.lightConePreview!.url).not.toBe(item.revealArtwork!.url)
      const preview = warpVisuals[source.id]!.lightConePreview!
      expect(item.lightConePreview!.url).toBe('/base/' + preview.path)
      expect(visualAssetPaths(catalog)).toContain(preview.path)
      const asset = manifest.assets.find(
        (a) => a.id === source.id && a.purpose === 'light-cone-preview',
      )!
      expect(asset.source).toBe(`image/light_cone_preview/${source.id.split(':')[1]}.png`)
      const bytes = readFileSync(new URL('../../../public/' + preview.path, import.meta.url))
      expect(await sharp(bytes).metadata()).toMatchObject({
        width: 348,
        height: 408,
        hasAlpha: true,
      })
    }
  })
  it('rejects avatar preview fields and malformed dimensions', () => {
    const copy = structuredClone(catalog)
    const avatar = warpSnapshot.items.find((i) => i.kind === 'avatar')!
    Object.assign(copy.items[avatar.id as keyof typeof copy.items], {
      lightConePreview: { path: 'game-assets/warp/a.webp', width: 1, height: 1 },
    })
    expect(() => assertVisualCatalog(copy, warpSnapshot)).toThrow(/avatar/)
    const malformed = structuredClone(catalog)
    malformed.items['light-cone:20000'].lightConePreview.width = 0
    expect(() => assertVisualCatalog(malformed, warpSnapshot)).toThrow(/preview/)
  })
  it('falls back preview → artwork → ready neutral placeholder, retaining DPR limits', () => {
    const scope = effectScope()
    const image = scope.run(() =>
      useWarpRevealSource(
        () => ({ url: '/preview.webp', width: 348, height: 408 }),
        () => '/artwork.webp',
      ),
    )!
    expect(image.source.value).toBe('/preview.webp')
    expect(revealPixelLimit(348, 408, 2)).toEqual({ maxWidth: '174px', maxHeight: '204px' })
    image.fail('/preview.webp')
    expect(image.source.value).toBe('/artwork.webp')
    image.fail('/artwork.webp')
    expect(image.ready.value).toBe(true)
    expect(image.source.value).toBeUndefined()
    scope.stop()
  })
})
