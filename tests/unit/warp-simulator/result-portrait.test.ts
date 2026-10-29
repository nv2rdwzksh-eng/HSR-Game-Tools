import { describe, expect, it } from 'vitest'
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
import catalog from '../../../src/tools/warp-simulator/data/visuals/catalog.json'
import manifest from '../../../src/tools/warp-simulator/data/visuals/manifest.json'

describe('Original-canvas result portraits', () => {
  it('maps all reachable characters to native-sized local images and reuses existing HD outputs', () => {
    assertVisualCatalog(catalog, warpSnapshot)
    const adapter = createPresentation(warpSnapshot, warpVisuals, '/base/', warpVisualDefinitions)
    for (const item of warpSnapshot.items) {
      const presentation = adapter.item(item.id, 'en')
      if (item.kind !== 'avatar') {
        expect(presentation.resultPortrait).toBeUndefined()
        continue
      }
      const row = warpVisuals[item.id]!.resultPortrait!
      const asset = manifest.assets.find(
        (a) => a.id === item.id && a.purpose === 'result-portrait',
      )!
      const original = manifest.inputs[asset.source as keyof typeof manifest.inputs]
      if (!('width' in original) || !('height' in original))
        throw new Error('Missing source dimensions')
      expect(asset.source).toBe(`image/character_portrait/${item.id.split(':')[1]}.png`)
      expect(row).toMatchObject({ width: original.width, height: original.height })
      expect(row.path).toBe(warpVisuals[item.id]!.revealArtwork!.path)
      expect(visualAssetPaths(catalog)).toContain(row.path)
      expect(presentation.resultPortrait).toEqual({
        url: '/base/' + row.path,
        width: row.width,
        height: row.height,
      })
    }
  })
  it('rejects portraits on light cones, unsafe paths and invalid dimensions', () => {
    const copy = structuredClone(catalog)
    Object.assign(copy.items['light-cone:20000'], {
      resultPortrait: catalog.items['avatar:1415'].resultPortrait,
    })
    expect(() => assertVisualCatalog(copy, warpSnapshot)).toThrow(/light cone/)
    const bad = structuredClone(catalog)
    bad.items['avatar:1415'].resultPortrait.width = 0
    expect(() => assertVisualCatalog(bad, warpSnapshot)).toThrow(/portrait/)
    const adapter = createPresentation(warpSnapshot, {
      'avatar:1415': {
        resultPortrait: { path: 'game-assets/../bad.webp', width: 2048, height: 2048 },
      },
    })
    expect(adapter.item('avatar:1415', 'en').resultPortrait).toBeUndefined()
  })
})
