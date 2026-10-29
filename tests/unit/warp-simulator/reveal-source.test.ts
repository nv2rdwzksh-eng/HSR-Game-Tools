import { effectScope, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import {
  useWarpRevealSource,
  revealPixelLimit,
} from '../../../src/tools/warp-simulator/composables/useWarpRevealSource'
import type { ImagePresentation } from '../../../src/tools/warp-simulator/model/presentation'

describe('Reveal image readiness and pixel limits', () => {
  it('falls back native → reveal → thumbnail → neutral, deduplicates URLs and preserves readiness', () => {
    const scope = effectScope()
    const preferred = ref<ImagePresentation>({ url: '/native.webp', width: 4096, height: 4096 })
    const image = scope.run(() =>
      useWarpRevealSource(
        () => preferred.value,
        () => '/thumb.webp',
        () => [{ url: '/reveal.webp', width: 2048, height: 2048 }],
      ),
    )!
    expect(image.dimensions.value).toMatchObject({ width: 4096 })
    image.fail('/native.webp')
    expect(image.source.value).toBe('/reveal.webp')
    expect(image.dimensions.value).toMatchObject({ width: 2048 })
    image.fail('/reveal.webp')
    expect(image.source.value).toBe('/thumb.webp')
    image.load('/native.webp', 4096, 4096)
    expect(image.ready.value).toBe(false)
    image.fail('/thumb.webp')
    expect(image.ready.value).toBe(true)
    preferred.value = { url: '/reveal.webp', width: 2048, height: 2048 }
    image.load('/reveal.webp', 2048, 2048)
    preferred.value = { ...preferred.value }
    expect(image.ready.value).toBe(true)
    image.fail('/reveal.webp')
    expect(image.source.value).toBe('/thumb.webp')
    scope.stop()
  })
  it('waits for actual loading and falls back HD → lightweight → neutral', () => {
    const scope = effectScope()
    const image = scope.run(() =>
      useWarpRevealSource(
        () => ({ url: '/hd.webp', width: 902, height: 1260 }),
        () => '/card.webp',
      ),
    )!
    expect(image.source.value).toBe('/hd.webp')
    expect(image.ready.value).toBe(false)
    image.fail('/hd.webp')
    expect(image.source.value).toBe('/card.webp')
    expect(image.dimensions.value).toBeUndefined()
    image.load('/hd.webp', 902, 1260)
    expect(image.ready.value).toBe(false)
    image.load('/card.webp', 458, 640)
    expect(image.ready.value).toBe(true)
    expect(image.dimensions.value).toMatchObject({ width: 458, height: 640 })
    image.fail('/hd.webp')
    expect(image.source.value).toBe('/card.webp')
    image.fail('/card.webp')
    expect(image.source.value).toBeUndefined()
    expect(image.ready.value).toBe(true)
    scope.stop()
  })

  it('retains loading across equivalent metadata and ignores callbacks from replaced sources', () => {
    const scope = effectScope()
    const preferred = ref<ImagePresentation | undefined>({
      url: '/a.webp',
      width: 2048,
      height: 2048,
    })
    const image = scope.run(() =>
      useWarpRevealSource(
        () => preferred.value,
        () => undefined,
      ),
    )!
    image.load('/a.webp', 2048, 2048)
    preferred.value = { ...preferred.value! }
    expect(image.ready.value).toBe(true)
    preferred.value = { url: '/b.webp', width: 902, height: 1260 }
    image.load('/a.webp', 2048, 2048)
    image.fail('/a.webp')
    expect(image.source.value).toBe('/b.webp')
    expect(image.ready.value).toBe(false)
    image.load('/b.webp', 0, 0)
    expect(image.ready.value).toBe(false)
    image.load('/b.webp', 902, 1260)
    expect(image.ready.value).toBe(true)
    preferred.value = undefined
    expect(image.ready.value).toBe(true)
    expect(image.source.value).toBeUndefined()
    scope.stop()
  })

  it.each([1, 2, 3])('caps both axes at native pixels / DPR %i', (dpr) => {
    expect(revealPixelLimit(902, 1260, dpr)).toEqual({
      maxWidth: `${902 / dpr}px`,
      maxHeight: `${1260 / dpr}px`,
    })
    expect(revealPixelLimit(458, 640, dpr).maxHeight).toBe(`${640 / dpr}px`)
  })
  it.each([0, -1, Infinity, NaN])('falls back to DPR 1 for invalid ratio %s', (ratio) => {
    expect(revealPixelLimit(640, 128, ratio)).toEqual({ maxWidth: '640px', maxHeight: '128px' })
  })
})
