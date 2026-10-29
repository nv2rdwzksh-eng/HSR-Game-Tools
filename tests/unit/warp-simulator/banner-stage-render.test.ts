import { defineComponent, h, nextTick, ref, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WarpBannerStage from '../../../src/tools/warp-simulator/components/WarpBannerStage.vue'
import type { WarpBanner } from '../../../src/tools/warp-simulator/data/schema'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import { fixture } from '../../fixtures/warp-simulator/fixture'
import { renderer, node, descendants } from '../../fixtures/warp-simulator/node-renderer'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

vi.mock('astral-ui/components', () => ({
  HButton: defineComponent({
    setup:
      (_, { attrs, slots }) =>
      () =>
        h('button', attrs, slots.default?.()),
  }),
}))
const apps: App[] = []
afterEach(() => apps.splice(0).forEach((app) => app.unmount()))
const snapshot = fixture()
const adapter = createPresentation(
  snapshot,
  {
    'avatar:9': {
      path: 'Memory',
      element: 'Ice',
      resultPortrait: { path: 'game-assets/hero.webp', width: 2048, height: 2048 },
      revealArtwork: { path: 'game-assets/hero-fallback.webp', width: 2048, height: 2048 },
    },
    'light-cone:8': {
      path: 'Memory',
      artworkPath: 'game-assets/cone-small.webp',
      revealArtwork: { path: 'game-assets/cone.webp', width: 902, height: 1260 },
      lightConePreview: { path: 'game-assets/unused-preview.webp', width: 348, height: 408 },
    },
  },
  '/hsr/',
  {
    paths: {
      Memory: { names: { 'zh-CN': '记忆', en: 'Remembrance' }, iconPath: 'game-assets/path.webp' },
    },
    elements: {
      Ice: {
        names: { 'zh-CN': '冰', en: 'Ice' },
        color: '#aabbff',
        iconPath: 'game-assets/ice.webp',
      },
    },
    stars: {},
  },
)

describe('Banner stage uses current UP metadata and independent full artwork', () => {
  it('updates characters, cone-only metadata, locale and generic states without a result grid', async () => {
    const banner = ref<WarpBanner | undefined>(snapshot.banners[0])
    const results = ref(false),
      review = vi.fn(),
      root = node('root')
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } })
    const app = renderer.createApp({
      render: () =>
        h(WarpBannerStage, {
          banner: banner.value,
          item: banner.value?.up5
            ? adapter.item(banner.value.up5, i18n.global.locale.value)
            : undefined,
          hasResults: results.value,
          disabled: false,
          onReview: review,
        }),
    })
    app.use(i18n)
    apps.push(app)
    app.mount(root)
    const image = () => descendants(root).find((n) => n.props.class === 'warp-banner-image')
    const title = () => descendants(root).find((n) => n.props.id === 'warp-banner-name')!.text
    const reviewButton = () => descendants(root).find((n) => n.props.id === 'warp-review-trigger')
    expect(image()!.props.src).toBe('/hsr/game-assets/hero.webp')
    const elementText = descendants(root).find((n) => n.type === 'span' && n.text === '冰')!
    expect(elementText.props.style).toMatchObject({ color: '#6dc4ea' })
    expect(reviewButton()).toBeUndefined()
    banner.value = snapshot.banners[1]
    results.value = true
    await nextTick()
    expect(image()!.props.src).toBe('/hsr/game-assets/cone.webp')
    expect(descendants(root).some((n) => n.type === 'span' && n.text === '冰')).toBe(false)
    expect(descendants(root).some((n) => n.type === 'span' && n.text === '记忆')).toBe(true)
    ;(reviewButton()!.props.onClick as () => void)()
    expect(review).toHaveBeenCalledOnce()
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(title()).toBe('Synthetic same name')
    expect(descendants(root).some((n) => n.text === 'Remembrance')).toBe(true)
    banner.value = snapshot.banners.find((b) => b.kind === 'ordinary')
    await nextTick()
    expect(image()).toBeUndefined()
    expect(title()).toBe(en.warp.kind.ordinary)
    banner.value = undefined
    await nextTick()
    expect(title()).toBe(en.warp.noBanners)
    expect(reviewButton()).toBeDefined()
  })

  it('falls through full-art sources, ignores stale errors and recovers when the banner changes', async () => {
    const banner = ref(snapshot.banners[0]!),
      root = node('root')
    const app = renderer.createApp({
      render: () =>
        h(WarpBannerStage, {
          banner: banner.value,
          item: adapter.item(banner.value.up5!, 'zh-CN'),
          hasResults: false,
          disabled: false,
        }),
    })
    app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } }))
    apps.push(app)
    app.mount(root)
    const image = () => descendants(root).find((n) => n.props.class === 'warp-banner-image')
    const error = (src: string) =>
      (image()!.props.onError as (event: unknown) => void)({ target: { getAttribute: () => src } })
    error('/hsr/game-assets/hero.webp')
    await nextTick()
    expect(image()!.props.src).toBe('/hsr/game-assets/hero-fallback.webp')
    error('/hsr/game-assets/hero.webp')
    await nextTick()
    expect(image()!.props.src).toBe('/hsr/game-assets/hero-fallback.webp')
    error('/hsr/game-assets/hero-fallback.webp')
    await nextTick()
    expect(image()).toBeUndefined()
    banner.value = snapshot.banners[1]!
    await nextTick()
    expect(image()!.props.src).toBe('/hsr/game-assets/cone.webp')
    error('/hsr/game-assets/cone.webp')
    await nextTick()
    expect(image()!.props.src).toBe('/hsr/game-assets/cone-small.webp')
    error('/hsr/game-assets/cone-small.webp')
    await nextTick()
    expect(image()).toBeUndefined()
    banner.value = snapshot.banners[0]!
    await nextTick()
    expect(image()!.props.src).toBe('/hsr/game-assets/hero.webp')
  })
})
