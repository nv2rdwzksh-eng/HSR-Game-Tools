import { defineComponent, h, nextTick, ref, watch, type Component } from 'vue'
import { createI18n } from 'vue-i18n'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import CurrencyWarsPage from '../../../src/tools/currency-wars/CurrencyWarsPage.vue'
import CurrencyResults from '../../../src/tools/currency-wars/components/CurrencyResults.vue'
import CurrencyRoleCard from '../../../src/tools/currency-wars/components/CurrencyRoleCard.vue'
import { createVisuals } from '../../../src/tools/currency-wars/ui/visuals'
import CurrencyEmblemDemand from '../../../src/tools/currency-wars/components/CurrencyEmblemDemand.vue'
import { loadPageData } from '../../../src/tools/currency-wars/ui/data'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import type { OptimizationRequest } from '../../../src/tools/currency-wars/types'
import { bronyaForms, navigator, request as makeRequest, role, task, toy } from './helpers'
import type { SolvedAttempt } from '../../../src/tools/currency-wars/ui/session'
import type {
  ResultMessage,
  SolveMessage,
  WorkerPort,
} from '../../../src/tools/currency-wars/browser/protocol'
import {
  node,
  renderer,
  descendants,
  type HostNode,
} from '../../fixtures/currency-wars/node-renderer'
const workers = vi.hoisted(
  () => [] as (WorkerPort & { messages: SolveMessage[]; terminated: boolean })[],
)
vi.mock('../../../src/tools/currency-wars/browser/worker-factory', () => ({
  createBrowserWorker: () => {
    const worker = {
      messages: [] as SolveMessage[],
      terminated: false,
      postMessage(message: SolveMessage) {
        this.messages.push(message)
      },
      terminate() {
        this.terminated = true
      },
    }
    workers.push(
      worker as unknown as WorkerPort & { messages: SolveMessage[]; terminated: boolean },
    )
    return worker as unknown as WorkerPort
  },
}))
// Test content independently of CSS transitions/Teleport. Real HModal lifecycle has a separate test.
vi.mock('primevue/button', () => ({
  default: defineComponent({
    setup:
      (_, { attrs, slots }) =>
      () =>
        h('button', attrs, slots.default?.()),
  }),
}))
vi.mock('astral-ui/components', async (importOriginal) => ({
  ...(await importOriginal<typeof import('astral-ui/components')>()),
  HModal: defineComponent({
    props: ['modelValue', 'title', 'closeLabel'],
    emits: ['update:modelValue', 'after-leave'],
    setup(props, { slots, emit }) {
      watch(
        () => props.modelValue,
        async (value) => {
          if (!value) {
            await nextTick()
            if (!props.modelValue) emit('after-leave')
          }
        },
      )
      return () =>
        props.modelValue
          ? h('section', { role: 'dialog' }, [
              slots.illustration?.(),
              h('h2', props.title),
              h('button', {
                'aria-label': props.closeLabel,
                onClick: () => emit('update:modelValue', false),
              }),
              slots.default?.(),
              h('footer', slots.footer?.()),
            ])
          : null
    },
  }),
}))
const disposals: (() => void)[] = []
beforeEach(() => {
  workers.length = 0
  // Exercise the library's real reduced-motion path; this renderer does not measure animation.
  vi.stubGlobal('document', {
    activeElement: null,
    documentElement: { dataset: { hMotion: 'reduced' } },
  })
  vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
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
  disposals.splice(0).forEach((dispose) => dispose())
  vi.unstubAllGlobals()
})
function mount(component: Component, locale: 'zh-CN' | 'en') {
  const root = node('root')
  const app = renderer.createApp(component)
  app.use(
    createI18n({ legacy: false, locale, fallbackLocale: false, messages: { 'zh-CN': zh, en } }),
  )
  app.directive('tooltip', {})
  app.mount(root)
  disposals.push(() => app.unmount())
  return () => descendants(root)
}
const text = (entry: HostNode): string => entry.text + entry.children.map(text).join(' ')
const click = (entry: HostNode) => (entry.props.onClick as () => void)()
async function flush() {
  await nextTick()
  await nextTick()
}

describe('Currency Wars Astral UI', () => {
  it.each(['zh-CN', 'en'] as const)(
    'maps switches, preserves settings across tabs and cancels/restarts (%s)',
    async (locale) => {
      const nodes = mount(CurrencyWarsPage, locale)
      const switches = () => nodes().filter((entry) => entry.props.role === 'switch')
      expect(switches()).toHaveLength(25)
      expect(switches().every((entry) => entry.props['aria-checked'] === false)).toBe(true)
      expect(nodes().find((n) => n.props.type === 'submit')!.props.disabled).toBe(true)
      expect(nodes().some((n) => String(n.props.class).includes('lucide-play'))).toBe(true)
      expect(nodes().some((n) => text(n).includes('0 / 25'))).toBe(true)
      const messages = locale === 'en' ? en.currencyWars : zh.currencyWars
      click(nodes().find((n) => n.type === 'button' && text(n).includes(messages.form.selectAll))!)
      await flush()
      const taskScroll = nodes().find((n) =>
        String(n.props.class).includes('currency-task-scroll'),
      )!
      const count = nodes().find((n) => String(n.props.class).includes('currency-selection-count'))!
      const search = nodes().find((n) => n.props.id === 'currency-task-search')!
      expect(nodes().indexOf(count)).toBeLessThan(nodes().indexOf(search))
      expect(descendants(taskScroll)).not.toContain(search)
      const footer = nodes().find((n) => n.type === 'footer')!
      expect(descendants(footer).some((n) => n.props.type === 'submit')).toBe(true)
      const tasks = loadPageData().tasks
      click(switches()[0]!)
      const settingsTab = nodes().find(
        (entry) => entry.props.id === 'currency-config-tab-settings',
      )!
      click(settingsTab)
      await flush()
      const input = (id: string) => nodes().find((entry) => entry.props.id === id)!
      expect(nodes().find((n) => n.type === 'footer')).toBe(footer)
      const settingsScroll = nodes().find((n) =>
        String(n.props.class).includes('currency-settings-scroll'),
      )!
      expect(descendants(settingsScroll).some((n) => n.props.id === 'currency-slots')).toBe(true)
      expect(input('currency-slots').props).toMatchObject({ min: 1, max: 13, step: 1 })
      expect(input('currency-budget').props).toMatchObject({ min: 12, max: 39, step: 1 })
      const increment = locale === 'en' ? 'Increase Emblem budget' : '增加星徽预算'
      const budgetIncrease = nodes().find((entry) => entry.props['aria-label'] === increment)!
      expect(budgetIncrease).toBeDefined()
      click(budgetIncrease)
      await flush()
      click(nodes().find((entry) => entry.props.id === 'currency-config-tab-tasks')!)
      await flush()
      expect(switches()[0]!.props['aria-checked']).toBe(false)
      expect(
        switches()
          .slice(1)
          .every((entry) => entry.props['aria-checked'] === true),
      ).toBe(true)
      const form = nodes().find((entry) => entry.type === 'form')!
      const submit = () =>
        (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} })
      submit()
      await flush()
      expect(nodes().some((n) => String(n.props.class).includes('lucide-play'))).toBe(false)
      expect(workers[0]!.messages[0]!.request).toMatchObject({
        slots: 13,
        emblemBudget: 19,
        timeLimitSeconds: 60,
        includeExperts: false,
      })
      expect(workers[0]!.messages[0]!.request.tasks.map((task) => task.id)).toEqual(
        tasks.slice(1).map((task) => task.id),
      )
      click(
        nodes().find(
          (entry) =>
            entry.type === 'button' &&
            text(entry).includes(locale === 'en' ? 'Cancel' : zh.currencyWars.cancel),
        )!,
      )
      await flush()
      expect(workers[0]!.terminated).toBe(true)
      submit()
      await flush()
      expect(workers).toHaveLength(2)
      // Directly disabling every switch updates the real submit button.
      for (const entry of switches().filter((entry) => entry.props['aria-checked'])) click(entry)
      await flush()
      expect(
        nodes().find((entry) => entry.type === 'button' && entry.props.type === 'submit')!.props
          .disabled,
      ).toBe(true)
    },
  )

  it.each(['zh-CN', 'en'] as const)(
    'searches without changing selection and applies all/clear to all tasks (%s)',
    async (locale) => {
      const nodes = mount(CurrencyWarsPage, locale)
      const search = nodes().find((n) => n.props.id === 'currency-task-search')!
      const input = (value: string) => {
        search.listeners.input!.forEach((listener) =>
          listener({ target: Object.assign(search, { value }) }),
        )
      }
      const messages = locale === 'en' ? en.currencyWars : zh.currencyWars
      const button = (label: string) =>
        nodes().find((n) => n.type === 'button' && text(n).includes(label))!
      expect(search.parent!.children.some((n) => n.type === 'svg')).toBe(true)
      expect(String(button(messages.form.clear).props.class)).toContain('h-button--danger')
      for (const label of [messages.form.selectAll, messages.form.clear])
        expect(descendants(button(label)).some((n) => n.type === 'svg')).toBe(true)
      click(button(messages.form.selectAll))
      await flush()
      input('task-001')
      await flush()
      expect(nodes().filter((n) => n.props.role === 'switch')).toHaveLength(1)
      expect(workers).toHaveLength(0)
      click(button(messages.form.clear))
      await flush()
      expect(nodes().find((n) => n.props.type === 'submit')!.props.disabled).toBe(true)
      click(button(messages.form.selectAll))
      await flush()
      const form = nodes().find((n) => n.type === 'form')!
      ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} })
      expect(workers[0]!.messages[0]!.request.tasks).toHaveLength(25)
      input('no-matching-task')
      await flush()
      expect(nodes().filter((n) => n.props.role === 'switch')).toHaveLength(0)
      expect(nodes().some((n) => n.text.includes(messages.form.noMatches))).toBe(true)
    },
  )

  it.each(['zh-CN', 'en'] as const)(
    'uses one native radio group with min-roles default (%s)',
    async (locale) => {
      const nodes = mount(CurrencyWarsPage, locale)
      click(nodes().find((n) => n.props.role === 'switch')!)
      await flush()
      click(nodes().find((n) => n.props.id === 'currency-config-tab-settings')!)
      await flush()
      const controls = nodes().filter((n) => n.type === 'input')
      expect(controls.map((n) => n.props.id ?? n.props.type)).toEqual([
        'currency-slots',
        'currency-budget',
        'checkbox',
        'radio',
        'radio',
      ])
      const radios = nodes().filter((n) => n.props.type === 'radio')
      expect(radios.map((n) => n.props.name)).toEqual(['currency-objective', 'currency-objective'])
      expect((radios[0] as unknown as { checked: boolean }).checked).toBe(true)
      radios[1]!.listeners.change!.forEach((listener) => listener({ target: radios[1] }))
      await flush()
      const form = nodes().find((n) => n.type === 'form')!
      ;(form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} })
      expect(workers[0]!.messages[0]!.request.objective).toBe('min-emblems')
    },
  )

  it('switches three content tabs without solving and resets only for a new result', async () => {
    const data = loadPageData()
    const selected = data.snapshot.roles.find((role) => !role.expert && !role.mechanic)!
    const request: OptimizationRequest = {
      objective: 'min-roles',
      slots: 13,
      emblemBudget: 18,
      timeLimitSeconds: 60,
      includeExperts: false,
      tasks: data.tasks,
    }
    const lineup = { members: [{ formId: selected.id, emblemIds: [] }] }
    const attempt = ref<SolvedAttempt>({
      requestId: 1,
      request,
      result: {
        request,
        status: 'feasible',
        solverStatus: 'timeLimit',
        elapsedSeconds: 1,
        lineup,
        evaluation: evaluateLineup(data.snapshot, request, lineup),
      },
    })
    const nodes = mount(
      defineComponent(
        () => () =>
          h(CurrencyResults, {
            snapshot: data.snapshot,
            catalog: data.visuals,
            crafts: data.crafts,
            attempt: attempt.value,
            stale: false,
            historical: false,
          }),
      ),
      'en',
    )
    const tab = (value: string) =>
      nodes().find((n) => n.props.id === 'currency-results-tab-' + value)!
    expect(nodes().filter((n) => n.props.role === 'tab')).toHaveLength(3)
    const portrait = nodes().find((n) => n.props['aria-haspopup'] === 'dialog')!
    click(portrait)
    await flush()
    expect(nodes().some((n) => n.props.role === 'dialog')).toBe(true)
    const scroll = () =>
      nodes().find((n) => String(n.props.class).includes('currency-result-scroll'))!
    const lineupScroll = scroll()
    expect(lineupScroll.props).toMatchObject({
      role: 'region',
      'aria-label': en.currencyWars.result.lineup,
    })
    expect(nodes().filter((n) => n.type === 'h2')).toHaveLength(1) // Open role detail only.
    click(tab('traits'))
    await flush()
    expect(nodes().some((n) => n.props.role === 'dialog')).toBe(false)
    expect(scroll()).not.toBe(lineupScroll)
    expect(scroll().props['aria-label']).toBe(en.currencyWars.result.traits)
    expect(scroll().props.style).toMatchObject({
      '--h-fade-size': '24px',
      '--h-fade-left': '0px',
      '--h-fade-right': '0px',
      overflow: 'auto',
    })
    expect(nodes().filter((n) => n.type === 'h2')).toHaveLength(0)
    expect(nodes().filter((n) => n.type === 'details' || n.type === 'summary')).toHaveLength(0)
    expect(nodes().some((n) => String(n.props.class).includes('currency-contributors'))).toBe(true)
    click(tab('emblems'))
    await flush()
    expect(scroll().props['aria-label']).toBe(en.currencyWars.crafting.title)
    expect(nodes().filter((n) => n.type === 'h2')).toHaveLength(0)
    expect(nodes().some((n) => n.text === en.currencyWars.crafting.empty)).toBe(true)
    expect(workers).toHaveLength(0)
    attempt.value = { ...attempt.value, requestId: 2 }
    await flush()
    expect(tab('lineup').props['aria-selected']).toBe(true)
    expect(nodes().some((n) => n.props['aria-haspopup'] === 'dialog')).toBe(true)
  })

  it.each(['zh-CN', 'en'] as const)(
    'renders merged traits, badges, counts and every target threshold (%s)',
    async (locale) => {
      const snapshot = toy([role(1, [1005, 1007, 1009]), role(2, [1005]), role(3, [1005])])
      const request = makeRequest(
        [task(1005, 2), task(1005, 4), task(1007, 7), task(1007, 1), task(2008, 2)],
        {
          slots: 3,
        },
      )
      const lineup = { members: snapshot.roles.map((r) => ({ formId: r.id, emblemIds: [] })) }
      const attempt: SolvedAttempt = {
        requestId: 1,
        request,
        result: {
          request,
          status: 'feasible',
          elapsedSeconds: 1,
          lineup,
          evaluation: evaluateLineup(snapshot, request, lineup),
        },
      }
      const catalog = {
        schemaVersion: 1 as const,
        costs: Object.fromEntries(snapshot.roles.map((r) => [r.id, 1 as const])),
        portraits: {},
        emblems: {},
      }
      const nodes = mount(
        defineComponent(
          () => () =>
            h(CurrencyResults, {
              snapshot,
              catalog,
              crafts: { schemaVersion: 1, seasonId: 1, materials: [], recipes: {} },
              attempt,
              stale: false,
              historical: false,
            }),
        ),
        locale,
      )
      click(nodes().find((n) => n.props.id === 'currency-results-tab-traits')!)
      await flush()
      const rows = nodes().filter(
        (n) => n.type === 'li' && String(n.parent?.props.class).includes('currency-trait-list'),
      )
      const messages = locale === 'en' ? en.currencyWars : zh.currencyWars
      expect(rows).toHaveLength(4)
      expect(text(rows[0]!)).toContain('仙舟')
      expect(text(rows[0]!)).toContain('1 / 7')
      expect(text(rows[1]!)).toContain('0 / 2')
      expect(text(rows[0]!)).not.toContain(messages.result.incomplete)
      expect(text(rows[0]!)).toContain('1 / 1')
      expect(text(rows[0]!)).toContain(messages.result.completed)
      expect(text(rows[1]!)).not.toContain(messages.result.incomplete)
      expect(text(rows[2]!)).toContain('3 / 2')
      expect(text(rows[2]!)).toContain('3 / 4')
      expect(text(rows[2]!)).toContain(messages.result.completed)
      expect(text(rows[2]!)).toContain(messages.result.incomplete)
      const badges = (row: HostNode) =>
        descendants(row).filter((n) => String(n.props.class).includes('h-badge'))
      expect(badges(rows[0]!).map((n) => [text(n).trim(), n.props.class])).toEqual([
        [messages.result.targetTask, expect.stringContaining('success')],
        [messages.result.inactiveTrait, expect.stringContaining('muted')],
      ])
      expect(badges(rows[2]!)).toHaveLength(1)
      expect(badges(rows[3]!)).toHaveLength(0)
      expect(
        descendants(rows[3]!)
          .filter((n) => String(n.props.class).includes('currency-task-count'))
          .map(text),
      ).toEqual(['1'])
      expect(nodes().filter((n) => n.type === 'details' || n.type === 'summary')).toHaveLength(0)
      expect(
        descendants(rows[2]!).find((n) =>
          String(n.props.class).includes('currency-trait-statuses'),
        ),
      ).toBeDefined()
      expect(descendants(rows[0]!).some((n) => n.props.title === '角色1')).toBe(true)
    },
  )

  it('keeps only the completion badge in the panel header across tabs, edits, failure and cancellation', async () => {
    const data = loadPageData()
    const nodes = mount(CurrencyWarsPage, 'en')
    const badge = () =>
      nodes().find((n) => String(n.props.class).includes('currency-completion-summary'))
    const button = (label: string) =>
      nodes().find((n) => n.type === 'button' && text(n).includes(label))!
    const submit = () =>
      (nodes().find((n) => n.type === 'form')!.props.onSubmit as (event: unknown) => void)({
        preventDefault() {},
      })
    expect(badge()).toBeUndefined()
    click(nodes().find((n) => n.props.role === 'switch')!)
    await flush()
    submit()
    const sent = workers[0]!.messages[0]!
    const lineup = { members: [] }
    workers[0]!.onmessage!({
      data: {
        requestId: sent.requestId,
        result: {
          request: sent.request,
          status: 'feasible',
          solverStatus: 'timeLimit',
          elapsedSeconds: 1,
          lineup,
          evaluation: evaluateLineup(data.snapshot, sent.request, lineup),
        },
      },
    } as unknown as MessageEvent<ResultMessage>)
    await flush()
    const expected = 'Tasks completed 0 / 1'
    expect(text(badge()!)).toContain(expected)
    expect(badge()!.parent!.type).toBe('header')
    expect(text(badge()!.parent!)).toContain(en.currencyWars.result.title)
    for (const value of ['traits', 'emblems', 'lineup']) {
      click(nodes().find((n) => n.props.id === 'currency-results-tab-' + value)!)
      await flush()
      expect(text(badge()!)).toContain(expected)
    }
    expect(nodes().some((n) => text(n).includes('Emblems used'))).toBe(false)
    click(button(en.currencyWars.form.selectAll))
    await flush()
    expect(text(badge()!)).toContain(expected)
    expect(nodes().some((n) => n.text.includes('Configuration changed'))).toBe(true)
    submit()
    const retry = workers[1]!.messages[0]!
    workers[1]!.onmessage!({
      data: {
        requestId: retry.requestId,
        result: { request: retry.request, status: 'error', elapsedSeconds: 1 },
      },
    } as unknown as MessageEvent<ResultMessage>)
    await flush()
    expect(text(badge()!)).toContain(expected)
    submit()
    await flush()
    click(button(en.currencyWars.cancel))
    await flush()
    expect(text(badge()!)).toContain(expected)
  })

  it('shows all thirteen contributors and uses the actual form cost even with shared portraits', async () => {
    const forms = [
      role(1, [1007], { avatarId: 100, identityId: 1 }),
      role(101, [1007], { avatarId: 100, identityId: 1 }),
    ]
    const others = Array.from({ length: 12 }, (_, index) => role(index + 2, [1007]))
    const snapshot = toy([...forms, ...others])
    const request = makeRequest([task(1007, 7)], { slots: 13 })
    const catalog = {
      schemaVersion: 1 as const,
      costs: {
        ...Object.fromEntries(
          others.map((r, index) => [r.id, ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5]),
        ),
        '1': 1 as const,
        '101': 5 as const,
      },
      portraits: { '100': 'game-assets/character/100.webp' },
      emblems: {},
    }
    const makeAttempt = (formId: string, requestId: number): SolvedAttempt => {
      const lineup = {
        members: [formId, ...others.map((r) => r.id)].map((id) => ({ formId: id, emblemIds: [] })),
      }
      const evaluation = evaluateLineup(snapshot, request, lineup)
      expect(evaluation.valid).toBe(true)
      return {
        requestId,
        request,
        result: { request, status: 'feasible', elapsedSeconds: 1, lineup, evaluation },
      }
    }
    const attempt = ref(makeAttempt('1', 1))
    const nodes = mount(
      defineComponent(
        () => () =>
          h(CurrencyResults, {
            snapshot,
            catalog,
            crafts: { schemaVersion: 1, seasonId: 1, materials: [], recipes: {} },
            attempt: attempt.value,
            stale: false,
            historical: false,
          }),
      ),
      'en',
    )
    for (const [formId, cost] of [
      ['1', 1],
      ['101', 5],
    ] as const) {
      if (formId === '101') {
        attempt.value = makeAttempt(formId, 2)
        await flush()
      }
      click(nodes().find((n) => n.props.id === 'currency-results-tab-traits')!)
      await flush()
      const images = nodes().filter((n) =>
        String(n.props.class).includes('currency-contributor-image'),
      )
      expect(images).toHaveLength(13)
      expect(images[0]!.props.style).toEqual({ background: 'var(--p-currency-cost-' + cost + ')' })
      expect(descendants(images[0]!).find((n) => n.type === 'img')!.props.src).toBe(
        '/game-assets/character/100.webp',
      )
      expect(
        new Set(images.map((n) => (n.props.style as { background: string }).background)),
      ).toEqual(new Set([1, 2, 3, 4, 5].map((cost) => 'var(--p-currency-cost-' + cost + ')')))
      expect(nodes().filter((n) => n.type === 'details' || n.type === 'summary')).toHaveLength(0)
    }
  })

  it.each(['zh-CN', 'en'] as const)(
    'shows special metadata in cards and keeps full details and tie warnings (%s)',
    async (locale) => {
      const snapshot = toy([
        navigator,
        ...bronyaForms,
        role(8007, [1001, 2004], { identityId: 8007, position: 'front' }),
        role(8009, [1001, 2012], { identityId: 8007, position: 'back' }),
        role(1, [1001, 2007]),
        role(2, [1005]),
        role(3, [2006]),
      ])
      const catalog = {
        schemaVersion: 1 as const,
        costs: Object.fromEntries(snapshot.roles.map((r) => [r.id, 3 as const])),
        portraits: {},
        emblems: {},
      }
      const view = createVisuals(snapshot, catalog)
      const input = makeRequest([task(3001, 1)], { slots: 4 })
      const messages = locale === 'en' ? en.currencyWars : zh.currencyWars
      for (const [formId, expected, target] of [
        ['8007', messages.visual.front],
        ['8009', messages.visual.back],
        ['1510', messages.visual.cardTarget.replace('{name}', '角色1'), '1'],
        ['1510', messages.visual.cardNoTarget],
        ['11011', '贝洛伯格'],
        ['11012', '流派2006'],
        ['11011:tie', messages.visual.cardUnassigned],
      ]) {
        const companion =
          target ?? (formId === '11011' ? '2' : formId === '11012' ? '3' : undefined)
        const lineup = {
          members: [
            { formId: formId!, emblemIds: [], ...(target ? { navigatorTarget: target } : {}) },
            ...(companion ? [{ formId: companion, emblemIds: [] }] : []),
          ],
        }
        const evaluation = evaluateLineup(snapshot, input, lineup)
        expect(evaluation.valid, evaluation.errors.join('; ')).toBe(true)
        const member = view.member(
          lineup.members[0]!,
          evaluation.members.find((m) => m.formId === formId)!,
        )
        const nodes = mount(
          defineComponent(() => () => h(CurrencyRoleCard, { member })),
          locale,
        )
        const secondary = nodes().filter((n) => n.type === 'p')
        expect(secondary.map(text)).toEqual([expected])
        expect(nodes().find((n) => n.props['aria-haspopup'] === 'dialog')).toBeDefined()
      }
      const lineup = { members: [{ formId: '11011:tie', emblemIds: [] }] }
      const evaluation = evaluateLineup(snapshot, input, lineup)
      expect(evaluation.valid).toBe(true)
      const attempt: SolvedAttempt = {
        requestId: 1,
        request: input,
        result: { request: input, status: 'feasible', elapsedSeconds: 1, lineup, evaluation },
      }
      const nodes = mount(
        defineComponent(
          () => () =>
            h(CurrencyResults, {
              snapshot,
              catalog,
              crafts: { schemaVersion: 1, seasonId: 1, materials: [], recipes: {} },
              attempt,
              stale: false,
              historical: false,
            }),
        ),
        locale,
      )
      expect(nodes().some((n) => n.text === messages.result.bronyaWarning)).toBe(true)
      expect(
        nodes().filter((n) => n.type === 'details' || n.type === 'summary' || n.type === 'h2'),
      ).toHaveLength(0)
      click(nodes().find((n) => n.props['aria-haspopup'] === 'dialog')!)
      await flush()
      expect(nodes().some((n) => n.props.role === 'dialog')).toBe(true)
      expect(nodes().some((n) => n.text === messages.visual.cardUnassigned)).toBe(true)
    },
  )

  it.each(['zh-CN', 'en'] as const)(
    'shows authoritative role details and clears replaced selections (%s)',
    async (locale) => {
      const data = loadPageData()
      const messages = locale === 'en' ? en : zh
      const request = makeRequest([], { slots: 13, emblemBudget: 18 })
      const makeAttempt = (formId: string, requestId: number, target?: string): SolvedAttempt => {
        const lineup = {
          members: [
            { formId, emblemIds: [], ...(target ? { navigatorTarget: target } : {}) },
            ...(target ? [{ formId: target, emblemIds: [35051001, 35052010, 35052012] }] : []),
          ],
        }
        const evaluation = evaluateLineup(data.snapshot, request, lineup)
        expect(evaluation.valid, evaluation.errors.join('; ')).toBe(true)
        return {
          requestId,
          request,
          result: { request, status: 'optimal', elapsedSeconds: 0, lineup, evaluation },
        }
      }
      const attempt = ref(makeAttempt('1510', 1, '1218'))
      const nodes = mount(
        defineComponent(
          () => () =>
            h(CurrencyResults, {
              ...data,
              catalog: data.visuals,
              attempt: attempt.value,
              stale: false,
              historical: false,
            }),
        ),
        locale,
      )
      const inspect = async (id: string) => {
        const name = data.snapshot.roles.find((r) => r.id === id)!.name
        click(
          nodes().find(
            (n) =>
              n.props['aria-label'] ===
              messages.currencyWars.visual.openDetails.replace('{name}', name),
          )!,
        )
        await flush()
        return nodes().find((n) => n.props.role === 'dialog')!
      }
      let dialog = await inspect('1510')
      const expectedTraits = attempt.value.result.evaluation!.members.find(
        (m) => m.formId === '1510',
      )!.finalTraits
      const traits = descendants(dialog).find((n) => n.props.class === 'currency-detail-traits')!
      expect(
        descendants(traits)
          .filter((n) => String(n.props.class).split(' ').includes('currency-trait-name'))
          .map(text),
      ).toEqual(
        [...new Set(expectedTraits)]
          .sort((a, b) => a - b)
          .map((id) => data.snapshot.traits.find((t) => t.id === id)!.name),
      )
      expect(descendants(dialog).filter((n) => n.type === 'h3')).toHaveLength(0)
      const target = descendants(dialog).find(
        (n) => n.props.class === 'currency-detail-target-image',
      )!
      expect(target.props.style).toEqual({
        background: `var(--p-currency-cost-${data.visuals.costs['1218']})`,
      })
      expect(
        descendants(target).some(
          (n) => n.type === 'img' && n.props.src === '/game-assets/character/1218.webp',
        ),
      ).toBe(true)
      expect(descendants(dialog).some((n) => n.props.class === 'currency-emblem-empty')).toBe(false)
      const footer = descendants(dialog).find((n) => n.type === 'footer')!
      expect(descendants(footer).filter((n) => n.type === 'button')).toHaveLength(1)
      expect(text(footer)).toContain(messages.ui.close)

      // A new solve closes old details even when it arrives while the modal is open.
      attempt.value = makeAttempt('1218', 2)
      await flush()
      expect(nodes().some((n) => n.props.role === 'dialog')).toBe(false)
      // Show actual worn emblems, without three empty slots or repeated trait descriptions.
      attempt.value = makeAttempt('1510', 3, '1218')
      await flush()
      dialog = await inspect('1218')
      const worn = descendants(dialog).find((n) => n.props.class === 'currency-detail-emblems')!
      expect(
        descendants(worn)
          .filter((n) => n.type === 'img')
          .map((n) => n.props.alt),
      ).toEqual(
        [35051001, 35052010, 35052012].map(
          (id) => data.snapshot.emblems.find((e) => e.id === id)!.name,
        ),
      )
      for (const [id, index] of ['8007', '8009', '1013', '15061', '15062', '15063', '1510'].map(
        (id, index) => [id, index] as const,
      )) {
        attempt.value = makeAttempt(id, index + 4)
        await flush()
        dialog = await inspect(id)
        expect(
          descendants(dialog).find((n) => n.props.class === 'currency-detail-portrait')!.props
            .style,
        ).toEqual({ background: `var(--p-currency-cost-${data.visuals.costs[id]})` })
        const position = data.visuals.positions[id as keyof typeof data.visuals.positions]
        expect(
          text(descendants(dialog).find((n) => n.props.class === 'currency-detail-position')!),
        ).toBe(messages.currencyWars.visual[position])
        expect(
          descendants(dialog).filter((n) => n.props.class === 'currency-detail-emblems'),
        ).toHaveLength(0)
        if (id === '1510') expect(text(dialog)).toContain(messages.currencyWars.visual.cardNoTarget)
        click(
          descendants(dialog).find(
            (n) => n.type === 'button' && text(n).includes(messages.ui.close),
          )!,
        )
        await flush()
        expect(nodes().some((n) => n.props.role === 'dialog')).toBe(false)
      }
    },
  )

  it('keeps alternative crafting recipes separate and invents no recipe for an uncraftable emblem', () => {
    const material = { id: 1, name: 'Material', icon: undefined }
    const nodes = mount(
      defineComponent(
        () => () =>
          h(CurrencyEmblemDemand, {
            demands: [
              {
                emblemId: 1,
                name: 'Craftable',
                count: 2,
                icon: undefined,
                recipes: [
                  { craftIds: [1], materials: [material, material] },
                  { craftIds: [2], materials: [material, material] },
                ],
              },
              { emblemId: 2, name: 'Uncraftable', count: 1, icon: undefined, recipes: [] },
            ],
          }),
      ),
      'en',
    )
    const rows = nodes().filter((entry) => entry.type === 'li')
    expect(text(rows[0]!)).toContain('or')
    expect(text(rows[1]!)).not.toContain('Material')
    expect(text(rows[1]!)).toContain('—')
  })
})
