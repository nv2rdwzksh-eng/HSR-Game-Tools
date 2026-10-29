import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { parse } from 'vue/compiler-sfc'
import { readFileSync } from 'node:fs'
import {
  inspectStarCrop,
  cardStarDimensions,
  cardStarKey,
} from '../../../scripts/warp-visuals/card-stars'
import lock from '../../../scripts/warp-visuals/source-lock.json'
import { starFixture } from '../../fixtures/warp-simulator/stars'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import {
  warpSnapshot,
  warpVisualDefinitions,
  warpVisuals,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import { assertVisualCatalog } from '../../../src/tools/warp-simulator/model/visual-catalog'
import catalog from '../../../src/tools/warp-simulator/data/visuals/catalog.json'

describe('Result-card-only trimmed stars', () => {
  it('keeps cone path/stars separate from the character element/stars overlay', () => {
    const source = readFileSync(
      new URL('../../../src/tools/warp-simulator/components/WarpResultCard.vue', import.meta.url),
      'utf8',
    )
    const root = parse(source).descriptor.template!.ast!
    type Element = Extract<(typeof root.children)[number], { type: 1 }>
    const elements: Element[] = []
    function visit(node: typeof root | Element) {
      if (node.type === 1) elements.push(node)
      for (const child of node.children) if (child.type === 1) visit(child)
    }
    visit(root)
    const hasClass = (node: Element, value: string) =>
      node.props.some(
        (prop) => prop.type === 6 && prop.name === 'class' && prop.value?.content === value,
      )
    const cluster = elements.find((node) => hasClass(node, 'warp-metadata-cluster'))!
    const rows = cluster.children.filter((child) => child.type === 1)
    expect(rows).toHaveLength(2)
    const icons = rows[0]!.children.filter((child) => child.type === 1)
    expect(icons.map((node) => node.tag)).toEqual(['WarpVisualIcon'])
    expect(hasClass(icons[0]!, 'warp-card-path-icon')).toBe(true)
    expect(rows[1]!.tag).toBe('WarpVisualIcon')
    expect(rows[1]!.props.some((prop) => prop.type === 6 && prop.name === 'stars')).toBe(true)
    const character = elements.find((node) => hasClass(node, 'warp-character-metadata'))!
    const overlay = character.children.filter((child) => child.type === 1)
    expect(overlay.map((node) => node.tag)).toEqual(['WarpVisualIcon', 'WarpVisualIcon'])
    expect(hasClass(overlay[0]!, 'warp-card-element-icon')).toBe(true)
    expect(overlay[1]!.props.some((prop) => prop.type === 6 && prop.name === 'stars')).toBe(true)
  })
  it.each([3, 4, 5])(
    'keeps every alpha pixel of %i repeated stars, including faint edges',
    async (rarity) => {
      const source = await starFixture(rarity, 4)
      const { crop } = await inspectStarCrop(source, rarity)
      expect(crop).toEqual({ left: 4, top: 4, width: rarity * 128, height: 128 })
      const { data, info } = await sharp(source).raw().toBuffer({ resolveWithObject: true })
      let faint = 0
      for (let y = 0; y < info.height; y++)
        for (let x = 0; x < info.width; x++) {
          const alpha = data[(y * info.width + x) * 4 + 3]
          if (alpha === 1) faint++
          if (
            x < crop.left ||
            y < crop.top ||
            x >= crop.left + crop.width ||
            y >= crop.top + crop.height
          )
            expect(alpha).toBe(0)
        }
      expect(faint).toBeGreaterThan(0)
      expect(cardStarDimensions(crop, lock.transform.cardStars)).toEqual({
        width: rarity * 64 + 4,
        height: 68,
      })
    },
  )
  it('preserves an identical star cell and source scale across all rarities', async () => {
    const crops = await Promise.all(
      [3, 4, 5].map(async (n) => inspectStarCrop(await starFixture(n), n)),
    )
    expect(new Set(crops.map((value) => value.starHash)).size).toBe(1)
    expect(new Set(crops.map((value) => value.crop.height)).size).toBe(1)
    expect(
      cardStarDimensions({ left: 0, top: 0, width: 60, height: 20 }, lock.transform.cardStars),
    ).toEqual({ width: 64, height: 24 })
  })
  it('rejects empty, non-alpha and inconsistent star content', async () => {
    const empty = await sharp({
      create: { width: 640, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer()
    await expect(inspectStarCrop(empty, 3)).rejects.toThrow(/empty/)
    const opaque = await sharp(empty).removeAlpha().png().toBuffer()
    await expect(inspectStarCrop(opaque, 3)).rejects.toThrow(/alpha/)
    await expect(inspectStarCrop(await starFixture(3), 4)).rejects.toThrow(/proportions/)
    const { data, info } = await sharp(await starFixture(3))
      .raw()
      .toBuffer({ resolveWithObject: true })
    data[(64 * info.width + 64) * 4] = 0
    await expect(
      inspectStarCrop(await sharp(data, { raw: info }).png().toBuffer(), 3),
    ).rejects.toThrow(/cells/)
  })
  it('includes all crop and padding parameters in the conversion identity', () => {
    const crop = { left: 0, top: 0, width: 384, height: 128 }
    const key = cardStarKey('source', crop, lock.transform.cardStars, 100)
    expect(cardStarKey('source', { ...crop, left: 1 }, lock.transform.cardStars, 100)).not.toBe(key)
    expect(cardStarKey('source', crop, { ...lock.transform.cardStars, padding: 3 }, 100)).not.toBe(
      key,
    )
    expect(cardStarKey('source', crop, lock.transform.cardStars, 90)).not.toBe(key)
  })
  it('maps separate centered images with a common five-star width constraint', () => {
    const adapter = createPresentation(warpSnapshot, warpVisuals, '/sub/', warpVisualDefinitions)
    const reference = 324 / 68
    for (const source of warpSnapshot.items) {
      const item = adapter.item(source.id, 'en')
      expect(item.cardStars).toMatchObject({ width: source.rarity * 64 + 4, height: 68 })
      expect(item.cardStars?.url).toBe(
        '/sub/' + warpVisualDefinitions.cardStars![source.rarity]!.path,
      )
      expect(item.cardStarsReferenceAspectRatio).toBe(reference)
      expect(item.starsUrl).toBe('/sub/' + warpVisualDefinitions.stars[source.rarity])
    }
    const missing = createPresentation(warpSnapshot, warpVisuals, '/sub/', {
      ...warpVisualDefinitions,
      cardStars: undefined,
    }).item(warpSnapshot.items[0]!.id, 'en')
    expect(missing.cardStars).toBeUndefined()
    expect(missing.cardStarsReferenceAspectRatio).toBe(5)
    expect(missing.starsUrl).toBeTruthy()
    const invalid = structuredClone(catalog)
    Object.assign(invalid, {
      cardStars: { 3: { path: 'game-assets/../bad.webp', width: 196, height: 68 } },
    })
    expect(() => assertVisualCatalog(invalid, warpSnapshot)).toThrow(/image/)
  })
})
