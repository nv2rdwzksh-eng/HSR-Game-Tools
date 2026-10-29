import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, type App } from 'vue'
import { createI18n } from 'vue-i18n'
import { renderer, node, descendants } from '../../fixtures/warp-simulator/node-renderer'
import PortraitCalibration from '../../manual/warp-results/PortraitCalibration.vue'
import {
  assertPortraitFocusConfig,
  resolvePortraitFocus,
} from '../../../src/tools/warp-simulator/model/portrait-focus'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import reviewZh from '../../manual/warp-results/zh-CN.json'
import reviewEn from '../../manual/warp-results/en.json'

// Exercise calibration UI with synthetic values, independently of maintained human anchors.
vi.mock('../../../src/tools/warp-simulator/model/portrait-focus', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../src/tools/warp-simulator/model/portrait-focus')>()
  return {
    ...actual,
    portraitFocusConfig: {
      default: { x: 0.4, y: 0.2, scale: 1.5 },
      overrides: {
        'avatar:1415': { x: 0.3, y: 0.4, scale: 2.5 },
        'avatar:1001': { x: 0.6, y: 0.2, scale: 2 },
      },
      overviewOverrides: { 'avatar:1415': { scale: 3 } },
    },
  }
})

vi.mock('primevue/button', () => ({
  default: defineComponent({
    setup(_, { attrs }) {
      return () => h('button', attrs)
    },
  }),
}))
vi.mock('primevue/select', () => ({
  default: defineComponent({
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h('select', {
          ...attrs,
          value: props.modelValue,
          onChange: (value: string) => emit('update:modelValue', value),
        })
    },
  }),
}))
vi.mock('primevue/inputnumber', () => ({
  default: defineComponent({
    props: ['modelValue', 'inputId'],
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () =>
        h('input', {
          ...attrs,
          id: props.inputId,
          value: props.modelValue,
          onChange: (value: number) => emit('update:modelValue', value),
        })
    },
  }),
}))
vi.mock('primevue/inputtext', () => ({
  default: defineComponent({
    setup(_, { attrs }) {
      return () => h('input', attrs)
    },
  }),
}))
vi.mock('primevue/checkbox', () => ({
  default: defineComponent({
    setup(_, { attrs }) {
      return () => h('input', attrs)
    },
  }),
}))
vi.mock('../../../src/tools/warp-simulator/components/WarpResultCard.vue', () => ({
  default: defineComponent({
    props: ['focus'],
    setup(props) {
      return () => h('div', { 'data-focus': props.focus })
    },
  }),
}))
const apps: App[] = []
afterEach(() => {
  apps.splice(0).forEach((app) => app.unmount())
  vi.unstubAllGlobals()
})

describe('Mounted development portrait calibrator', () => {
  it('updates the production preview through click, drag, numeric edits, reset/restore and downloads the complete draft', async () => {
    const root = node('root')
    const app = renderer.createApp(PortraitCalibration)
    app.use(
      createI18n({
        legacy: false,
        locale: 'zh-CN',
        messages: { 'zh-CN': { ...zh, review: reviewZh }, en: { ...en, review: reviewEn } },
      }),
    )
    app.mount(root)
    apps.push(app)
    const find = (className: string) =>
      descendants(root).find((n) => String(n.props.class).split(' ').includes(className))!
    const preview = () => descendants(root).find((n) => n.props['data-focus'])!
    expect(
      descendants(root).find(
        (n) => n.type === 'select' && n.props['aria-label'] === reviewZh.calibration.profile,
      )?.props.value,
    ).toBe('overview')
    const original = structuredClone(preview().props['data-focus'])
    const source = find('calibration-source'),
      canvas = find('calibration-image-canvas')
    Object.assign(canvas, {
      getBoundingClientRect: () => ({ left: 20, top: 30, width: 600, height: 300 }),
    })
    const capture = vi.fn(),
      release = vi.fn()
    Object.assign(source, {
      setPointerCapture: capture,
      hasPointerCapture: () => true,
      releasePointerCapture: release,
    })
    const down = source.props.onPointerdown as (event: unknown) => void
    down({ button: 0, pointerId: 3, clientX: 20, clientY: 180, preventDefault: vi.fn() })
    expect(capture).not.toHaveBeenCalled()
    down({ button: 0, pointerId: 3, clientX: 320, clientY: 180, preventDefault: vi.fn() })
    await nextTick()
    expect(capture).toHaveBeenCalledWith(3)
    expect(preview().props['data-focus']).toMatchObject({ x: 0.5, y: 0.5 })
    ;(source.props.onPointermove as (event: unknown) => void)({
      pointerId: 3,
      clientX: 1000,
      clientY: 800,
    })
    ;(source.props.onPointerup as (event: unknown) => void)({ pointerId: 3 })
    await nextTick()
    expect(release).toHaveBeenCalledWith(3)
    expect(preview().props['data-focus']).toMatchObject({ x: 1, y: 1 })
    const scale = descendants(root).find((n) => n.props.id === 'focus-scale')!
    ;(scale.props.onChange as (value: number) => void)(3.2)
    await nextTick()
    expect(preview().props['data-focus']).toMatchObject({ scale: 3.2 })
    const selected = descendants(root).find(
      (n) => n.type === 'select' && n.props['aria-label'] === reviewZh.calibration.character,
    )!
    ;(selected.props.onChange as (value: string) => void)('avatar:1001')
    await nextTick()
    ;(selected.props.onChange as (value: string) => void)('avatar:1415')
    await nextTick()
    expect(preview().props['data-focus']).toMatchObject({ x: 1, y: 1, scale: 3.2 })
    let blob: Blob | undefined
    const click = vi.fn(),
      link: Record<string, unknown> = { click }
    vi.stubGlobal('document', { createElement: () => link })
    vi.stubGlobal('URL', {
      createObjectURL: (value: Blob) => {
        blob = value
        return 'blob:calibration'
      },
      revokeObjectURL: vi.fn(),
    })
    const button = (label: string) =>
      descendants(root).find((n) => n.type === 'button' && n.props.label === label)!
    ;(button(reviewZh.calibration.export).props.onClick as () => void)()
    expect(click).toHaveBeenCalledOnce()
    expect(link.download).toBe('portrait-focus.json')
    const config: unknown = JSON.parse(await blob!.text())
    assertPortraitFocusConfig(config)
    expect(Object.keys(config.overrides).length).toBeGreaterThan(1)
    expect(resolvePortraitFocus(config, 'avatar:1415', true)).toEqual({ x: 1, y: 1, scale: 3.2 })
    ;(button(reviewZh.calibration.reset).props.onClick as () => void)()
    await nextTick()
    expect(preview().props['data-focus']).toEqual(config.default)
    ;(button(reviewZh.calibration.restore).props.onClick as () => void)()
    await nextTick()
    expect(preview().props['data-focus']).toEqual(original)
  })
})
