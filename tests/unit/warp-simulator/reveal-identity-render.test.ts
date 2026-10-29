import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { h, nextTick, ref, type App } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  renderer,
  node,
  descendants,
  type HostNode,
} from '../../fixtures/warp-simulator/node-renderer'
import WarpRevealIdentity from '../../../src/tools/warp-simulator/components/WarpRevealIdentity.vue'
import {
  createPresentation,
  PATH_CODES,
  type ItemPresentation,
} from '../../../src/tools/warp-simulator/model/presentation'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'

const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})
function byClass(root: HostNode, name: string) {
  return descendants(root).filter((element) =>
    String(element.props.class ?? '')
      .split(/\s+/)
      .includes(name),
  )
}
function style(element: HostNode) {
  return element.props.style as Record<string, string>
}
const presentation = createPresentation(warpSnapshot, warpVisuals, '/', warpVisualDefinitions)
function pathItem(path: string) {
  const source = warpSnapshot.items.find(
    (item) => item.rarity === 5 && warpVisuals[item.id]?.path === path,
  )!
  return presentation.item(source.id, 'en')
}
function mount(item: ItemPresentation, onReady = vi.fn()) {
  const current = ref(item)
  const started = ref(false)
  const root = node('root')
  const app = renderer.createApp({
    render: () =>
      h(WarpRevealIdentity, {
        item: current.value,
        batchId: 7,
        entryId: 21,
        started: started.value,
        pathLabel: current.value.pathName ?? 'Unknown',
        rarityLabel: '5 stars',
        onReady,
      }),
  })
  app.mount(root)
  apps.push(app)
  return { root, current, started }
}
function canvasCap(root: HostNode) {
  return Number.parseFloat(
    style(byClass(root, 'warp-identity-canvas')[0]!)['--identity-canvas-max-width']!,
  )
}
function imageEvent(image: HostNode, name: 'onLoad' | 'onError', size = 512) {
  const callback = image.props[name] as (event: Event) => void
  callback({
    target: {
      getAttribute: (key: string) => image.props[key] ?? null,
      naturalWidth: size,
      naturalHeight: size,
    },
  } as unknown as Event)
}

describe('Mounted Identity display size', () => {
  it.each([1, 2, 3])(
    'caps every path at the same CSS size at DPR %i, regardless of source dimensions',
    (dpr) => {
      vi.stubGlobal('window', { devicePixelRatio: dpr })
      for (const path of PATH_CODES) {
        const item = pathItem(path)
        for (const pixels of [512, 256, undefined]) {
          const { root } = mount({
            ...item,
            revealPathIcon:
              pixels === undefined
                ? undefined
                : {
                    url: item.revealPathIcon!.url,
                    width: pixels,
                    height: pixels,
                  },
          })
          expect(canvasCap(root)).toBeCloseTo(280.70175438596493)
          expect(canvasCap(root) * 0.57).toBeCloseTo(160)
          const pathImages = descendants(byClass(root, 'warp-identity-path')[0]!).filter(
            (child) => child.type === 'img',
          )
          expect(pathImages[0]!.props.src).toBe(
            pixels === undefined ? item.pathIconUrl : item.revealPathIcon!.url,
          )
          for (const image of descendants(root).filter((child) => child.type === 'img')) {
            expect(style(image).maxWidth).toBeUndefined()
            expect(style(image).maxHeight).toBeUndefined()
          }
        }
      }
    },
  )

  it.each([
    [390, 844, 280.70175438596493, 160],
    [1024, 768, 280.70175438596493, 160],
    [1440, 900, 280.70175438596493, 160],
    [248, 844, 200, 114],
    [844, 188, 135.85858585858585, 77.43939393939394],
  ])(
    'fits %ix%i without changing the V3 relative geometry',
    (width, height, expectedCanvas, expectedPath) => {
      const { root } = mount(pathItem('Warrior'))
      // Resolve the declared CSS min() against the existing Overlay's 24px side /
      // top and 64px bottom insets. Browser paint remains a manual acceptance.
      const canvas = Math.min(width - 48, ((height - 88) * 807) / 594, canvasCap(root))
      expect(canvas).toBeCloseTo(expectedCanvas)
      expect(canvas * 0.57).toBeCloseTo(expectedPath)
      const stars = byClass(root, 'warp-identity-star')
      expect(stars).toHaveLength(5)
      expect(stars.map((star) => Number.parseFloat(style(star).left!))).toEqual([
        17.5, 30.1, 50, 69.9, 82.5,
      ])
      expect(stars.map((star) => Number.parseFloat(style(star).width!))).toEqual([
        14.5, 14.5, 34, 14.5, 14.5,
      ])
      expect(
        (canvas * Number.parseFloat(style(stars[0]!).width!)) / 100 / (canvas * 0.57),
      ).toBeCloseTo(14.5 / 57)
      expect(
        (canvas * Number.parseFloat(style(stars[2]!).width!)) / 100 / (canvas * 0.57),
      ).toBeCloseTo(34 / 57)
      if (expectedPath === 160) {
        expect(canvas * 0.145).toBeCloseTo(40.70175438596491)
        expect(canvas * 0.34).toBeCloseTo(95.43859649122808)
      }
    },
  )

  it('retains the cap through actual image failures, readiness and equivalent metadata updates', async () => {
    const ready = vi.fn()
    const { root, current, started } = mount(pathItem('Warrior'), ready)
    const cap = canvasCap(root)
    const path = byClass(root, 'warp-identity-path')[0]!
    imageEvent(
      descendants(path).find((child) => child.type === 'img')!,
      'onError',
    )
    await nextTick()
    expect(descendants(path).find((child) => child.type === 'img')!.props.src).toBe(
      current.value.pathIconUrl,
    )
    imageEvent(
      descendants(path).find((child) => child.type === 'img')!,
      'onError',
    )
    for (const image of descendants(root)
      .filter((child) => child.type === 'img')
      .slice(1, 5))
      imageEvent(image, 'onLoad', 279)
    await nextTick()
    expect(ready).not.toHaveBeenCalled()
    expect(canvasCap(root)).toBe(cap)
    expect(byClass(root, 'warp-identity-started')).toHaveLength(0)
    const last = descendants(root)
      .filter((child) => child.type === 'img')
      .at(-1)!
    imageEvent(last, 'onError')
    await nextTick()
    expect(ready).toHaveBeenCalledExactlyOnceWith(7, 21)
    started.value = true
    current.value = { ...current.value, name: 'Updated locale' }
    await nextTick()
    expect(byClass(root, 'warp-identity-started')).toHaveLength(1)
    expect(canvasCap(root)).toBe(cap)
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('keeps the rendered cap connected to the container sizing rule and the 57% path', () => {
    const source = readFileSync(
      resolve('src/tools/warp-simulator/components/WarpRevealIdentity.vue'),
      'utf8',
    )
    expect(source).toContain(
      'width: min(100cqw, calc(100cqh * 807 / 594), var(--identity-canvas-max-width))',
    )
    expect(source).toMatch(/\.warp-identity-canvas \.warp-identity-path\s*\{\s*width: 57%/)
    expect(source).toMatch(/\.warp-identity-canvas \.warp-identity-path\s*\{[^}]*top: 52%/)
    expect(source).toMatch(/\.warp-identity-star\s*\{[^}]*top: 52%/)
    expect(source).toContain('aspect-ratio: 807 / 594')
    expect(source).not.toContain('item.revealPathIcon?.width')
  })
})
