import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { renderer, node, descendants } from '../../fixtures/warp-simulator/node-renderer'
import WarpResultCard from '../../../src/tools/warp-simulator/components/WarpResultCard.vue'
import {
  createPresentation,
  type ItemPresentation,
} from '../../../src/tools/warp-simulator/model/presentation'
import {
  resultPortraitFocus,
  portraitGeometry,
} from '../../../src/tools/warp-simulator/model/portrait-focus'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import { resultDisplayScenarios } from '../../fixtures/warp-simulator/result-display'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

vi.mock('primevue/button', () => ({
  default: defineComponent({
    setup(_, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.())
    },
  }),
}))
vi.mock('../../../src/tools/warp-simulator/composables/useWarpElementSize', () => ({
  useWarpElementSize: () => ref({ width: 360, height: 180 }),
}))
const apps: App[] = []
afterEach(() => apps.splice(0).forEach((app) => app.unmount()))

describe('Full-canvas avatar cards', () => {
  it.each([4, 5] as const)(
    'overlays element and %i stars, keeps head geometry and image identity across locale updates',
    async (rarity) => {
      const adapter = createPresentation(warpSnapshot, warpVisuals, '/', warpVisualDefinitions)
      const entry = resultDisplayScenarios().find((s) => s.id === `single-avatar-${rarity}`)!
        .entries[0]!
      const item = ref<ItemPresentation>(adapter.item(entry.event.itemId, 'zh-CN'))
      const root = node('root'),
        details = vi.fn()
      const app = renderer.createApp({
        render: () =>
          h(WarpResultCard, {
            entry,
            item: item.value,
            index: 0,
            onDetails: details,
          }),
      })
      app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } }))
      app.directive('tooltip', {})
      app.mount(root)
      apps.push(app)
      const cls = (name: string) =>
        descendants(root).filter((n) => String(n.props.class).split(' ').includes(name))
      expect(cls('warp-character-card')).toHaveLength(1)
      expect(cls('warp-card-metadata')).toHaveLength(0)
      expect(cls('warp-card-path-icon')).toHaveLength(0)
      expect(cls('warp-character-metadata')).toHaveLength(1)
      expect(cls('warp-card-element-icon')).toHaveLength(1)
      const img = descendants(root).find(
        (n) => n.type === 'img' && n.props.src === item.value.resultPortrait!.url,
      )!
      expect(img).toBeDefined()
      const geometry = portraitGeometry(360, 180, 2048, 2048, resultPortraitFocus(item.value.id))!
      expect(img.props.style).toMatchObject(
        Object.fromEntries(Object.entries(geometry).map(([key, value]) => [key, `${value}px`])),
      )
      expect(
        descendants(root).some((n) => n.type === 'img' && n.props.src === item.value.pathIconUrl),
      ).toBe(false)
      expect(
        descendants(root).some(
          (n) => n.type === 'img' && n.props.src === item.value.cardStars!.url,
        ),
      ).toBe(true)
      item.value = adapter.item(entry.event.itemId, 'en')
      await nextTick()
      expect(
        descendants(root).find(
          (n) => n.type === 'img' && n.props.src === item.value.resultPortrait!.url,
        ),
      ).toBe(img)
      ;(cls('warp-character-card')[0]!.props.onClick as () => void)()
      expect(details).toHaveBeenCalledWith(entry)
    },
  )
})
