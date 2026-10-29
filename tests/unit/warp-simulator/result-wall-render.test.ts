import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { renderer, node, descendants } from '../../fixtures/warp-simulator/node-renderer'
import WarpResultsWall from '../../../src/tools/warp-simulator/components/WarpResultsWall.vue'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import { warpVisualDefinitions } from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import {
  resultDisplayScenarios,
  resultDisplaySnapshot,
  resultDisplayVisuals,
} from '../../fixtures/warp-simulator/result-display'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

// The real card is covered separately; here we verify grouping and event identity in the actual wall.
vi.mock('../../../src/tools/warp-simulator/components/WarpResultCard.vue', () => ({
  default: defineComponent({
    props: ['entry', 'item', 'index', 'idPrefix'],
    emits: ['details'],
    setup(props, { emit }) {
      return () =>
        h('button', {
          id: `${props.idPrefix}-${props.entry.id}`,
          'data-index': props.index,
          'aria-label': props.item.name,
          onClick: () => emit('details', props.entry),
        })
    },
  }),
}))
const apps: App[] = []
afterEach(() => apps.splice(0).forEach((app) => app.unmount()))
const adapter = createPresentation(
  resultDisplaySnapshot,
  resultDisplayVisuals,
  '/',
  warpVisualDefinitions,
)

describe('Real result wall row grouping', () => {
  it.each(['tilted'] as const)(
    'preserves ordered records and details identities in the %s wall across language changes',
    async () => {
      const entries = ref(
        resultDisplayScenarios().find((s) => s.id === 'overview-reference')!.entries,
      )
      const details = vi.fn(),
        root = node('root')
      const app = renderer.createApp({
        render: () =>
          h(WarpResultsWall, {
            entries: entries.value,
            presentation: adapter,
            onDetails: details,
          }),
      })
      const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } })
      app.use(i18n)
      app.mount(root)
      apps.push(app)
      const rows = descendants(root).filter((n) => n.props.class === 'warp-wall-row')
      expect(rows.map((row) => descendants(row).filter((n) => n.type === 'button').length)).toEqual(
        [3, 4, 3],
      )
      const buttons = () => descendants(root).filter((n) => n.type === 'button')
      const prefix = 'warp-overview-result'
      const canvas = descendants(root).find((n) => n.props.class === 'warp-wall-canvas')!
      expect(canvas.props.style).toHaveProperty('--wall-angle', '-12deg')
      expect(buttons().map((n) => n.props.id)).toEqual(
        entries.value.map((e) => `${prefix}-${e.id}`),
      )
      expect(buttons().map((n) => n.props['data-index'])).toEqual(
        Array.from({ length: 10 }, (_, i) => i),
      )
      for (let i = 0; i < 10; i++) (buttons()[i]!.props.onClick as () => void)()
      expect(details.mock.calls.map(([entry]) => entry)).toEqual(entries.value)
      i18n.global.locale.value = 'en'
      await nextTick()
      expect(buttons().map((n) => n.props['aria-label'])).toEqual(
        entries.value.map((e) => adapter.item(e.event.itemId, 'en').name),
      )
      entries.value = resultDisplayScenarios().find((s) => s.id === 'all-three')!.entries
      await nextTick()
      expect(buttons().map((n) => n.props.id)).toEqual(
        entries.value.map((e) => `${prefix}-${e.id}`),
      )
    },
  )
})
