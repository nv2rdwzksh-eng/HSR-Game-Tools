import { defineComponent, h, nextTick, ref, watch, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import WarpBannerList from '../../../src/tools/warp-simulator/components/WarpBannerList.vue'
import WarpSimulatorPage from '../../../src/tools/warp-simulator/WarpSimulatorPage.vue'
import { availableBanners } from '../../../src/tools/warp-simulator/model/catalog'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import {
  multiBannerFixture,
  selectedAvatarIds,
  seeded,
} from '../../fixtures/warp-simulator/fixture'
import {
  renderer,
  node,
  descendants,
  type HostNode,
} from '../../fixtures/currency-wars/node-renderer'

const { useWarpSimulator: makeSimulator } = await vi.importActual<
  typeof import('../../../src/tools/warp-simulator/composables/useWarpSimulator')
>('../../../src/tools/warp-simulator/composables/useWarpSimulator')
let simulator: ReturnType<typeof makeSimulator>
vi.mock(
  '../../../src/tools/warp-simulator/composables/useWarpSimulator',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('../../../src/tools/warp-simulator/composables/useWarpSimulator')
    >()),
    useWarpSimulator: () => simulator,
  }),
)
vi.mock('../../../src/tools/warp-simulator/data/adapters/warp-data', async () => {
  const { multiBannerFixture } = await import('../../fixtures/warp-simulator/fixture')
  return { warpSnapshot: multiBannerFixture(), warpVisuals: {}, warpVisualDefinitions: undefined }
})
vi.mock('primevue/button', () => ({
  default: defineComponent({
    props: ['label', 'unstyled'],
    setup:
      (props, { attrs, slots }) =>
      () =>
        h('button', { type: 'button', ...attrs }, slots.default?.() ?? props.label),
  }),
}))
vi.mock('primevue/drawer', () => ({
  default: defineComponent({
    props: ['visible'],
    emits: ['after-hide', 'after-show', 'update:visible'],
    setup(props, { slots, emit, attrs }) {
      watch(
        () => props.visible,
        async (visible) => {
          await nextTick()
          emit(visible ? 'after-show' : 'after-hide')
        },
      )
      return () => (props.visible ? h('section', attrs, slots.default?.()) : null)
    },
  }),
}))
// This suite stubs browser overlays; real HModal locks/focus are covered by history-dialog-render.
vi.mock('astral-ui/components', async (original) => ({
  ...(await original<typeof import('astral-ui/components')>()),
  HModal: defineComponent({
    props: ['modelValue'],
    emits: ['after-leave', 'update:modelValue'],
    setup(props, { slots, attrs, emit }) {
      watch(
        () => props.modelValue,
        async (visible) => {
          if (!visible) {
            await nextTick()
            emit('after-leave')
          }
        },
      )
      return () => (props.modelValue ? h('section', attrs, slots.default?.()) : null)
    },
  }),
}))
vi.mock('primevue/dialog', () => ({
  default: defineComponent({
    props: ['visible'],
    emits: ['after-hide'],
    setup(props, { slots, emit }) {
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
          ? h('section', { class: 'reset-dialog' }, [slots.default?.(), slots.footer?.()])
          : null
    },
  }),
}))
vi.mock('../../../src/tools/warp-simulator/components/WarpSelectionDialog.vue', () => ({
  default: defineComponent({
    props: ['visible'],
    emits: ['cancel', 'confirm', 'after-hide'],
    setup(props, { emit }) {
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
          ? h('section', { class: 'selection-dialog' }, [
              h('button', { id: 'test-cancel-selection', onClick: () => emit('cancel') }),
              h('button', { id: 'test-confirm-selection', onClick: () => emit('confirm') }),
            ])
          : null
    },
  }),
}))
vi.mock('../../../src/tools/warp-simulator/components/WarpRevealOverlay.vue', () => ({
  default: defineComponent({
    props: ['mode', 'visible', 'batchId', 'phase', 'reviewRevision', 'entries', 'sourceLabel'],
    emits: ['escape', 'after-hide', 'review-close', 'review-after-hide'],
    setup(props, { emit }) {
      watch(
        () => props.visible,
        async (visible) => {
          if (!visible) {
            const batchId = props.batchId,
              revision = props.reviewRevision,
              mode = props.mode
            await nextTick()
            if (mode === 'review') emit('review-after-hide', batchId, revision)
            else emit('after-hide', batchId)
          }
        },
      )
      return () =>
        props.visible
          ? h('button', {
              id: 'test-close-overview',
              'data-entries': props.entries,
              'data-source': props.sourceLabel,
              'data-mode': props.mode,
              onClick: () => emit(props.mode === 'review' ? 'review-close' : 'escape'),
            })
          : null
    },
  }),
}))
vi.mock('../../../src/tools/warp-simulator/components/WarpItemDetails.vue', () => ({
  default: defineComponent({
    props: ['entry'],
    emits: ['close', 'after-leave'],
    setup(props, { emit }) {
      watch(
        () => props.entry,
        async (entry) => {
          if (!entry) {
            await nextTick()
            emit('after-leave')
          }
        },
      )
      return () =>
        props.entry
          ? h('section', { class: 'item-dialog' }, [
              h('button', { id: 'test-close-details', onClick: () => emit('close') }),
            ])
          : null
    },
  }),
}))
vi.mock('../../../src/tools/warp-simulator/composables/useWarpReducedMotion', () => ({
  useWarpReducedMotion: () => ref(true),
}))

const apps: App[] = []
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0)
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
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
const snapshot = multiBannerFixture()
const presentation = createPresentation(snapshot)
function mount(render: () => ReturnType<typeof h>, locale: 'zh-CN' | 'en' = 'zh-CN') {
  const root = node('root')
  const app = renderer.createApp({ render })
  app.use(createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, en } }))
  app.directive('tooltip', {})
  app.mount(root)
  apps.push(app)
  return root
}
function byClass(root: HostNode, value: string) {
  return descendants(root).filter((entry) =>
    String(entry.props.class ?? '')
      .split(/\s+/)
      .includes(value),
  )
}
function byId(root: HostNode, id: string) {
  return descendants(root).find((entry) => entry.props.id === id)!
}
async function flush() {
  for (let i = 0; i < 6; i++) await nextTick()
}
async function click(target: HostNode) {
  expect(target).toBeDefined()
  expect(target.props.disabled).not.toBe(true)
  ;(target.props.onClick as () => void)()
  await flush()
}
function choose(ids = selectedAvatarIds) {
  simulator.openSelection()
  simulator.setSelectionDraft(ids)
  expect(simulator.confirmSelection()).toBe(true)
}
function mountPage(locale: 'zh-CN' | 'en' = 'zh-CN', pageSnapshot = snapshot) {
  const rng = seeded(77)
  simulator = makeSimulator({ snapshot: pageSnapshot, rng, storage: () => undefined })
  const root = mount(() => h(WarpSimulatorPage), locale)
  const focused: string[] = []
  vi.stubGlobal('document', {
    getElementById: (id: string) => (byId(root, id) ? { focus: () => focused.push(id) } : null),
    querySelector: () => {
      const entry = [
        ...byClass(root, 'warp-affinity-avatar'),
        ...byClass(root, 'warp-affinity-empty'),
      ][0]
      return entry ? { focus: () => focused.push(String(entry.props.id)) } : null
    },
  })
  return { root, focused, rng }
}

describe('Rendered banner list', () => {
  it.each(['zh-CN', 'en'] as const)(
    'renders all valid banners and updates selection in %s',
    async (locale) => {
      simulator = makeSimulator({ snapshot, storage: () => undefined })
      const root = mount(
        () =>
          h(WarpBannerList, {
            banners: simulator.kindBanners.value,
            selectedBannerId: simulator.selectedBannerId.value,
            disabled: false,
            presentation,
            onSelect: simulator.selectBanner,
          }),
        locale,
      )
      const rows = byClass(root, 'warp-banner-row')
      expect(rows).toHaveLength(2)
      expect(byClass(root, 'warp-banner-five')).toHaveLength(2)
      expect(byClass(root, 'warp-banner-four')).toHaveLength(6)
      const label = String(rows[1]!.props['aria-label'])
      expect(label).toContain(presentation.item('avatar:8', locale).name)
      expect(label).toContain(locale === 'en' ? '5-star UP' : '5星 UP')
      expect(rows.every((row) => row.type === 'button' && row.props.type === 'button')).toBe(true)
      await click(rows[1]!)
      expect(simulator.selectedBannerId.value).toBe('gacha:200')
      expect(byClass(root, 'warp-banner-row').map((row) => row.props['aria-pressed'])).toEqual([
        false,
        true,
      ])
      simulator.selectKind('event-light-cone')
      simulator.selectBanner('gacha:201')
      simulator.selectKind('event-avatar')
      await flush()
      expect(simulator.selectedBannerId.value).toBe('gacha:200')
      expect(byClass(root, 'warp-banner-row')).toHaveLength(2)
    },
  )
  it('renders Fate without four-star placeholders, Ordinary without UP, and an empty catalog', async () => {
    const current = makeSimulator({ snapshot, storage: () => undefined })
    const root = mount(() =>
      h(WarpBannerList, { banners: current.kindBanners.value, disabled: false, presentation }),
    )
    current.selectKind('fate-avatar')
    await flush()
    expect(byClass(root, 'warp-banner-five')).toHaveLength(1)
    expect(byClass(root, 'warp-banner-four')).toHaveLength(0)
    current.selectKind('ordinary')
    await flush()
    expect(byClass(root, 'warp-banner-five')).toHaveLength(0)
    expect(byClass(root, 'warp-banner-four')).toHaveLength(0)
    expect(byClass(root, 'warp-banner-ordinary')).toHaveLength(1)
    const empty = mount(() =>
      h(WarpBannerList, {
        banners: availableBanners({ ...snapshot, banners: [] }).banners,
        disabled: true,
        presentation,
      }),
    )
    expect(byClass(empty, 'warp-banner-empty')).toHaveLength(1)
    expect(byClass(empty, 'warp-banner-row')).toHaveLength(0)
  })
})

describe('Control page integration (Node renderer; browser overlays are stubbed)', () => {
  it('keeps the page heading focused on its title and navigation', () => {
    const { root } = mountPage()
    const heading = byClass(root, 'warp-page-heading')[0]!
    expect(descendants(heading).filter((entry) => entry.type === 'h1')).toHaveLength(1)
    expect(descendants(heading).filter((entry) => entry.type === 'p')).toHaveLength(0)
    expect(byId(heading, 'warp-controls-trigger')).toBeDefined()
    expect(byId(heading, 'warp-history-trigger')).toBeDefined()
  })
  it('opens latest results independently of the selected banner and returns focus without changing session data', async () => {
    const { root, focused } = mountPage()
    expect(byId(root, 'warp-review-trigger')).toBeUndefined()
    choose()
    await flush()
    await click(byId(root, 'warp-pull-ten'))
    expect(byId(root, 'test-close-overview').props['data-mode']).toBe('reveal')
    await click(byId(root, 'test-close-overview'))
    expect(focused.at(-1)).toBe('warp-pull-ten')
    simulator.selectKind('ordinary')
    await flush()
    const session = simulator.session.value
    const batch = simulator.latestResults.value
    await click(byId(root, 'warp-review-trigger'))
    const view = byId(root, 'test-close-overview')
    expect(view.props['data-mode']).toBe('review')
    expect(view.props['data-entries']).toEqual(batch)
    expect(view.props['data-source']).toContain(zh.warp.kind['event-avatar'])
    expect(byClass(root, 'warp-home')[0]!.props.inert).toBe(true)
    await click(view)
    expect(focused.at(-1)).toBe('warp-review-trigger')
    expect(byClass(root, 'warp-home')[0]!.props.inert).toBe(false)
    expect(simulator.session.value).toBe(session)
    simulator.requestReset('all')
    simulator.confirmReset()
    await flush()
    expect(byId(root, 'warp-review-trigger')).toBeUndefined()
  })
  it('closes history before details and restores the history row after Dialog hide', async () => {
    const { root, focused } = mountPage()
    choose()
    await simulator.draw(10)
    await click(byId(root, 'test-close-overview'))
    const session = simulator.session.value
    await click(byId(root, 'warp-history-trigger'))
    await click(byId(root, 'warp-history-view-tab-records'))
    const row = byClass(root, 'warp-history-name')[0]!
    const id = String(row.props.id)
    await click(row)
    expect(byId(root, 'warp-history-dialog')).toBeUndefined()
    expect(byClass(root, 'item-dialog')).toHaveLength(1)
    await click(byId(root, 'test-close-details'))
    expect(byId(root, 'warp-history-dialog')).toBeDefined()
    expect(focused.at(-1)).toBe(id)
    expect(simulator.session.value).toBe(session)
  })
  it('keeps linked Astral tabs, a long banner list and the independent footer', async () => {
    const many = multiBannerFixture()
    const sourceBanner = many.banners.find((entry) => entry.kind === 'event-avatar')!
    many.banners.push(
      ...Array.from({ length: 18 }, (_, index) => ({
        ...sourceBanner,
        id: `gacha:${300 + index}`,
        gachaId: String(300 + index),
      })),
    )
    const { root } = mountPage('zh-CN', many)
    await click(byId(root, 'warp-controls-trigger'))
    const controls = byClass(root, 'warp-controls')[0]!
    const panels = byClass(root, 'warp-control-panel')
    const activePanel = panels.find((entry) => entry.props.id === 'warp-kind-panel-event-avatar')!
    expect(activePanel.props.role).toBe('tabpanel')
    expect(activePanel.props['aria-labelledby']).toBe('warp-kind-tab-event-avatar')
    const footer = byClass(root, 'warp-control-footer')[0]!
    expect(footer.parent).toBe(controls)
    expect(byClass(root, 'warp-control-tabs')[0]!.parent).toBe(controls)
    for (const tab of descendants(root).filter((entry) => entry.props.role === 'tab')) {
      const panel = panels.find((entry) => entry.props.id === tab.props['aria-controls'])!
      expect(panel.props['aria-labelledby']).toBe(tab.props.id)
    }
    const rows = byClass(root, 'warp-banner-row')
    expect(rows).toHaveLength(20)
    const session = simulator.session.value
    await click(rows.at(-1)!)
    expect(simulator.selectedBannerId.value).toBe('gacha:317')
    const tabs = descendants(root).filter((entry) => entry.props.role === 'tab')
    await click(tabs[1]!)
    expect(simulator.activeKind.value).toBe('event-light-cone')
    expect(activePanel.style.display).toBe('none')
    await click(tabs[0]!)
    expect(simulator.selectedBannerId.value).toBe('gacha:317')
    expect(activePanel.style.display).not.toBe('none')
    expect(byClass(root, 'warp-banner-row')).toHaveLength(20)
    expect(simulator.session.value).toBe(session)
  })
  it('opens the empty trigger, confirms seven choices and restores focus to the first avatar', async () => {
    const { root, focused } = mountPage()
    await click(byId(root, 'warp-controls-trigger'))
    expect(byClass(root, 'warp-control-footer')).toHaveLength(1)
    expect(byClass(root, 'warp-affinity-avatar')).toHaveLength(0)
    await click(byId(root, 'warp-affinity-empty'))
    expect(simulator.selectionOpen.value).toBe(true)
    expect(byId(root, 'warp-controls-drawer')).toBeUndefined()
    simulator.setSelectionDraft(selectedAvatarIds)
    await click(byId(root, 'test-confirm-selection'))
    expect(byClass(root, 'warp-affinity-avatar')).toHaveLength(7)
    expect(focused.at(-1)).toBe(`warp-affinity-${selectedAvatarIds[0]}`)
  })
  it.each(['zh-CN', 'en'] as const)(
    'opens each named avatar, cancels drafts, and restores the exact trigger in %s',
    async (locale) => {
      const { root, focused } = mountPage(locale)
      choose()
      await click(byId(root, 'warp-controls-trigger'))
      for (const id of selectedAvatarIds) {
        const trigger = byId(root, `warp-affinity-${id}`)
        expect(trigger.props['aria-label']).toContain(presentation.item(id, locale).name)
        expect(trigger.props['aria-haspopup']).toBe('dialog')
        await click(trigger)
        expect(simulator.selectionOpen.value).toBe(true)
        simulator.setSelectionDraft(['avatar:8', ...selectedAvatarIds.slice(1)])
        await click(byId(root, 'test-cancel-selection'))
        expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
        expect(focused.at(-1)).toBe(`warp-affinity-${id}`)
      }
    },
  )
  it('falls back to the first avatar when editing removes the triggering character', async () => {
    const { root, focused } = mountPage()
    choose()
    await click(byId(root, 'warp-controls-trigger'))
    await click(byId(root, `warp-affinity-${selectedAvatarIds[0]}`))
    simulator.setSelectionDraft(['avatar:8', ...selectedAvatarIds.slice(1)])
    await click(byId(root, 'test-confirm-selection'))
    expect(focused.at(-1)).toBe('warp-affinity-avatar:8')
  })
  it.each(['group', 'all'] as const)(
    'preserves the %s reset confirmation scope and trigger focus',
    async (scope) => {
      const { root, focused } = mountPage()
      choose()
      await simulator.draw(10)
      await click(byId(root, 'test-close-overview'))
      const before = simulator.session.value
      await click(byId(root, 'warp-controls-trigger'))
      await click(byId(root, `warp-reset-${scope}`))
      expect(simulator.resetScope.value).toBe(scope)
      let buttons = descendants(byClass(root, 'reset-dialog')[0]!).filter(
        (entry) => entry.type === 'button',
      )
      await click(buttons[0]!)
      expect(simulator.session.value).toBe(before)
      expect(focused.at(-1)).toBe(`warp-reset-${scope}`)
      await click(byId(root, `warp-reset-${scope}`))
      buttons = descendants(byClass(root, 'reset-dialog')[0]!).filter(
        (entry) => entry.type === 'button',
      )
      await click(buttons[1]!)
      expect(simulator.pity.value?.pullsSinceLast5).toBe(0)
      expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
      expect(simulator.selectedBannerId.value).toBe('gacha:100')
      expect(focused.at(-1)).toBe(`warp-reset-${scope}`)
      if (scope === 'group') {
        expect(simulator.session.value.history).toBe(before.history)
        expect(simulator.session.value.latestBatchId).toBe(before.latestBatchId)
        expect(simulator.session.value.engine.groups['pity:ordinary']).toBe(
          before.engine.groups['pity:ordinary'],
        )
      } else {
        expect(simulator.session.value.history).toEqual([])
        expect(simulator.session.value.latestBatchId).toBeUndefined()
        expect(
          Object.values(simulator.session.value.engine.groups).every(
            (pity) => pity.pullsSinceLast5 === 0 && pity.pullsSinceLast4 === 0,
          ),
        ).toBe(true)
      }
    },
  )
  it('binds pity to the active group without changing the session or replaying draws', async () => {
    const { root, rng } = mountPage()
    choose()
    await simulator.draw(10)
    await click(byId(root, 'test-close-overview'))
    const before = simulator.session.value
    const consumed = rng.consumed
    await click(byId(root, 'warp-controls-trigger'))
    await click(byClass(root, 'warp-banner-row')[1]!)
    expect(simulator.session.value).toBe(before)
    expect(simulator.pity.value).toBe(before.engine.groups['pity:event-avatar'])
    expect(byClass(root, 'warp-pity-number')[0]!.text).toBe('10')
    simulator.selectKind('ordinary')
    await flush()
    expect(simulator.pity.value).toBe(before.engine.groups['pity:ordinary'])
    expect(byClass(root, 'warp-pity-number')[0]!.text).toBe('0')
    expect(rng.consumed).toBe(consumed)
    expect(byClass(root, 'warp-affinity')).toHaveLength(0)
    expect(byClass(root, 'warp-pity')).toHaveLength(1)
  })
})
