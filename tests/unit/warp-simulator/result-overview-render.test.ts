import { defineComponent, h, nextTick, onMounted, ref, watch, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  renderer,
  node,
  descendants,
  type HostNode,
} from '../../fixtures/warp-simulator/node-renderer'
import WarpRevealOverlay from '../../../src/tools/warp-simulator/components/WarpRevealOverlay.vue'
import WarpResultCard from '../../../src/tools/warp-simulator/components/WarpResultCard.vue'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import { warpVisualDefinitions } from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import {
  resultDisplayScenarios,
  resultDisplaySnapshot,
  resultDisplayVisuals,
} from '../../fixtures/warp-simulator/result-display'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

const { focused } = vi.hoisted(() => ({ focused: [] as string[] }))
let finishDetailLeave: () => void
vi.mock('astral-ui/components', async (original) => ({
  ...(await original<typeof import('astral-ui/components')>()),
  HModal: defineComponent({
    props: ['modelValue', 'title'],
    emits: ['update:modelValue', 'after-leave'],
    setup(props, { attrs, slots, emit }) {
      const rendered = ref(!!props.modelValue)
      watch(
        () => props.modelValue,
        (open) => {
          if (open) rendered.value = true
        },
      )
      finishDetailLeave = () => {
        rendered.value = false
        emit('after-leave')
      }
      return () =>
        rendered.value
          ? h('section', { ...attrs, 'data-title': props.title }, [
              h('button', { id: 'modal-close', onClick: () => emit('update:modelValue', false) }),
              slots.illustration?.(),
              slots.default?.(),
              slots.footer?.(),
            ])
          : null
    },
  }),
}))

vi.mock('primevue/button', () => ({
  default: defineComponent({
    props: ['label', 'unstyled'],
    setup(props, { attrs, slots, expose }) {
      expose({ $el: { isConnected: true, focus: () => focused.push(String(attrs['aria-label'])) } })
      return () => h('button', attrs, slots.default?.() ?? props.label)
    },
  }),
}))
vi.mock('primevue/dialog', () => ({
  default: defineComponent({
    props: ['visible', 'pt'],
    emits: ['show', 'after-hide'],
    setup(props, { slots, emit }) {
      onMounted(() => {
        if (props.visible) emit('show')
      })
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
          ? h('section', { role: 'dialog', ...props.pt?.root }, slots.container?.())
          : null
    },
  }),
}))
vi.mock('../../../src/tools/warp-simulator/composables/useWarpPixelRatio', () => ({
  useWarpPixelRatio: () => ref(2),
}))
// The real card is tested below; this stub isolates modal navigation from CSS layout.
vi.mock('../../../src/tools/warp-simulator/components/WarpResultsWall.vue', () => ({
  default: defineComponent({
    props: ['entries'],
    emits: ['details'],
    setup(props, { emit }) {
      return () =>
        h(
          'div',
          (props.entries as { id: number }[]).map((entry) =>
            h('button', {
              id: `wall-${entry.id}`,
              onClick: () => emit('details', entry),
            }),
          ),
        )
    },
  }),
}))

const apps: App[] = []
const adapter = createPresentation(
  resultDisplaySnapshot,
  resultDisplayVisuals,
  '/',
  warpVisualDefinitions,
)
const entries = resultDisplayScenarios().find((s) => s.id === 'five-mixed')!.entries
const cls = (root: HostNode, name: string) =>
  descendants(root).find((n) =>
    String(n.props.class ?? '')
      .split(/\s+/)
      .includes(name),
  )!
async function flush() {
  await nextTick()
  await nextTick()
  await nextTick()
}
function configure(app: App) {
  app.use(createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } }))
  app.directive('tooltip', {})
  apps.push(app)
}
function clickOverview(root: HostNode, ancestor = '.warp-wall-viewport', defaultPrevented = false) {
  const target = {
    closest: (selector: string) => (selector.split(', ').includes(ancestor) ? {} : null),
  }
  ;(cls(root, 'warp-overview').props.onClick as (event: unknown) => void)({
    target,
    defaultPrevented,
  })
}
beforeEach(() => {
  focused.length = 0
  vi.stubGlobal('document', {
    getElementById: (id: string) => ({ isConnected: true, focus: () => focused.push(id) }),
  })
  vi.stubGlobal('getComputedStyle', () => ({ zIndex: '4500' }))
})
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})

describe('Overview interactions in the real overlay (Node renderer, no browser focus trap)', () => {
  it('keeps ten ordered entries and isolates details before closing the batch', async () => {
    const root = node('root'),
      escape = vi.fn(),
      activate = vi.fn()
    const app = renderer.createApp({
      render: () =>
        h(WarpRevealOverlay, {
          visible: true,
          phase: 'overview',
          batchId: entries[0]!.batchId,
          entries,
          presentation: adapter,
          artworkReady: false,
          identityReady: false,
          onEscape: escape,
          onActivate: activate,
        }),
    })
    configure(app)
    app.mount(root)
    await flush()
    expect(focused.at(-1)).toBe('关闭结果总览')
    const cards = descendants(root).filter((n) => String(n.props.id).startsWith('wall-'))
    expect(cards.map((n) => n.props.id)).toEqual(entries.map((e) => `wall-${e.id}`))
    expect(cls(root, 'warp-reveal-screen')).toBeUndefined()
    for (const ancestor of [
      'button',
      '.warp-overview-header',
      'a',
      'input',
      'select',
      'textarea',
      '[role="button"]',
      '[contenteditable="true"]',
    ])
      clickOverview(root, ancestor)
    clickOverview(root, '.warp-wall-viewport', true)
    expect(escape).not.toHaveBeenCalled()
    ;(cards[0]!.props.onClick as () => void)()
    await flush()
    expect(cls(root, 'warp-overview').props.inert).toBe(true)
    expect(cls(root, 'warp-item-dialog')).toBeDefined()
    clickOverview(root)
    expect(escape).not.toHaveBeenCalled()
    const parent = cls(root, 'warp-reveal-dialog')
    expect(parent.props.inert).toBe(true)
    expect(parent.props['aria-hidden']).toBe('true')
    expect(cls(root, 'warp-item-dialog').props.style).toEqual({ zIndex: 4501 })
    const event = {
      key: 'Escape',
      repeat: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    }
    ;(cls(root, 'warp-reveal-shell').props.onKeydown as (event: unknown) => void)(event)
    await flush()
    expect(escape).not.toHaveBeenCalled()
    ;(descendants(root).find((n) => n.props.id === 'modal-close')!.props.onClick as () => void)()
    await flush()
    expect(parent.props.inert).toBe(true)
    expect(cls(root, 'warp-overview').props.inert).toBe(true)
    expect(cls(root, 'warp-item-dialog').props['data-title']).toBe(
      adapter.item(entries[0]!.event.itemId, 'zh-CN').name,
    )
    finishDetailLeave()
    await flush()
    expect(cls(root, 'warp-item-dialog')).toBeUndefined()
    expect(cls(root, 'warp-overview').props.inert).toBe(false)
    expect(focused.at(-1)).toBe(`warp-overview-result-${entries[0]!.id}`)
    expect(escape).not.toHaveBeenCalled()
    ;(cls(root, 'warp-reveal-shell').props.onKeydown as (event: unknown) => void)(event)
    expect(escape).toHaveBeenCalledOnce()
    expect(activate).not.toHaveBeenCalled()
  })
  it.each(['hide', 'batch'])(
    'discards details on parent %s without restoring an obsolete card',
    async (change) => {
      const root = node('root')
      const visible = ref(true)
      const revision = ref(1)
      const app = renderer.createApp({
        render: () =>
          h(WarpRevealOverlay, {
            mode: 'review',
            visible: visible.value,
            reviewRevision: revision.value,
            batchId: entries[0]!.batchId,
            phase: 'idle',
            entries,
            presentation: adapter,
            artworkReady: false,
            identityReady: false,
          }),
      })
      configure(app)
      app.mount(root)
      await flush()
      ;(
        descendants(root).find((n) => n.props.id === `wall-${entries[0]!.id}`)!.props
          .onClick as () => void
      )()
      await flush()
      const finishOld = finishDetailLeave
      if (change === 'hide') visible.value = false
      else revision.value++
      await flush()
      focused.length = 0
      finishOld()
      await flush()
      expect(cls(root, 'warp-item-dialog')).toBeUndefined()
      expect(focused).toEqual([])
      if (change === 'batch') expect(cls(root, 'warp-reveal-dialog').props.inert).toBe(false)
    },
  )
  it('falls back to the existing overview close button when the card has gone', async () => {
    const root = node('root')
    const app = renderer.createApp({
      render: () =>
        h(WarpRevealOverlay, {
          visible: true,
          phase: 'overview',
          batchId: entries[0]!.batchId,
          entries,
          presentation: adapter,
          artworkReady: false,
          identityReady: false,
        }),
    })
    configure(app)
    app.mount(root)
    await flush()
    ;(
      descendants(root).find((n) => n.props.id === `wall-${entries[0]!.id}`)!.props
        .onClick as () => void
    )()
    await flush()
    ;(descendants(root).find((n) => n.props.id === 'modal-close')!.props.onClick as () => void)()
    await flush()
    vi.stubGlobal('document', { getElementById: () => null })
    finishDetailLeave()
    await flush()
    expect(focused.at(-1)).toBe(zh.warp.results.close)
  })
  it.each(['.warp-overview', '.warp-wall-viewport', '.warp-wall-canvas', '.warp-wall-row'])(
    'closes once through the existing escape event when clicking blank %s',
    async (ancestor) => {
      const root = node('root'),
        escape = vi.fn(),
        activate = vi.fn()
      const phase = ref<'overview' | 'leaving'>('overview')
      const app = renderer.createApp({
        render: () =>
          h(WarpRevealOverlay, {
            visible: true,
            phase: phase.value,
            batchId: entries[0]!.batchId,
            entries,
            presentation: adapter,
            artworkReady: false,
            identityReady: false,
            onEscape: escape,
            onActivate: activate,
          }),
      })
      configure(app)
      app.mount(root)
      await flush()
      clickOverview(root, ancestor)
      expect(escape).toHaveBeenCalledOnce()
      expect(activate).not.toHaveBeenCalled()
      phase.value = 'leaving'
      await flush()
      clickOverview(root, ancestor)
      expect(escape).toHaveBeenCalledOnce()
    },
  )
  it('keeps the close button available without double-closing through its bubbled click', async () => {
    const root = node('root'),
      escape = vi.fn()
    const app = renderer.createApp({
      render: () =>
        h(WarpRevealOverlay, {
          visible: true,
          phase: 'overview',
          batchId: entries[0]!.batchId,
          entries,
          presentation: adapter,
          artworkReady: false,
          identityReady: false,
          onEscape: escape,
        }),
    })
    configure(app)
    app.mount(root)
    await flush()
    ;(cls(root, 'warp-reveal-close').props.onClick as () => void)()
    clickOverview(root, 'button')
    expect(escape).toHaveBeenCalledOnce()
  })
  it.each(['single-avatar-5', 'single-light-cone-5', 'five-mixed'])(
    'reviews %s with no reveal controls and restores card focus after details',
    async (scenarioId) => {
      const batch = resultDisplayScenarios().find((s) => s.id === scenarioId)!.entries
      const visible = ref(true),
        closed = vi.fn(),
        hidden = vi.fn(),
        activate = vi.fn(),
        escape = vi.fn(),
        ready = vi.fn()
      const root = node('root')
      const app = renderer.createApp({
        render: () =>
          h(WarpRevealOverlay, {
            mode: 'review',
            reviewRevision: 7,
            visible: visible.value,
            batchId: batch[0]!.batchId,
            entries: batch,
            presentation: adapter,
            sourceLabel: 'Selected banner',
            sourceLabelForEntry: (entry: (typeof entries)[number]) =>
              'Original: ' + entry.event.bannerId,
            phase: 'idle',
            artworkReady: false,
            identityReady: false,
            onActivate: activate,
            onEscape: escape,
            'onArtwork-ready': ready,
            'onReview-close': () => {
              closed()
              visible.value = false
            },
            'onReview-after-hide': hidden,
          }),
      })
      configure(app)
      app.mount(root)
      await flush()
      expect(cls(root, 'warp-reveal-screen')).toBeUndefined()
      expect(cls(root, 'warp-reveal-identity')).toBeUndefined()
      const card =
        batch.length === 10
          ? descendants(root).find((n) => n.props.id === `wall-${batch[0]!.id}`)!
          : descendants(root).find((n) => n.props.id === `warp-overview-result-${batch[0]!.id}`)!
      ;(card.props.onClick as () => void)()
      await flush()
      expect(cls(root, 'warp-item-dialog')).toBeDefined()
      expect(
        descendants(root).some((n) => n.text === 'Original: ' + batch[0]!.event.bannerId),
      ).toBe(true)
      const key = { key: 'Escape', repeat: false, preventDefault() {}, stopPropagation() {} }
      ;(descendants(root).find((n) => n.props.id === 'modal-close')!.props.onClick as () => void)()
      await flush()
      finishDetailLeave()
      await flush()
      expect(focused.at(-1)).toBe(`warp-overview-result-${batch[0]!.id}`)
      expect(closed).not.toHaveBeenCalled()
      ;(cls(root, 'warp-reveal-shell').props.onKeydown as (event: unknown) => void)(key)
      await flush()
      expect(closed).toHaveBeenCalledOnce()
      expect(hidden).toHaveBeenCalledWith(batch[0]!.batchId, 7)
      expect(activate).not.toHaveBeenCalled()
      expect(escape).not.toHaveBeenCalled()
      expect(ready).not.toHaveBeenCalled()
    },
  )
  it('uses preview artwork for single cones and preserves image readiness identities', async () => {
    const entry = resultDisplayScenarios().find((s) => s.id === 'single-light-cone-3')!.entries[0]!
    const item = adapter.item(entry.event.itemId, 'zh-CN'),
      ready = vi.fn()
    const root = node('root')
    const app = renderer.createApp({
      render: () =>
        h(WarpRevealOverlay, {
          visible: true,
          phase: 'artwork',
          batchId: entry.batchId,
          entry,
          item,
          artworkReady: false,
          identityReady: false,
          'onArtwork-ready': ready,
        }),
    })
    configure(app)
    app.mount(root)
    await flush()
    const image = descendants(root).find(
      (n) => n.type === 'img' && n.props.src === item.lightConePreview!.url,
    )!
    expect(image.props.style).toMatchObject({ maxWidth: '174px', maxHeight: '204px' })
    ;(image.props.onError as (e: unknown) => void)({
      target: { getAttribute: () => item.lightConePreview!.url },
    })
    await flush()
    const fallback = descendants(root).find(
      (n) => n.type === 'img' && n.props.src === item.artworkUrl,
    )!
    expect(fallback).toBeDefined()
    ;(fallback.props.onError as (e: unknown) => void)({
      target: { getAttribute: () => item.artworkUrl },
    })
    await flush()
    expect(ready).toHaveBeenCalledWith(entry.batchId, entry.id)
  })
  it('emits the outgoing batch token with the modal hide callback', async () => {
    const visible = ref(true),
      hidden = vi.fn(),
      root = node('root')
    const app = renderer.createApp({
      render: () =>
        h(WarpRevealOverlay, {
          visible: visible.value,
          batchId: 42,
          phase: visible.value ? 'overview' : 'leaving',
          entries,
          presentation: adapter,
          artworkReady: false,
          identityReady: false,
          'onAfter-hide': hidden,
        }),
    })
    configure(app)
    app.mount(root)
    await flush()
    visible.value = false
    await flush()
    expect(hidden).toHaveBeenCalledWith(42)
  })
})

describe('Unified result card image sources', () => {
  it('preserves cone metadata and ordered preview fallback without a legacy visual branch', async () => {
    const root = node('root'),
      entry = entries[1]!,
      item = adapter.item(entry.event.itemId, 'zh-CN')
    const app = renderer.createApp({ render: () => h(WarpResultCard, { entry, item, index: 1 }) })
    configure(app)
    app.mount(root)
    await flush()
    expect(cls(root, 'warp-cone-card')).toBeDefined()
    expect(cls(root, 'warp-card-path-icon')).toBeDefined()
    expect(cls(root, 'warp-card-element-icon')).toBeUndefined()
    const image = descendants(root).find(
      (n) => n.type === 'img' && n.props.src === item.lightConePreview!.url,
    )!
    ;(image.props.onError as (event: unknown) => void)({
      target: { getAttribute: () => item.lightConePreview!.url },
    })
    await flush()
    const fallback = descendants(root).find(
      (n) => n.type === 'img' && n.props.src === item.artworkUrl,
    )!
    expect(fallback).toBeDefined()
    ;(fallback.props.onLoad as (event: unknown) => void)({
      target: { getAttribute: () => item.artworkUrl, naturalWidth: 902, naturalHeight: 1260 },
    })
    await flush()
    expect(cls(root, 'warp-result-image-loading')).toBeUndefined()
  })
  it('keeps the card unrotated and emits the original details identity', async () => {
    const root = node('root'),
      entry = entries[1]!,
      item = adapter.item(entry.event.itemId, 'zh-CN'),
      details = vi.fn()
    const app = renderer.createApp({
      render: () => h(WarpResultCard, { entry, item, index: 1, onDetails: details }),
    })
    configure(app)
    app.mount(root)
    await flush()
    expect(cls(root, 'warp-result-card').props.style).not.toHaveProperty('transform')
    ;(cls(root, 'warp-result-card').props.onClick as () => void)()
    expect(details).toHaveBeenCalledWith(entry)
  })
})
