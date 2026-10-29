import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import {
  renderer,
  node,
  descendants,
  type HostNode,
} from '../../fixtures/warp-simulator/node-renderer'
import WarpRevealImage from '../../../src/tools/warp-simulator/components/WarpRevealImage.vue'
import WarpRevealMetadata from '../../../src/tools/warp-simulator/components/WarpRevealMetadata.vue'
import { revealComposition } from '../../../src/tools/warp-simulator/model/reveal-composition'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import zhCN from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})

function find(root: HostNode, name: string) {
  return descendants(root).filter((el) =>
    String(el.props.class ?? '')
      .split(' ')
      .includes(name),
  )
}

describe('Mounted single-reveal artwork', () => {
  it('keeps native clarity after a preview fails and recomputes from the loaded fallback', async () => {
    const resize = { callback: () => {} }
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resize.callback = callback
        }
        observe() {}
        disconnect() {}
      },
    )
    const ready = vi.fn()
    const root = node('root')
    const app = renderer.createApp({
      render: () =>
        h(WarpRevealImage, {
          preferred: { url: '/preview.webp', width: 348, height: 408 },
          fallbackUrl: '/fallback.webp',
          label: 'Cone',
          pixelRatio: 2,
          composition: revealComposition('light-cone:23003', 'light-cone'),
          kind: 'light-cone',
          batchId: 7,
          entryId: 11,
          onReady: ready,
        }),
    })
    app.mount(root)
    apps.push(app)
    const frame = find(root, 'warp-reveal-image')[0]!
    Object.assign(frame, { clientWidth: 1920, clientHeight: 1080 })
    resize.callback()
    await nextTick()
    let image = descendants(root).find((el) => el.type === 'img')!
    expect(image.props.style).toMatchObject({ width: '174px', height: '204px' })
    ;(image.props.onError as (event: Event) => void)({
      target: { getAttribute: () => '/preview.webp' },
    } as unknown as Event)
    await nextTick()
    image = descendants(root).find((el) => el.type === 'img')!
    expect(image.props.src).toBe('/fallback.webp')
    expect(ready).not.toHaveBeenCalled()
    ;(image.props.onLoad as (event: Event) => void)({
      target: { getAttribute: () => '/fallback.webp', naturalWidth: 300, naturalHeight: 600 },
    } as unknown as Event)
    await nextTick()
    expect(image.props.style).toMatchObject({ width: '150px', height: '300px' })
    expect(ready).toHaveBeenCalledExactlyOnceWith(7, 11)
  })

  it.each(['zh-CN', 'en'] as const)(
    'renders a shared band with only the applicable visible rows in %s',
    (locale) => {
      const adapter = createPresentation(warpSnapshot, warpVisuals, '/', warpVisualDefinitions)
      for (const id of ['avatar:1415', 'light-cone:23003']) {
        const item = adapter.item(id, locale)
        const root = node('root')
        const app = renderer.createApp({
          render: () => h(WarpRevealMetadata, { item, rarity: 5, descriptionId: 'description' }),
        })
        app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, en } }))
        app.mount(root)
        apps.push(app)
        expect(find(root, 'warp-reveal-metadata-band')).toHaveLength(1)
        expect(find(root, 'warp-reveal-metadata-primary')).toHaveLength(1)
        expect(find(root, 'warp-reveal-metadata-path')).toHaveLength(item.kind === 'avatar' ? 1 : 0)
        expect(find(root, 'warp-reveal-metadata-name')[0]!.text).toBe(item.name)
        const description = descendants(root).find((el) => el.props.id === 'description')!
        expect(description.text).toContain(item.pathName)
        if (item.kind === 'avatar') expect(description.text).toContain(item.elementName)
        expect(find(root, 'warp-reveal-metadata-band')[0]!.props['aria-hidden']).toBe('true')
      }
    },
  )
})
