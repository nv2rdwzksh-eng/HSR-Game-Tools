import { ordinaryNode } from '../../fixtures/action-planner/ordinary-node'
import { describe, expect, it } from 'vitest'
import { computed, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import { validateMessages } from '../../../scripts/validate-i18n'
import { gameData } from '../../../src/tools/action-planner/data/adapters/game-data'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { usePlannerPresentation } from '../../../src/tools/action-planner/composables/usePlannerPresentation'
import { operationMetadata } from '../../../src/tools/action-planner/model/metadata'
import { actionDirections, nodeCamp } from '../../../src/tools/action-planner/model/naming'
import {
  formatAV,
  formatNumber,
  operationName,
  renderMessage,
} from '../../../src/tools/action-planner/model/presentation'
import { createInitialState, simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import type {
  EffectOperation,
  SimulationPlan,
} from '../../../src/tools/action-planner/engine/types'
import type { ToolLocale } from '../../../src/locales/types'

const makeI18n = () =>
  createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: false,
    messages: { 'zh-CN': zhCN, en },
  })
const target = { kind: 'participants' as const, participantIds: ['b'] }
const advance: EffectOperation = { id: 'pull', type: 'advance', target, percent: 50 }
const plan = (): SimulationPlan => ({
  cycleMode: 'none',
  aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
  actors: ['a', 'b'].map((id, position) => ({
    id,
    position,
    kind: 'actor',
    camp: 'ally',
    name: id,
    baseSpeed: 100,
    panelSpeed: 100,
  })),
  events: [{ anchor: { kind: 'start' }, operations: [advance] }],
  maxNodes: 4,
  maxAV: 600,
})

describe('site messages and semantic presentation', () => {
  it('validates the catalogs and rejects duplicate, empty, missing, malformed and mismatched messages', () => {
    const sources = { 'zh-CN': JSON.stringify(zhCN), en: JSON.stringify(en) }
    expect(validateMessages(sources)).toEqual([])
    const good = '{"message":"Hello {name}"}'
    for (const bad of [
      '{"message":""}',
      '{"other":"Hello"}',
      '{"message":"{other}"}',
      '{"message":"{"}',
      '{"message":5}',
      '{"message":{ "name":"Hello"}}',
      '{"message":"Hello", "message":"Hello {name}"}',
      '{"message":"Hello",}',
    ])
      expect(validateMessages({ 'zh-CN': good, en: bad }).length).toBeGreaterThan(0)
    // Literal braces are not interpolation parameters; use the compiler AST.
    expect(
      validateMessages({ 'zh-CN': '{"message":"{\'name\'}"}', en: '{"message":"Name"}' }),
    ).toEqual([])
  })

  it('interpolates representative messages and preserves custom names independently of locale', () => {
    const { global: composer } = makeI18n()
    const state = createInitialState(plan())
    for (const locale of ['zh-CN', 'en'] as ToolLocale[]) {
      composer.locale.value = locale
      const title = operationName(advance, locale, composer.t, (id) => id, state)
      expect(title).toContain('b')
      expect(title).toContain('50')
      expect(title).not.toMatch(/\{|planner\./)
      expect(operationName(advance, locale, composer.t, (id) => id, state, ' My own name ')).toBe(
        'My own name',
      )
      expect(operationName(advance, locale, composer.t, (id) => id, state, ' ')).toBe(title)
      expect(formatAV(1000 / 3, locale)).toBe(
        new Intl.NumberFormat(locale, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(1000 / 3),
      )
      expect(formatNumber(1000.125, locale, true)).toBe(
        new Intl.NumberFormat(locale, {
          maximumFractionDigits: 6,
          signDisplay: 'exceptZero',
        }).format(1000.125),
      )
    }
  })

  it('keeps product entry names consistent and includes the page and site in document titles', () => {
    const { global: composer } = makeI18n()
    for (const locale of ['zh-CN', 'en'] as ToolLocale[]) {
      composer.locale.value = locale
      expect(composer.t('home.tools.actionOrder.title')).toBe(composer.t('planner.title'))
      for (const key of ['home.title', 'planner.title']) {
        const page = composer.t(key)
        const site = composer.t('site.name')
        const title = composer.t('site.pageTitle', { page, site })
        expect(title).toContain(page)
        expect(title).toContain(site)
      }
    }
  })

  it('updates localized names, metadata and errors without changing the plan, draft or simulation', async () => {
    const { global: composer } = makeI18n()
    const character = gameData.characters.find((c) => c.names['zh-CN'] !== c.names.en)!
    const planner = useActionPlanner(plan(), { customNames: {}, characterIds: { b: character.id } })
    const presentation = usePlannerPresentation(planner.document, composer.locale, composer.t)
    const execution = planner.operationContext(advance)
    const automatic = computed(() => presentation.title(advance, planner.operationContext(advance)))
    const anchor = computed(() =>
      presentation.anchorLabel({ kind: 'action', participantId: 'b', turn: 1 }),
    )
    const metadata = computed(() =>
      renderMessage(
        operationMetadata(advance, presentation.label, planner.context.value).fields[0]!.message,
        composer.locale.value as ToolLocale,
        composer.t,
      ),
    )
    const error = computed(() => composer.t('ui.nonnegative'))
    planner.edit()
    planner.draft.value!.customName = '完全燃烧'
    const before = {
      plan: planner.plan.value,
      document: planner.document.value,
      result: planner.result.value,
      draft: planner.draft.value,
    }
    const zh = [automatic.value, anchor.value, metadata.value, error.value]
    expect(presentation.label('b')).toBe(character.names['zh-CN'])
    composer.locale.value = 'en'
    await nextTick()
    expect(presentation.label('b')).toBe(character.names.en)
    for (const [i, value] of [automatic.value, anchor.value, metadata.value, error.value].entries())
      expect(value).not.toBe(zh[i])
    expect(planner.plan.value).toBe(before.plan)
    expect(planner.document.value).toBe(before.document)
    expect(planner.result.value).toBe(before.result)
    expect(planner.operationContext(advance)).toBe(execution)
    expect(planner.draft.value).toBe(before.draft)
    expect(planner.draft.value!.customName).toBe('完全燃烧')
    expect(presentation.label('a')).toBe('a')
  })

  it('keeps structured configuration visible and resolves actual execution targets', () => {
    const state = createInitialState(plan())
    const name = (id: string) => id
    expect(operationMetadata(advance, name, state)).toMatchObject({
      targetIds: ['b'],
      fields: [
        { kind: 'effect', message: { key: 'planner.metadata.advance', params: { percent: 50 } } },
      ],
    })
    const immediate: EffectOperation = { id: 'now', type: 'immediatelyAct', target }
    expect(operationMetadata(immediate, name, state).fields).toEqual([
      { kind: 'effect', message: { key: 'planner.metadata.immediatelyAct', params: undefined } },
    ])
    const speed: EffectOperation = {
      id: 'speed',
      type: 'addSpeedModifier',
      target,
      mode: 'flat',
      amount: 60,
      duration: { kind: 'countdown', name: '完全燃烧', speed: 70 },
    }
    expect(operationMetadata(speed, name, state).fields.map((f) => f.message)).toEqual([
      { key: 'planner.metadata.flat', params: { amount: { value: 60, signed: true } } },
      { key: 'planner.metadata.countdown', params: { name: '完全燃烧' } },
      { key: 'planner.metadata.speed', params: { speed: 70 } },
    ])
    for (const turns of [null, 2])
      expect(
        operationMetadata({ ...speed, duration: { kind: 'turns', turns } }, name, state).fields[1]!
          .message,
      ).toMatchObject({
        key: turns === null ? 'planner.metadata.unlimitedDuration' : 'planner.metadata.duration',
      })
    const actor: EffectOperation = {
      id: 'actor',
      type: 'spawnParticipant',
      participant: {
        kind: 'actor',
        name: 'Custom',
        camp: 'enemy',
        category: 'enemy',
        baseSpeed: 90,
        panelSpeed: 120,
        actionLimit: 2,
      },
    }
    expect(operationMetadata(actor, name).fields.map((f) => f.kind)).toEqual([
      'identity',
      'camp',
      'category',
      'speed',
      'speed',
      'actions',
    ])
    expect(
      operationMetadata(
        {
          id: 'event',
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'Event', speed: 70 },
        },
        name,
      ).fields.map((f) => f.kind),
    ).toEqual(['identity', 'speed', 'duration'])
    const active = { ...state, activeParticipantId: 'a' }
    const group: EffectOperation = { ...advance, target: { kind: 'allies' } }
    expect(operationMetadata(group, name, active).targetIds).toEqual(['b'])
    expect(operationMetadata(group, name).targetIds).toBeUndefined()
  })

  it('shows all three legal effects including no-op values and uses neutral unknown camps', () => {
    const input = plan()
    input.events[0]!.operations = [
      { ...advance, percent: 0 },
      { ...advance, id: 'delay', type: 'delay', percent: 0 },
      { id: 'immediate', type: 'immediatelyAct', target },
    ]
    const result = simulatePlan(input)
    const record = result.records[0]!
    expect(ordinaryNode(record).id).toBe('b')
    expect(actionDirections(record.anchor, record.actionChanges)).toEqual({
      advance: true,
      delay: true,
      immediatelyAct: true,
    })
    expect(actionDirections({ kind: 'start' }, record.actionChanges)).toEqual({
      advance: false,
      delay: false,
      immediatelyAct: false,
    })
    expect(
      actionDirections(
        result.snapshots[0]!.queue[0]!.anchor,
        result.snapshots[0]!.queue[0]!.actionChanges,
      ),
    ).toEqual({ advance: true, delay: true, immediatelyAct: true })
    expect(nodeCamp({ kind: 'actor', camp: 'ally' })).toBe('ally')
    expect(nodeCamp({ camp: 'enemy' })).toBe('enemy')
    expect(nodeCamp({ kind: 'scheduledEvent', camp: 'ally' })).toBe('event')
    expect(nodeCamp({ camp: 'unrecognized' })).toBe('unknown')
  })
})
