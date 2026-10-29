import { defineComponent, h, nextTick, ref, shallowRef, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WarpHistoryDialog from '../../../src/tools/warp-simulator/components/WarpHistoryDialog.vue'
import WarpItemDetails from '../../../src/tools/warp-simulator/components/WarpItemDetails.vue'
import { useWarpOverlay } from '../../../src/tools/warp-simulator/composables/useWarpOverlay'
import type { HistoryEntry } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import {
  descendants,
  node,
  renderer,
  type HostNode,
} from '../../fixtures/currency-wars/node-renderer'
import {
  resultDisplayScenarios,
  resultDisplaySnapshot,
  resultDisplayVisuals,
} from '../../fixtures/warp-simulator/result-display'
import { warpVisualDefinitions } from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

const transitions = vi.hoisted(
  () => [] as { before: (e: object) => void; leave: (e: object) => void }[],
)
vi.mock('vue', async (original) => {
  const vue = await original<typeof import('vue')>()
  return {
    ...vue,
    Transition: vue.defineComponent({
      props: ['onBeforeLeave', 'onAfterLeave'],
      setup(props, { slots }) {
        transitions.push({
          before: (e) => props.onBeforeLeave(e),
          leave: (e) => props.onAfterLeave(e),
        })
        return () => vue.h('transition-host', slots.default?.())
      },
    }),
  }
})
const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  transitions.length = 0
  vi.unstubAllGlobals()
})
const presentation = createPresentation(
  resultDisplaySnapshot,
  resultDisplayVisuals,
  '/',
  warpVisualDefinitions,
)
const text = (n: HostNode): string => n.text + n.children.map(text).join(' ')
function mount(locale: 'zh-CN' | 'en' = 'zh-CN', entries?: readonly HistoryEntry[]) {
  const original = resultDisplayScenarios().find((s) => s.id === 'single-avatar-5')!.entries[0]!
  const history =
    entries ??
    Array.from({ length: 30 }, (_, index): HistoryEntry => ({
      ...original,
      id: 30 - index,
      event: {
        ...original.event,
        isUp: index === 0 ? true : index === 1 ? false : null,
        pityBefore: { ...original.event.pityBefore, pullsSinceLast5: index },
      },
    }))
  const page = ref(0),
    detail = shallowRef<HistoryEntry>()
  const body = node('body'),
    root = node('root')
  body.style.overflow = 'scroll'
  const trigger = { isConnected: true, focus: vi.fn() }
  const listeners = new Set<(event: object) => void>()
  const frames = new Map<number, FrameRequestCallback>()
  let frame = 0
  const all = () => [...descendants(root), ...descendants(body)]
  const find = (id: string) => all().find((n) => n.props.id === id)
  const doc = {
    activeElement: trigger as unknown,
    body,
    documentElement: {
      clientWidth: 1000,
      style: { getPropertyValue: () => '', getPropertyPriority: () => '', setProperty: vi.fn() },
    },
    addEventListener: (_key: string, fn: (event: object) => void) => listeners.add(fn),
    removeEventListener: (_key: string, fn: (event: object) => void) => listeners.delete(fn),
    getElementById: find,
  }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { innerWidth: 1000 })
  vi.stubGlobal('getComputedStyle', () => ({ scrollbarGutter: 'auto' }))
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.set(++frame, cb)
    return frame
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  let overlay!: ReturnType<typeof useWarpOverlay>
  const shown = vi.fn()
  function focus(id: string | undefined) {
    if (id) (find(id) as unknown as HTMLElement | undefined)?.focus({ preventScroll: true })
  }
  const app = renderer.createApp(
    defineComponent({
      setup() {
        overlay = useWarpOverlay()
        overlay.openPanel('history')
        return () => [
          h(WarpHistoryDialog, {
            visible: overlay.panel.value === 'history',
            history,
            entries: history.slice(page.value * 25, (page.value + 1) * 25),
            page: page.value,
            group: original.event.pityGroup,
            kind: original.event.pityGroup.slice(5) as 'event-avatar',
            presentation,
            onPage: (value: number) => {
              page.value = value
            },
            onClose: overlay.closePanel,
            onDetails: (entry: HistoryEntry, id: string) =>
              overlay.openDialog(
                () => {
                  detail.value = entry
                },
                id,
                'details',
              ),
            onAfterLeave: () => focus(overlay.afterPanelHide('history')),
            onAfterShow: () => {
              shown()
              focus(overlay.takeFocus())
            },
          }),
          h(WarpItemDetails, {
            entry: detail.value,
            item: detail.value ? presentation.item(detail.value.event.itemId, locale) : undefined,
            sourceLabel: 'Original banner',
            onClose: () => {
              detail.value = undefined
            },
            onAfterLeave: () => focus(overlay.afterDialogHide('details')),
          }),
        ]
      },
    }),
  )
  app.use(
    createI18n({ legacy: false, locale, fallbackLocale: false, messages: { 'zh-CN': zh, en } }),
  )
  app.directive('tooltip', {})
  app.mount(root)
  apps.push(app)
  function wire() {
    const elements = all()
    for (const n of elements)
      Object.assign(n, {
        isConnected: true,
        focus: vi.fn(() => {
          doc.activeElement = n
        }),
      })
    for (const dialog of elements.filter((n) => n.props.role === 'dialog')) {
      const items = descendants(dialog).filter(
        (n) =>
          (n.type === 'button' && n.props.disabled !== true && n.props.tabindex !== -1) ||
          n.props.tabindex === 0,
      )
      Object.assign(dialog, { querySelector: () => items[0], querySelectorAll: () => items })
    }
  }
  wire()
  async function flush() {
    for (let i = 0; i < 6; i++) {
      await nextTick()
      wire()
    }
    const callbacks = [...frames.values()]
    frames.clear()
    callbacks.forEach((cb) => cb(0))
    await nextTick()
  }
  async function click(n: HostNode) {
    ;(n.props.onClick as () => void)()
    await flush()
  }
  const cls = (name: string) =>
    all().filter((n) => String(n.props.class).split(/\s+/).includes(name))
  const leave = async (index: number) => {
    const element = {}
    transitions[index]!.before(element)
    transitions[index]!.leave(element)
    // Wire the incoming dialog before HModal's initial-focus ticks run.
    await nextTick()
    wire()
    await flush()
  }
  const key = async (event: object) => {
    ;[...listeners].forEach((fn) => fn(event))
    await flush()
  }
  return {
    app,
    root,
    body,
    all,
    history,
    find,
    cls,
    page,
    detail,
    overlay,
    shown,
    listeners,
    frames,
    doc,
    trigger,
    flush,
    click,
    leave,
    key,
  }
}

describe('history modal with real Astral modal lifecycle in a Node host', () => {
  it.each(['zh-CN', 'en'] as const)(
    'defaults to statistics, preserves repeated events and shows only true UP (%s)',
    async (locale) => {
      const m = mount(locale)
      await m.flush()
      expect(m.cls('warp-statistics-row')).toHaveLength(30)
      expect(m.cls('h-badge')).toHaveLength(1)
      expect(m.cls('h-modal__footer')).toHaveLength(0)
      expect(m.cls('h-tabs--pill')).toHaveLength(1)
      expect(m.cls('warp-statistics-scale')).toHaveLength(0)
      expect(m.cls('warp-statistics-pulls').map(text)[0]).toBe(locale === 'en' ? '1 pull' : '1 抽')
      expect(m.cls('warp-statistics-bar')[0]!.props.style).toMatchObject({
        width: `${100 / 90}%`,
        backgroundColor: 'hsl(120 65% 40%)',
      })
      expect(m.cls('warp-statistics-portrait')[0]!.props['aria-label']).toContain(
        presentation.item(m.history[0]!.event.itemId, locale).name,
      )
      await m.click(m.find('warp-history-view-tab-records')!)
      expect(m.all().filter((n) => n.type === 'th')).toHaveLength(4)
      expect(m.cls('warp-history-name')).toHaveLength(25)
    },
  )

  it('shows a localized empty state for empty history or history without five-star events', async () => {
    const empty = mount('en', [])
    await empty.flush()
    expect(empty.cls('warp-statistics-row')).toHaveLength(0)
    expect(text(empty.cls('warp-statistics-empty')[0]!)).toBe(en.warp.history.noFiveStars)
    empty.app.unmount()
    transitions.length = 0
    const original = resultDisplayScenarios().find((s) => s.id === 'single-avatar-5')!.entries[0]!
    const noFive = mount('zh-CN', [{ ...original, event: { ...original.event, rarity: 3 } }])
    await noFive.flush()
    expect(noFive.cls('warp-statistics-row')).toHaveLength(0)
    expect(text(noFive.cls('warp-statistics-empty')[0]!)).toBe(zh.warp.history.noFiveStars)
  })

  it('serializes details and restores the statistics tab, scroll and thumbnail focus', async () => {
    const m = mount()
    await m.flush()
    m.cls('warp-history-viewport')[0]!.scrollTop = 240
    await m.click(m.find('warp-statistics-30')!)
    expect(m.detail.value).toBeUndefined()
    expect(m.listeners.size).toBe(1) // outgoing modal still owns the lock
    expect(m.overlay.openPanel('history')).toBe(false)
    await m.leave(0)
    expect(m.detail.value?.id).toBe(30)
    expect(m.listeners.size).toBe(1)
    expect(m.body.style.overflow).toBe('hidden')
    expect(m.all().filter((n) => n.props.role === 'dialog')).toHaveLength(1)
    await m.key({ key: 'Escape' })
    expect(m.overlay.panel.value).toBeUndefined()
    await m.leave(1)
    expect(m.overlay.panel.value).toBe('history')
    expect(m.cls('warp-history-viewport')[0]!.scrollTop).toBe(240)
    expect(m.doc.activeElement).toBe(m.find('warp-statistics-30'))
    expect(m.listeners.size).toBe(1)
  })

  it('keeps the selected record page when returning from details', async () => {
    const m = mount()
    await m.flush()
    await m.click(m.find('warp-history-view-tab-records')!)
    const buttons = descendants(m.cls('warp-history-pagination')[0]!).filter(
      (n) => n.type === 'button',
    )
    await m.click(buttons[1]!)
    expect(m.page.value).toBe(1)
    m.cls('warp-history-viewport')[0]!.scrollTop = 48
    await m.click(m.find('warp-history-5')!)
    await m.leave(0)
    await m.key({ key: 'Escape' })
    await m.leave(1)
    expect(m.page.value).toBe(1)
    expect(m.cls('warp-history-name')).toHaveLength(5)
    expect(m.cls('warp-history-viewport')[0]!.scrollTop).toBe(48)
    expect(m.doc.activeElement).toBe(m.find('warp-history-5'))
  })

  it('restores each tab scroll position without saving intermediate content-clamping events', async () => {
    const m = mount()
    await m.flush()
    m.cls('warp-history-viewport')[0]!.scrollTop = 240
    await m.click(m.find('warp-history-view-tab-records')!)
    m.cls('warp-history-viewport')[0]!.scrollTop = 48
    ;(m.find('warp-history-view-tab-statistics')!.props.onClick as () => void)()
    await nextTick()
    const viewport = m.cls('warp-history-viewport')[0]!
    viewport.scrollTop = 0
    ;(viewport.props.onScroll as () => void)()
    await m.flush()
    expect(viewport.scrollTop).toBe(240)
    await m.click(m.find('warp-history-view-tab-records')!)
    expect(viewport.scrollTop).toBe(48)
  })

  it.each(['escape', 'backdrop', 'close'] as const)(
    'closes through %s and releases the lock, then reopens safely',
    async (method) => {
      const m = mount()
      await m.flush()
      const controls = m.all().filter((n) => n.type === 'button')
      const first = controls[0]!,
        last = controls.at(-1)!
      m.doc.activeElement = last
      const preventDefault = vi.fn()
      await m.key({ key: 'Tab', preventDefault })
      expect(preventDefault).toHaveBeenCalledOnce()
      expect(m.doc.activeElement).toBe(first)
      await m.key({ key: 'Tab', shiftKey: true, preventDefault })
      expect(m.doc.activeElement).toBe(last)
      if (method === 'escape') await m.key({ key: 'Escape' })
      else if (method === 'close') await m.click(m.cls('h-close')[0]!)
      else {
        const backdrop = m.cls('h-modal-backdrop')[0]!
        ;(backdrop.props.onClick as (e: object) => void)({
          target: backdrop,
          currentTarget: backdrop,
        })
        await m.flush()
      }
      expect(m.overlay.panel.value).toBeUndefined()
      await m.leave(0)
      expect(m.listeners.size).toBe(0)
      expect(m.body.style.overflow).toBe('scroll')
      expect(m.trigger.focus).toHaveBeenCalled()
      expect(m.overlay.openPanel('history')).toBe(true)
      await nextTick()
      // Incoming refs must be wired before the two initial-focus ticks.
      await m.flush()
      expect(m.cls('warp-statistics-row')).toHaveLength(30)
      expect(m.listeners.size).toBe(1)
    },
  )

  it('cancels restoration and removes keyboard handlers on unmount', async () => {
    const m = mount()
    await m.flush()
    m.overlay.closePanel()
    m.app.unmount()
    await m.flush()
    expect(m.frames.size).toBe(0)
    expect(m.listeners.size).toBe(0)
    expect(m.body.style.overflow).toBe('scroll')
  })
})
