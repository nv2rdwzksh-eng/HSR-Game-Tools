import { defineComponent, h, nextTick, ref, watch, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import PrimeVue from 'primevue/config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import WarpSelectionDialog from '../../../src/tools/warp-simulator/components/WarpSelectionDialog.vue'
import WarpHistory from '../../../src/tools/warp-simulator/components/WarpHistory.vue'
import { useWarpSimulator } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import {
  multiBannerFixture,
  selectedAvatarIds,
  seeded,
} from '../../fixtures/warp-simulator/fixture'
// Reuse the existing event-capable Node host; it performs no browser layout or focus trapping.
import {
  renderer,
  node,
  descendants,
  type HostNode,
} from '../../fixtures/currency-wars/node-renderer'

// Business item buttons keep PrimeVue; its DOM Ripple directive is outside this Node host.
vi.mock('primevue/button', () => ({
  default: defineComponent({
    props: ['label', 'unstyled'],
    setup:
      (props, { attrs, slots }) =>
      () =>
        h('button', { type: 'button', ...attrs }, slots.default?.() ?? props.label),
  }),
}))

vi.mock('primevue/dialog', () => ({
  default: defineComponent({
    props: ['visible'],
    emits: ['after-hide', 'update:visible'],
    setup(props, { slots, emit, attrs }) {
      watch(
        () => props.visible,
        async (visible) => {
          if (!visible) {
            await nextTick()
            emit('after-hide')
          }
        },
      )
      return () =>
        props.visible
          ? h('section', { ...attrs, role: 'dialog' }, [
              slots.header?.(),
              slots.default?.(),
              slots.footer?.(),
            ])
          : null
    },
  }),
}))
const apps: App[] = []
beforeEach(() => {
  vi.stubGlobal('document', { activeElement: null, getElementById: () => ({ focus() {} }) })
  vi.stubGlobal('Document', class {})
  vi.stubGlobal('ShadowRoot', class {})
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})
const text = (entry: HostNode): string => entry.text + entry.children.map(text).join(' ')
const byClass = (root: HostNode, name: string) =>
  descendants(root).filter((entry) =>
    String(entry.props.class ?? '')
      .split(/\s+/)
      .includes(name),
  )
const byId = (root: HostNode, id: string) =>
  descendants(root).find((entry) => entry.props.id === id)!
async function flush() {
  for (let i = 0; i < 4; i++) await nextTick()
}
async function click(entry: HostNode) {
  expect(entry.props.disabled).not.toBe(true)
  ;(entry.props.onClick as () => void)()
  await flush()
}
function mount(render: () => ReturnType<typeof h>, locale: 'zh-CN' | 'en') {
  const root = node('root')
  const app = renderer.createApp({ render })
  app.use(
    createI18n({ legacy: false, locale, fallbackLocale: false, messages: { 'zh-CN': zh, en } }),
  )
  app.use(PrimeVue, { unstyled: true })
  app.directive('tooltip', {})
  app.mount(root)
  apps.push(app)
  return root
}
const snapshot = multiBannerFixture()
snapshot.items.find((item) => item.id === 'avatar:8')!.names = {
  'zh-CN': '合成八号',
  en: 'Synthetic Eight',
}
const presentation = createPresentation(snapshot)
function selection(locale: 'zh-CN' | 'en') {
  const simulator = useWarpSimulator({ snapshot, rng: seeded(77), storage: () => undefined })
  simulator.openSelection()
  const afterHide = vi.fn()
  const root = mount(
    () =>
      h(WarpSelectionDialog, {
        visible: simulator.selectionOpen.value,
        draft: simulator.selectionDraft.value,
        eligibleIds: simulator.activeBanner.value?.eligibleAvatarIds ?? [],
        valid: simulator.selectionValid.value,
        presentation,
        'onUpdate:draft': simulator.setSelectionDraft,
        onCancel: simulator.cancelSelection,
        onConfirm: simulator.confirmSelection,
        onAfterHide: afterHide,
      }),
    locale,
  )
  return { simulator, root, afterHide }
}
async function search(root: HostNode, query: string) {
  const input = byId(root, 'warp-character-search')
  Object.assign(input, { value: query })
  ;(input.props.onInput as (event: unknown) => void)({ target: input })
  await flush()
}
async function toggle(root: HostNode, id: string) {
  const input = byId(root, 'warp-choice-' + id)
  expect(input.props.disabled).not.toBe(true)
  ;(input.props.onChange as (event: unknown) => void)({ target: input })
  await flush()
}

describe('Warp Astral selection (restored inputs/Checkbox; Dialog lifecycle stubbed)', () => {
  it.each(['zh-CN', 'en'] as const)(
    'preserves bilingual search, seven-choice draft and cancel/confirm (%s)',
    async (locale) => {
      const { root, simulator, afterHide } = selection(locale)
      const input = byId(root, 'warp-character-search')
      expect(input.type).toBe('input')
      expect(input.props.autofocus).toBeDefined()
      expect(input.props['aria-describedby']).toContain('warp-selection-error')
      for (const query of ['Synthetic Eight', '合成八号', 'avatar:8']) {
        await search(root, query)
        expect(byClass(root, 'warp-character-choice')).toHaveLength(1)
        expect(byId(root, 'warp-choice-avatar:8')).toBeDefined()
      }
      await search(root, 'no-synthetic-match')
      expect(byClass(root, 'warp-character-choice')).toHaveLength(0)
      await search(root, '')
      for (const id of selectedAvatarIds) await toggle(root, id)
      expect(simulator.selectionDraft.value).toEqual(selectedAvatarIds)
      expect(simulator.selectedAvatarIds.value).toEqual([])
      expect(byId(root, 'warp-choice-avatar:8').props.disabled).toBe(true)
      expect(byId(root, 'warp-choice-avatar:1').props.disabled).not.toBe(true)
      const buttons = () => descendants(root).filter((entry) => entry.type === 'button')
      await click(buttons()[0]!)
      expect(simulator.selectedAvatarIds.value).toEqual([])
      expect(afterHide).toHaveBeenCalledOnce()
      simulator.openSelection()
      await flush()
      expect(simulator.selectionDraft.value).toEqual([])
      for (const id of selectedAvatarIds) await toggle(root, id)
      expect(buttons().at(-1)!.props.disabled).not.toBe(true)
      await click(buttons().at(-1)!)
      expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
      expect(afterHide).toHaveBeenCalledTimes(2)
    },
  )
  it('retains incompatible choices for explicit removal and restores search focus', async () => {
    const { root, simulator } = selection('en')
    const focused = vi.fn()
    vi.stubGlobal('document', { activeElement: null, getElementById: () => ({ focus: focused }) })
    simulator.setSelectionDraft(['avatar:missing', ...selectedAvatarIds.slice(0, 6)])
    await flush()
    expect(byClass(root, 'warp-unavailable-choices')).toHaveLength(1)
    expect(
      descendants(root)
        .filter((entry) => entry.type === 'button')
        .at(-1)!.props.disabled,
    ).toBe(true)
    await click(
      descendants(byClass(root, 'warp-unavailable-choices')[0]!).find(
        (entry) => entry.type === 'button',
      )!,
    )
    expect(simulator.selectionDraft.value).toEqual(selectedAvatarIds.slice(0, 6))
    expect(focused).toHaveBeenCalledOnce()
  })
})

describe('Warp Astral history', () => {
  it.each(['zh-CN', 'en'] as const)(
    'keeps the original table, order, details and page boundaries (%s)',
    async (locale) => {
      const simulator = useWarpSimulator({ snapshot, rng: seeded(77), storage: () => undefined })
      simulator.openSelection()
      simulator.setSelectionDraft(selectedAvatarIds)
      simulator.confirmSelection()
      await simulator.draw(10)
      await simulator.draw(10)
      await simulator.draw(10)
      const page = ref(0)
      const details = vi.fn()
      const root = mount(
        () =>
          h(WarpHistory, {
            entries: simulator.session.value.history.slice(page.value * 25, (page.value + 1) * 25),
            total: simulator.session.value.history.length,
            page: page.value,
            presentation,
            onPage: (value: number) => {
              page.value = value
            },
            onDetails: details,
          }),
        locale,
      )
      const rows = () => byClass(root, 'warp-history-name')
      expect(rows()).toHaveLength(25)
      expect(rows()[0]!.props.id).toBe('warp-history-' + simulator.session.value.history[0]!.id)
      expect(byClass(root, 'warp-history-table')).toHaveLength(1)
      expect(byClass(root, 'warp-stars-icon')).toHaveLength(25)
      await click(rows()[0]!)
      expect(details).toHaveBeenCalledWith(simulator.session.value.history[0])
      let buttons = descendants(byClass(root, 'warp-history-pagination')[0]!).filter(
        (entry) => entry.type === 'button',
      )
      expect(buttons[0]!.props.disabled).toBe(true)
      await click(buttons[1]!)
      expect(page.value).toBe(1)
      expect(rows()).toHaveLength(5)
      buttons = descendants(byClass(root, 'warp-history-pagination')[0]!).filter(
        (entry) => entry.type === 'button',
      )
      expect(buttons[1]!.props.disabled).toBe(true)
      await click(buttons[0]!)
      expect(rows()).toHaveLength(25)
    },
  )
  it('retains the original localized empty state without a table or pagination', () => {
    const root = mount(() => h(WarpHistory, { entries: [], total: 0, page: 0, presentation }), 'en')
    expect(byClass(root, 'warp-history-empty')).toHaveLength(1)
    expect(byClass(root, 'warp-history-table')).toHaveLength(0)
    expect(byClass(root, 'warp-history-pagination')).toHaveLength(0)
    expect(text(root)).toContain(en.warp.history.empty)
  })
})
