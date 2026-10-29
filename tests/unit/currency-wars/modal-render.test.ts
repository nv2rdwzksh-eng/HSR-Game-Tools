import { defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import HModal from '../../../vendor/astral-ui/src/lib/components/HModal.vue'
import { descendants, node, renderer } from '../../fixtures/currency-wars/node-renderer'

const transition = vi.hoisted(
  (): {
    before: (element: object) => void
    leave: (element: object) => void
  } => ({ before: vi.fn(), leave: vi.fn() }),
)
// Exercise HModal's actual lifecycle with controlled transition completion and DOM doubles.
// This deliberately makes no claim about CSS timing, browser layout or native keyboard acceptance.
vi.mock('vue', async (importOriginal) => {
  const vue = await importOriginal<typeof import('vue')>()
  return {
    ...vue,
    Transition: vue.defineComponent({
      props: ['name', 'onBeforeLeave', 'onAfterLeave'],
      setup(props, { slots }) {
        transition.before = (element) => props.onBeforeLeave(element)
        transition.leave = (element) => props.onAfterLeave(element)
        return () => vue.h('transition-host', slots.default?.())
      },
    }),
  }
})

const dispose: (() => void)[] = []
afterEach(() => {
  dispose.splice(0).forEach((fn) => fn())
  vi.unstubAllGlobals()
})

function mount() {
  const trigger = { isConnected: true, focus: vi.fn() }
  const body = node('body')
  body.style.overflow = 'scroll'
  const rootStyle = {
    getPropertyValue: () => 'auto',
    getPropertyPriority: () => 'important',
    setProperty: vi.fn(),
  }
  const doc = {
    activeElement: trigger as unknown,
    body,
    documentElement: { clientWidth: 1000, style: rootStyle },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }
  vi.stubGlobal('document', doc)
  vi.stubGlobal('window', { innerWidth: 1024 })
  vi.stubGlobal('getComputedStyle', () => ({ scrollbarGutter: 'auto' }))
  const open = ref(true)
  const left = vi.fn()
  const root = node('root')
  const app = renderer.createApp(
    defineComponent(
      () => () =>
        h(
          HModal,
          {
            modelValue: open.value,
            'onUpdate:modelValue': (value: boolean) => {
              open.value = value
            },
            title: 'Role',
            closeLabel: 'Close role',
            class: 'h-theme currency-theme',
            onAfterLeave: left,
          },
          { default: () => h('p', 'Details'), footer: () => h('button', 'Close') },
        ),
    ),
  )
  app.mount(root)
  let stopped = false
  const stop = () => {
    if (!stopped) {
      stopped = true
      app.unmount()
    }
  }
  dispose.push(stop)
  const nodes = () => [...descendants(root), ...descendants(body)]
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
  const initial = wire()
  const beginLeave = () => {
    const element = {}
    transition.before(element)
    return () => transition.leave(element)
  }
  const key = (event: object) => doc.addEventListener.mock.calls[0]![1](event)
  return { open, body, doc, rootStyle, trigger, left, nodes, wire, initial, key, stop, beginLeave }
}

describe('Astral HModal lifecycle', () => {
  it('forwards the theme, localizes close, traps Tab and restores state only after leave', async () => {
    const m = mount()
    await nextTick()
    await nextTick()
    expect(m.body.style.overflow).toBe('hidden')
    expect(m.nodes().some((n) => String(n.props.class).includes('h-theme currency-theme'))).toBe(
      true,
    )
    expect(m.initial.buttons[0]!.props['aria-label']).toBe('Close role')
    expect(m.initial.focus[0]).toHaveBeenCalledOnce()
    const preventDefault = vi.fn()
    m.doc.activeElement = m.initial.buttons[1]
    m.key({ key: 'Tab', preventDefault })
    expect(preventDefault).toHaveBeenCalledOnce()
    expect(m.doc.activeElement).toBe(m.initial.buttons[0])
    m.key({ key: 'Tab', shiftKey: true, preventDefault })
    expect(m.doc.activeElement).toBe(m.initial.buttons[1])
    const finishLeave = m.beginLeave()
    m.key({ key: 'Escape' })
    await nextTick()
    expect(m.open.value).toBe(false)
    expect(m.body.style.overflow).toBe('hidden')
    finishLeave()
    expect(m.body.style.overflow).toBe('scroll')
    expect(m.rootStyle.setProperty).toHaveBeenLastCalledWith(
      'scrollbar-gutter',
      'auto',
      'important',
    )
    expect(m.trigger.focus).toHaveBeenCalledOnce()
    expect(m.left).toHaveBeenCalledOnce()
    expect(m.doc.removeEventListener).toHaveBeenCalledOnce()
    m.stop()
    expect(m.trigger.focus).toHaveBeenCalledOnce()
  })

  it('ignores an old leave after reopen and releases locks when unmounted during exit', async () => {
    const m = mount()
    await nextTick()
    await nextTick()
    const finishOldLeave = m.beginLeave()
    m.open.value = false
    await nextTick()
    m.open.value = true
    await nextTick()
    m.wire()
    finishOldLeave()
    await nextTick()
    expect(m.body.style.overflow).toBe('hidden')
    expect(m.doc.addEventListener).toHaveBeenCalledOnce()
    expect(m.left).not.toHaveBeenCalled()
    m.open.value = false
    await nextTick()
    m.beginLeave()
    finishOldLeave()
    expect(m.body.style.overflow).toBe('hidden')
    expect(m.left).not.toHaveBeenCalled()
    m.trigger.isConnected = false
    m.stop()
    expect(m.body.style.overflow).toBe('scroll')
    expect(m.doc.removeEventListener).toHaveBeenCalledOnce()
    expect(m.trigger.focus).not.toHaveBeenCalled()
  })

  it('does not focus a closing modal from an obsolete nextTick callback', async () => {
    const m = mount()
    m.open.value = false
    await nextTick()
    await nextTick()
    expect(m.initial.focus[0]).not.toHaveBeenCalled()
    m.stop()
    expect(m.body.style.overflow).toBe('scroll')
  })
})
