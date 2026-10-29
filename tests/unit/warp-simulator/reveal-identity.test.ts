import { readFileSync } from 'node:fs'
import { effectScope, ref, watch } from 'vue'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  IDENTITY_EMBLEM,
  IDENTITY_STARS,
  useWarpIdentityReady,
} from '../../../src/tools/warp-simulator/composables/useWarpIdentityReady'
import {
  useWarpReveal,
  REVEAL_TIMING,
} from '../../../src/tools/warp-simulator/composables/useWarpReveal'
import { useWarpRevealSource } from '../../../src/tools/warp-simulator/composables/useWarpRevealSource'
import {
  createPresentation,
  PATH_CODES,
} from '../../../src/tools/warp-simulator/model/presentation'
import { assertVisualCatalog } from '../../../src/tools/warp-simulator/model/visual-catalog'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import catalog from '../../../src/tools/warp-simulator/data/visuals/catalog.json'
import { resultDisplayScenarios } from '../../fixtures/warp-simulator/result-display'

const scopes: ReturnType<typeof effectScope>[] = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

describe('V3 five-star Identity', () => {
  it('waits for all six actual images, including fallbacks, then starts a full 1100ms', () => {
    const scope = effectScope()
    scopes.push(scope)
    const batch = resultDisplayScenarios().find(
      (scenario) => scenario.id === 'single-avatar-5',
    )!.entries
    const entry = batch[0]!
    const { reveal, images, announce } = scope.run(() => {
      const reveal = useWarpReveal(ref(false))
      reveal.beginBatch(entry.batchId, batch)
      const announce = vi.fn((batch: number, id: number) => reveal.markIdentityReady(batch, id))
      const partReady = useWarpIdentityReady(() => [entry.batchId, entry.id], announce)
      const images = ['path', ...IDENTITY_STARS.map((star) => star.id)].map((part) => {
        const image = useWarpRevealSource(
          () => ({
            url: part === 'path' ? '/path-hd.webp' : '/star-big.webp',
            width: 279,
            height: 279,
          }),
          () => (part === 'path' ? '/path-light.webp' : undefined),
        )
        watch(
          image.ready,
          (ready) => {
            if (ready) partReady(part as 'path' | number, entry.batchId, entry.id)
          },
          { immediate: true, flush: 'sync' },
        )
        return image
      })
      return { reveal, images, announce }
    })!
    images[0]!.fail('/path-hd.webp')
    expect(images[0]!.source.value).toBe('/path-light.webp')
    images[0]!.load('/path-hd.webp', 512, 512) // stale preferred callback
    images[0]!.load('/path-light.webp', 64, 64)
    for (const index of [1, 2, 4]) images[index]!.load('/star-big.webp', 279, 279)
    images[5]!.fail('/star-big.webp') // neutral placeholder also becomes ready
    vi.advanceTimersByTime(60_000)
    expect(announce).not.toHaveBeenCalled()
    expect(reveal.identityReady.value).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
    images[3]!.load('/star-big.webp', 279, 279) // last, central star
    expect(announce).toHaveBeenCalledExactlyOnceWith(entry.batchId, entry.id)
    expect(reveal.identityReady.value).toBe(true)
    vi.advanceTimersByTime(1099)
    expect(reveal.phase.value).toBe('identity')
    vi.advanceTimersByTime(1)
    expect(reveal.phase.value).toBe('artwork')
    expect(vi.getTimerCount()).toBe(0) // artwork is still loading
  })

  it('ignores duplicate, invalid, stale and disposed readiness without reusing parts across entries', () => {
    const scope = effectScope()
    scopes.push(scope)
    const identity = ref<readonly [number, number]>([4, 10])
    const announce = vi.fn()
    const mark = scope.run(() => useWarpIdentityReady(() => identity.value, announce))!
    for (const part of ['path', 1, 2, 4, 5] as const) mark(part, 4, 10)
    mark(1, 4, 10)
    mark(0, 4, 10)
    mark(6, 4, 10)
    mark(3, 3, 10)
    mark(3, 4, 9)
    expect(announce).not.toHaveBeenCalled()
    identity.value = [4, 11]
    mark(3, 4, 10)
    mark(3, 4, 11)
    expect(announce).not.toHaveBeenCalled()
    for (const part of ['path', 1, 2, 4, 5] as const) mark(part, 4, 11)
    expect(announce).toHaveBeenCalledExactlyOnceWith(4, 11)
    mark(3, 4, 11)
    identity.value = [5, 1]
    scope.stop()
    for (const part of ['path', 1, 2, 3, 4, 5] as const) mark(part, 5, 1)
    expect(announce).toHaveBeenCalledTimes(1)
  })

  it('finishes the V3 centre flash before the existing Identity deadline and keeps symmetric geometry', () => {
    expect(IDENTITY_EMBLEM).toEqual({ delay: 25, duration: 287.5 })
    expect(IDENTITY_STARS.map((star) => star.left)).toEqual([17.5, 30.1, 50, 69.9, 82.5])
    expect(IDENTITY_STARS.map((star) => star.width)).toEqual([14.5, 14.5, 34, 14.5, 14.5])
    expect(IDENTITY_STARS.map((star) => star.delay)).toEqual([260, 375, 505, 375, 260])
    const end = Math.max(...IDENTITY_STARS.map((star) => star.delay + star.duration))
    expect(end).toBe(742.5)
    expect(REVEAL_TIMING.identity - end).toBe(357.5)
  })

  it('resolves every path from actual item metadata, including bilingual names and base URLs', () => {
    const presentation = createPresentation(
      warpSnapshot,
      warpVisuals,
      '/sub/',
      warpVisualDefinitions,
    )
    expect(Object.keys(warpVisualDefinitions.paths).sort()).toEqual([...PATH_CODES].sort())
    for (const source of warpSnapshot.items) {
      const path = warpVisuals[source.id]!.path!
      for (const locale of ['zh-CN', 'en'] as const) {
        const item = presentation.item(source.id, locale)
        const definition = warpVisualDefinitions.paths[path]!
        expect(item.revealPathIcon).toEqual({
          url: '/sub/' + definition.revealIcon!.path,
          width: definition.revealIcon!.width,
          height: definition.revealIcon!.height,
        })
        expect(item.pathName).toBe(definition.names[locale])
        expect(item.pathIconUrl).toBe('/sub/' + definition.iconPath)
        expect(item.revealStarBig).toEqual(
          source.rarity === 5
            ? {
                url: '/sub/' + catalog.revealStarBig.path,
                width: 279,
                height: 279,
              }
            : undefined,
        )
      }
    }
    const legacy = { ...warpVisualDefinitions, revealStarBig: undefined }
    expect(
      createPresentation(warpSnapshot, warpVisuals, '/', legacy).item('avatar:1503', 'en')
        .revealStarBig,
    ).toBeUndefined()
    for (const image of [
      { path: 'game-assets/../bad.webp', width: 279, height: 279 },
      { path: 'game-assets/good.webp', width: 0, height: 279 },
    ]) {
      expect(() => assertVisualCatalog({ ...catalog, revealStarBig: image }, warpSnapshot)).toThrow(
        /identity star/,
      )
      expect(
        createPresentation(warpSnapshot, warpVisuals, '/', {
          ...legacy,
          revealStarBig: image,
        }).item('avatar:1503', 'en').revealStarBig,
      ).toBeUndefined()
    }
    expect(() =>
      assertVisualCatalog({ ...catalog, revealStarBig: undefined }, warpSnapshot),
    ).not.toThrow()
  })

  it('binds all resources through the adapter and confines the fixed-ratio animation to Identity', () => {
    const read = (name: string) =>
      readFileSync(
        new URL('../../../src/tools/warp-simulator/components/' + name + '.vue', import.meta.url),
        'utf8',
      )
    const text = read('WarpRevealIdentity')
    const { descriptor } = parse(text)
    expect(
      compileTemplate({
        source: descriptor.template!.content,
        filename: 'WarpRevealIdentity.vue',
        id: 'v3-test',
      }).errors,
    ).toEqual([])
    const root = descriptor.template!.ast!
    type Element = Extract<(typeof root.children)[number], { type: 1 }>
    const images: Element[] = []
    const walk = (node: typeof root | Element) => {
      if (node.type === 1 && node.tag === 'WarpRevealImage') images.push(node)
      for (const child of node.children) if (child.type === 1) walk(child)
    }
    walk(root)
    const binding = (node: Element, name: string) =>
      node.props.find(
        (prop) =>
          prop.type === 7 &&
          prop.name === 'bind' &&
          prop.arg?.type === 4 &&
          prop.arg.content === name,
      )
    expect(images).toHaveLength(2) // path + the five-star loop
    expect(binding(images[0]!, 'preferred')).toMatchObject({
      exp: { content: 'item.revealPathIcon' },
    })
    expect(binding(images[0]!, 'fallback-url')).toMatchObject({
      exp: { content: 'item.pathIconUrl' },
    })
    expect(binding(images[1]!, 'preferred')).toMatchObject({
      exp: { content: 'item.revealStarBig' },
    })
    expect(binding(images[1]!, 'fallback-url')).toBeUndefined()
    expect(images[1]!.props).toContainEqual(
      expect.objectContaining({
        name: 'for',
        exp: expect.objectContaining({ content: 'star in IDENTITY_STARS' }),
      }),
    )
    for (const image of images)
      expect(binding(image, 'limit-to-source-pixels')).toMatchObject({ exp: { content: 'false' } })
    expect(text).toContain('aspect-ratio: 807 / 594')
    expect(text).toContain('container-type: size')
    expect(text).toContain(
      'min(100cqw, calc(100cqh * 807 / 594), var(--identity-canvas-max-width))',
    )
    expect(text).not.toContain('identity-path-native-size')
    expect(text).not.toMatch(/\d(?:vw|vh)|Joy\.png|setTimeout|requestAnimationFrame|Math\.random/)
    const overlay = read('WarpRevealOverlay')
    expect(overlay).toContain(':started="identityReady"') // retains the started pose during leaving
    expect(overlay).toContain('v-if="stage === \'identity\'"')
    expect(overlay).not.toContain('reveal-exit-delay')
    const image = read('WarpRevealImage')
    expect(image).toContain('limitToSourcePixels: true')
    expect(image).toContain('props.limitToSourcePixels && dimensions.value')
  })
})
