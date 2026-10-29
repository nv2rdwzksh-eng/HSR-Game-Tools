import { defineComponent, h, nextTick, shallowRef, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WarpItemDetails from '../../../src/tools/warp-simulator/components/WarpItemDetails.vue'
import { descendants, node, renderer } from '../../fixtures/currency-wars/node-renderer'
import {
  resultDisplayScenarios,
  resultDisplaySnapshot,
  resultDisplayVisuals,
} from '../../fixtures/warp-simulator/result-display'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import { warpVisualDefinitions } from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'

const transition = vi.hoisted(
  (): { before: (element: object) => void; leave: (element: object) => void } => ({
    before: () => {},
    leave: () => {},
  }),
)
vi.mock('vue', async (original) => {
  const vue = await original<typeof import('vue')>()
  return {
    ...vue,
    Transition: vue.defineComponent({
      props: ['onBeforeLeave', 'onAfterLeave'],
      setup(props, { slots }) {
        transition.before = (element) => props.onBeforeLeave(element)
        transition.leave = (element) => props.onAfterLeave(element)
        return () => vue.h('transition-host', slots.default?.())
      },
    }),
  }
})

const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})
const adapter = createPresentation(
  resultDisplaySnapshot,
  resultDisplayVisuals,
  '/',
  warpVisualDefinitions,
)
async function flush() {
  await nextTick()
  await nextTick()
  await nextTick()
}
function mount(scenario = 'single-avatar-5', locale = 'zh-CN') {
  const fixture = resultDisplayScenarios().find((s) => s.id === scenario)!.entries[0]!
  const entry = shallowRef<typeof fixture | undefined>({
    ...fixture,
    event: { ...fixture.event, pityBefore: { ...fixture.event.pityBefore, pullsSinceLast5: 78 } },
  })
  const item = shallowRef(adapter.item(fixture.event.itemId, locale as 'zh-CN' | 'en'))
  const body = node('body')
  body.style.overflow = 'scroll'
  const trigger = { isConnected: true, focus: vi.fn() }
  const doc = {
    activeElement: trigger as unknown,
    body,
    documentElement: {
      clientWidth: 1000,
      style: {
        getPropertyValue: () => 'auto',
        getPropertyPriority: () => '',
        setProperty: vi.fn(),
      },
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { innerWidth: 1024 })
  vi.stubGlobal('getComputedStyle', () => ({ scrollbarGutter: 'auto' }))
  const close = vi.fn()
  const left = vi.fn()
  const root = node('root')
  const app = renderer.createApp(
    defineComponent(
      () => () =>
        h(WarpItemDetails, {
          entry: entry.value,
          item: entry.value ? item.value : undefined,
          sourceLabel: entry.value ? 'Original banner' : '',
          zIndex: 4501,
          onClose: () => {
            close()
            entry.value = undefined
          },
          onAfterLeave: left,
        }),
    ),
  )
  const i18n = createI18n({ legacy: false, locale, messages: { 'zh-CN': zh, en } })
  app.use(i18n)
  app.mount(root)
  apps.push(app)
  const nodes = () => [...descendants(root), ...descendants(body)]
  const cls = (name: string) =>
    nodes().find((n) => String(n.props.class).split(' ').includes(name))!
  function wire() {
    const section = nodes().find((n) => n.props.role === 'dialog')!
    const buttons = descendants(section).filter((n) => n.type === 'button')
    const focus = buttons.map((button) =>
      vi.fn(() => {
        doc.activeElement = button
      }),
    )
    buttons.forEach((button, index) => Object.assign(button, { focus: focus[index] }))
    Object.assign(section, { querySelector: () => buttons[0], querySelectorAll: () => buttons })
    return { buttons, focus }
  }
  const { buttons, focus } = wire()
  const key = (event: object) => doc.addEventListener.mock.calls[0]![1](event)
  const beginLeave = () => {
    const element = {}
    transition.before(element)
    return () => transition.leave(element)
  }
  return {
    entry,
    item,
    body,
    doc,
    trigger,
    close,
    left,
    nodes,
    cls,
    buttons,
    focus,
    key,
    beginLeave,
    app,
    i18n,
    wire,
  }
}
const text = (n: ReturnType<typeof node>): string => n.text + n.children.map(text).join('')

describe('Shared Warp HModal with real content and controlled transitions', () => {
  it.each(['zh-CN', 'en'])(
    'renders avatars and cones with actual rarity and conditional metadata in %s',
    async (locale) => {
      for (const scenario of [
        'single-avatar-5',
        'single-avatar-4',
        'single-light-cone-5',
        'single-light-cone-3',
      ]) {
        const m = mount(scenario, locale)
        await flush()
        const item = m.item.value
        const entry = m.entry.value!
        expect(m.cls('h-modal-backdrop').props.class).toContain('h-theme')
        expect(m.cls('h-modal-backdrop').props.style).toEqual({ zIndex: 4501 })
        expect(m.nodes().find((n) => n.type === 'h2')!.text).toBe(item.name)
        const visual = m.cls('warp-detail-visual')
        expect(descendants(visual).find((n) => n.type === 'img')!.props.src).toBe(
          item.kind === 'avatar' ? item.portraitUrl : item.lightConePreview!.url,
        )
        expect(
          descendants(m.cls('warp-details-stars')).find((n) => n.type === 'img')!.props.src,
        ).toBe(item.cardStars!.url)
        expect(m.cls('warp-details-stars').props['aria-label']).toBe(
          m.i18n.global.t('warp.visual.rarity', { count: entry.event.rarity }),
        )
        expect(text(m.cls('warp-details-kind'))).toBe(m.i18n.global.t('warp.itemKind.' + item.kind))
        const emphasis = m
          .nodes()
          .filter((n) => String(n.props.class).includes('warp-details-emphasis'))
          .map(text)
        expect(emphasis).toEqual(
          item.kind === 'avatar'
            ? [`【${item.elementName}】`, `【${item.pathName}】`]
            : [`【${item.pathName}】`],
        )
        const values = m
          .nodes()
          .filter((n) => n.type === 'dd')
          .map(text)
        expect(values).toEqual([
          'Original banner',
          ...(entry.event.isUp === true ? [m.i18n.global.t('warp.details.eventUp')] : []),
          ...(entry.event.rarity === 5 ? ['79'] : []),
          '#' + entry.id,
        ])
        const footer = m.cls('h-modal__footer')
        expect(descendants(footer).filter((n) => n.type === 'button')).toHaveLength(1)
        expect(m.cls('h-button__icon--round')).toBeDefined()
        m.app.unmount()
      }
    },
  )
  it.each(['top', 'footer', 'mask', 'escape'])(
    'closes via %s and releases focus/scroll only after leave',
    async (method) => {
      const m = mount()
      await flush()
      expect(m.doc.activeElement).toBe(m.buttons[0])
      m.doc.activeElement = m.buttons[1]
      const preventDefault = vi.fn()
      m.key({ key: 'Tab', preventDefault })
      expect(m.doc.activeElement).toBe(m.buttons[0])
      m.key({ key: 'Tab', shiftKey: true, preventDefault })
      expect(m.doc.activeElement).toBe(m.buttons[1])
      expect(preventDefault).toHaveBeenCalledTimes(2)
      const finish = m.beginLeave()
      if (method === 'escape') m.key({ key: 'Escape' })
      else if (method === 'mask') {
        const mask = m.cls('h-modal-backdrop')
        ;(mask.props.onClick as (e: object) => void)({ target: mask, currentTarget: mask })
      } else (m.buttons[method === 'top' ? 0 : 1]!.props.onClick as () => void)()
      await flush()
      expect(m.entry.value).toBeUndefined()
      expect(m.close).toHaveBeenCalledOnce()
      expect(m.left).not.toHaveBeenCalled()
      expect(m.body.style.overflow).toBe('hidden')
      finish()
      expect(m.left).toHaveBeenCalledOnce()
      expect(m.body.style.overflow).toBe('scroll')
      expect(m.trigger.focus).toHaveBeenCalledOnce()
    },
  )
  it('ignores stale leave after reopen and releases state on forced unmount', async () => {
    const m = mount()
    await flush()
    const original = m.entry.value!
    const finishOld = m.beginLeave()
    m.key({ key: 'Escape' })
    await flush()
    m.entry.value = { ...original, id: 999 }
    await nextTick()
    m.wire()
    await flush()
    finishOld()
    expect(m.left).not.toHaveBeenCalled()
    expect(m.body.style.overflow).toBe('hidden')
    expect(
      m
        .nodes()
        .filter((n) => n.type === 'dd')
        .map(text),
    ).toContain('#999')
    m.trigger.isConnected = false
    m.app.unmount()
    expect(m.body.style.overflow).toBe('scroll')
    expect(m.doc.removeEventListener).toHaveBeenCalledOnce()
    expect(m.trigger.focus).not.toHaveBeenCalled()
  })
  it('uses unknown labels and falls back without loading character portraits', async () => {
    const m = mount()
    m.item.value = { ...m.item.value, portraitUrl: undefined, elementName: undefined, pathName: '' }
    await flush()
    expect(descendants(m.cls('warp-detail-visual')).some((n) => n.type === 'img')).toBe(false)
    expect(
      m
        .nodes()
        .filter((n) => String(n.props.class).includes('warp-details-emphasis'))
        .map(text),
    ).toEqual(Array(2).fill('【' + m.i18n.global.t('warp.visual.unknown') + '】'))
    m.app.unmount()
    const cone = mount('single-light-cone-3')
    await flush()
    function fail(url: string) {
      const image = descendants(cone.cls('warp-detail-visual')).find((n) => n.type === 'img')!
      ;(image.props.onError as (e: object) => void)({ target: { getAttribute: () => url } })
    }
    fail(cone.item.value.lightConePreview!.url)
    await flush()
    expect(
      descendants(cone.cls('warp-detail-visual')).find((n) => n.type === 'img')!.props.src,
    ).toBe(cone.item.value.artworkUrl)
    fail('stale-url')
    await flush()
    expect(descendants(cone.cls('warp-detail-visual')).some((n) => n.type === 'img')).toBe(true)
    fail(cone.item.value.artworkUrl!)
    await flush()
    expect(descendants(cone.cls('warp-detail-visual')).some((n) => n.type === 'img')).toBe(false)
  })
})
