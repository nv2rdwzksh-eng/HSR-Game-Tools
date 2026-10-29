import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import { countdownParticipantId } from '../../../src/tools/action-planner/engine/queue'
import type {
  EffectOperation,
  SimulationPlan,
  SpeedModifierInstance,
} from '../../../src/tools/action-planner/engine/types'
import {
  buildCurrentQueueView,
  currentQueueCards,
} from '../../../src/tools/action-planner/model/current-queue'
import { contextAt } from '../../../src/tools/action-planner/model/editor'
import { actionDirections } from '../../../src/tools/action-planner/model/naming'
import { formatNumber } from '../../../src/tools/action-planner/model/presentation'
import {
  actionSpeedModifierTags,
  countdownSources,
  navigatorSpeedModifierTags,
  renderSpeedModifierTag,
  speedModifierMessages,
  speedModifierTags,
} from '../../../src/tools/action-planner/model/speed-modifier-tags'

const start = { kind: 'start' as const }
const action = (id = 'a', turn = 1) => ({ kind: 'action' as const, participantId: id, turn })
const target = (id = 'a') => ({ kind: 'participants' as const, participantIds: [id] })
const plan = (): SimulationPlan => ({
  cycleMode: 'none',
  aha: { id: 'aha', baseSpeed: 80, contributorIds: [] },
  actors: [
    {
      id: 'a',
      name: 'A',
      kind: 'actor',
      camp: 'ally',
      position: 0,
      baseSpeed: 100,
      panelSpeed: 100,
    },
  ],
  events: [],
  maxNodes: 8,
  maxAV: 500,
})
type SpeedOperation = Extract<EffectOperation, { type: 'addSpeedModifier' }>
const speed = (id: string, turns: number | null = 1, amount = 60): SpeedOperation => ({
  id,
  type: 'addSpeedModifier',
  target: target(),
  mode: 'flat',
  amount,
  duration: { kind: 'turns', turns },
})
const countdown = (): SpeedOperation => ({
  ...speed('clock', null, 20),
  duration: { kind: 'countdown', name: 'Clock', speed: 100 },
})
const modifier = (
  id = 'buff',
  amount = 60,
  mode: 'flat' | 'percent' = 'flat',
): SpeedModifierInstance => ({
  id,
  operationId: 'op',
  amount,
  mode,
  lifetime: { kind: 'turns', remainingTurns: 2 },
})

describe('speed modifier presentation', () => {
  it('preserves original amplitudes, directions, independent IDs and lifetimes without mutation', () => {
    const mods = [
      modifier('flat', 60),
      modifier('slow', -25),
      modifier('percent', 20, 'percent'),
      modifier('slow-percent', -15, 'percent'),
      modifier('zero', -0),
      modifier('same', 20, 'percent'),
    ]
    const original = structuredClone(mods)
    const tags = speedModifierTags(mods, new Map())
    expect(tags.map((t) => t.id)).toEqual(mods.map((m) => m.id))
    expect(tags.map((t) => t.amount)).toEqual([60, -25, 20, -15, -0, 20])
    expect(tags.map((t) => t.direction)).toEqual([
      'increase',
      'decrease',
      'increase',
      'decrease',
      'neutral',
      'increase',
    ])
    expect(tags[2]!.mode).toBe('percent')
    expect(tags[2]!.operationId).toBe('op')
    expect(tags[0]!.lifetime).not.toBe(mods[0]!.lifetime)
    expect(mods).toEqual(original)
    expect(speedModifierTags([], new Map())).toEqual([])
  })
  it('uses signed display descriptors and translates the same semantic data for both locales', () => {
    const tags = speedModifierTags(
      [
        modifier('percent', 20, 'percent'),
        { ...modifier('forever', 0), lifetime: { kind: 'turns', remainingTurns: null } },
      ],
      new Map(),
    )
    expect(speedModifierMessages(tags[0]!)).toMatchObject({
      label: { key: 'planner.speedTag.percent', params: { amount: { value: 20, signed: true } } },
      tooltip: { key: 'planner.speedTag.remainingTurns', params: { count: 2 } },
    })
    expect(speedModifierMessages(tags[1]!).tooltip.key).toBe('planner.speedTag.unlimited')
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } })
    for (const locale of ['zh-CN', 'en'] as const) {
      i18n.global.locale.value = locale
      const rendered = renderSpeedModifierTag(tags[0]!, locale, i18n.global.t)
      expect(rendered.label).toBe(
        i18n.global.t('planner.speedTag.percent', { amount: formatNumber(20, locale, true) }),
      )
      expect(rendered.tooltip).toBe(
        i18n.global.t('planner.speedTag.remainingTurns', { count: '2' }),
      )
      expect(rendered.description).toBe(
        i18n.global.t('planner.speedTag.description', {
          effect: rendered.label,
          duration: rendered.tooltip,
        }),
      )
      expect(renderSpeedModifierTag(tags[1]!, locale, i18n.global.t).label).toContain(
        formatNumber(0, locale, true),
      )
    }
  })
  it('shows a pre-existing final turn buff at action entry and removes it at the next turn', () => {
    const p = plan()
    p.events = [{ anchor: start, operations: [speed('one-turn')] }]
    const result = simulatePlan(p),
      sources = countdownSources(p)
    expect(
      navigatorSpeedModifierTags(result.snapshots[0]!.queue[0]!, sources)[0]!.lifetime,
    ).toEqual({ kind: 'turns', remainingTurns: 1 })
    expect(navigatorSpeedModifierTags(result.records[0]!, sources)).toHaveLength(1)
    expect(result.snapshots[1]!.queue[0]!.modifiers).toEqual([])
    expect(navigatorSpeedModifierTags(result.records[1]!, sources)).toEqual([])
  })
  it.each(['preAction', 'postAction'] as const)(
    'does not anticipate a speed operation added in the current %s phase',
    (phase) => {
      const p = plan()
      p.events = [{ anchor: action(), operations: [{ ...speed('new'), phase }] }]
      const result = simulatePlan(p),
        sources = countdownSources(p)
      expect(navigatorSpeedModifierTags(result.records[0]!, sources)).toEqual([])
      const next = navigatorSpeedModifierTags(result.records[1]!, sources)
      expect(next).toHaveLength(1)
      expect(next[0]!.lifetime).toEqual({ kind: 'turns', remainingTurns: 1 })
      expect(navigatorSpeedModifierTags(result.records[2]!, sources)).toEqual([])
    },
  )
  it.each(['advance', 'delay'] as const)(
    'follows the actual countdown state after explicit %s, without predicting expiry by AV',
    (type) => {
      const p = plan(),
        timerId = countdownParticipantId('clock')
      p.events = [
        {
          anchor: start,
          operations: [countdown(), { id: 'shift', type, target: target(timerId), percent: 100 }],
        },
      ]
      const result = simulatePlan(p),
        sources = countdownSources(p)
      const initial = result.snapshots[0]!.queue.find((q) => q.id === 'a')!
      const tags = navigatorSpeedModifierTags(initial, sources)
      expect(tags[0]!.lifetime).toEqual({
        kind: 'countdown',
        participantId: timerId,
        name: 'Clock',
        speed: 100,
      })
      const firstAction = result.records.find((r) => r.anchor.kind === 'action')!
      expect(navigatorSpeedModifierTags(firstAction, sources).length).toBe(
        type === 'advance' ? 0 : 1,
      )
      const triggerIndex = result.records.findIndex(
        (r) => r.anchor.kind === 'trigger' && r.anchor.participantId === timerId,
      )
      const after = result.records.slice(triggerIndex + 1).find((r) => r.anchor.kind === 'action')!
      expect(navigatorSpeedModifierTags(after, sources)).toEqual([])
      expect(
        result.records[triggerIndex]!.beforeEffects.participants.find((q) => q.id === 'a'),
      ).toMatchObject({ modifiers: [] })
      expect(speedModifierMessages(tags[0]!).tooltip.params).toEqual({ name: 'Clock', speed: 100 })
    },
  )
  it.each([12000, 24000])(
    'uses real tie ordering for countdown and natural action (initial AG %i)',
    (initialAG) => {
      const p = plan()
      p.actors[0]!.initialAG = initialAG
      p.events = [{ anchor: start, operations: [countdown()] }]
      const result = simulatePlan(p),
        sources = countdownSources(p)
      const first = result.records.find((r) => r.anchor.kind === 'action')!
      expect(navigatorSpeedModifierTags(first, sources).length).toBe(initialAG === 12000 ? 1 : 0)
      if (initialAG === 12000) {
        expect(result.records.slice(0, 2).map((r) => r.elapsedAV)).toEqual([100, 100])
        expect(result.records.slice(0, 2).map((r) => r.kind)).toEqual(['actor', 'scheduledEvent'])
      }
    },
  )
  it('resolves countdowns from matching state first, then matching operation, otherwise safe generic help', () => {
    const p = plan()
    p.events = [{ anchor: start, operations: [countdown()] }]
    const result = simulatePlan(p),
      sources = countdownSources(p)
    const record = result.records[0]!,
      state = structuredClone(record.beforeEffects)
    const timer = state.participants.find((q) => q.kind === 'scheduledEvent')!
    if (timer.kind !== 'scheduledEvent') throw new Error('fixture')
    timer.name = 'Runtime'
    timer.speed = 77
    const mod = {
      ...modifier(),
      operationId: 'clock',
      lifetime: { kind: 'countdown' as const, participantId: countdownParticipantId('clock') },
    }
    expect(speedModifierTags([mod], sources, state)[0]!.lifetime).toMatchObject({
      name: 'Runtime',
      speed: 77,
    })
    expect(speedModifierTags([mod], sources)[0]!.lifetime).toMatchObject({
      name: 'Clock',
      speed: 100,
    })
    const wrongId = {
      ...mod,
      lifetime: { kind: 'countdown' as const, participantId: 'another-timer' },
    }
    const wrongSource = { ...mod, operationId: 'missing' }
    for (const invalid of [wrongId, wrongSource]) {
      const tag = speedModifierTags([invalid], sources)[0]!
      expect(tag.lifetime).not.toHaveProperty('name')
      expect(tag.lifetime).not.toHaveProperty('speed')
      expect(speedModifierMessages(tag).tooltip.key).toBe('planner.speedTag.countdownUnknown')
    }
    expect(speedModifierTags([mod], new Map())[0]!.id).toBe(mod.id)
  })
  it('shares action-entry state across future, current and Inspector, while waiting cards use their current modifiers', () => {
    const p = plan()
    p.actors.push({ ...p.actors[0]!, id: 'b', name: 'B', position: 1 })
    p.events = [
      { anchor: start, operations: [speed('initial', null)] },
      {
        anchor: action('a'),
        operations: [{ ...speed('future', null, -10), target: target('b'), phase: 'postAction' }],
      },
    ]
    const result = simulatePlan(p),
      original = structuredClone(result),
      sources = countdownSources(p)
    const first = result.records[0]!,
      view = buildCurrentQueueView(result, 1)!,
      cards = currentQueueCards(view)
    const future = navigatorSpeedModifierTags(first, sources)
    expect(navigatorSpeedModifierTags(cards[0]!, sources)).toEqual(future)
    expect(
      actionSpeedModifierTags(first.anchor, contextAt(p, result, first.anchor), sources),
    ).toEqual(future)
    expect(
      navigatorSpeedModifierTags(
        cards.find((q) => q.kind === 'actor' && q.id === 'b')!,
        sources,
        first.beforeEffects,
      ),
    ).toEqual([])
    const nextView = buildCurrentQueueView(result, 2)!
    expect(nextView.kind).toBe('acting')
    const b = result.records.find((r) => r.kind === 'actor' && r.id === 'b')!
    expect(navigatorSpeedModifierTags(b, sources)[0]!.amount).toBe(-10)
    const initial = currentQueueCards(buildCurrentQueueView(result, 0))
    expect(
      navigatorSpeedModifierTags(
        initial.find((q) => q.kind === 'actor' && q.id === 'a')!,
        sources,
      )[0]!.amount,
    ).toBe(60)
    expect(result).toEqual(original)
  })
  it('updates tags on replay after an early effect edit without retaining future tags in past nodes', () => {
    const p = plan()
    p.events = [{ anchor: start, operations: [speed('edited', null)] }]
    const before = simulatePlan(p)
    p.events[0]!.operations = [speed('edited', null, -25)]
    const after = simulatePlan(p),
      sources = countdownSources(p)
    expect(navigatorSpeedModifierTags(before.records[0]!, sources)[0]!.amount).toBe(60)
    expect(navigatorSpeedModifierTags(after.records[0]!, sources)[0]!.amount).toBe(-25)
    expect(navigatorSpeedModifierTags(after.records[0]!, sources)[0]!.direction).toBe('decrease')
  })
  it('shows only Aha own modifiers, independent of live contributor speed or gauge traces', () => {
    const p = plan()
    p.aha.contributorIds = ['a']
    p.actors[0]!.initialAG = 100000
    p.events = [
      {
        anchor: start,
        operations: [
          { ...speed('aha-flat'), target: target('aha'), amount: 25 },
          { ...speed('aha-percent'), target: target('aha'), mode: 'percent', amount: 20 },
          speed('contributor', null, 10),
        ],
      },
    ]
    const result = simulatePlan(p),
      sources = countdownSources(p),
      first = result.records[0]!
    expect(first.kind).toBe('aha')
    const tags = navigatorSpeedModifierTags(first, sources)
    expect(tags.map((t) => [t.mode, t.amount])).toEqual([
      ['flat', 25],
      ['percent', 20],
    ])
    expect(actionDirections(first.anchor, first.actionChanges)).toEqual({
      advance: false,
      delay: false,
      immediatelyAct: false,
    })
    const later = result.records.find(
      (r) => r.anchor.kind === 'action' && r.anchor.participantId === 'aha' && r.anchor.turn === 2,
    )!
    expect(navigatorSpeedModifierTags(later, sources)).toEqual([])
    p.events[0]!.operations = [speed('only-contributor', null, 100)]
    const derivedOnly = simulatePlan(p)
    expect(derivedOnly.records[0]!.kind).toBe('aha')
    expect(navigatorSpeedModifierTags(derivedOnly.records[0]!, countdownSources(p))).toEqual([])
  })
  it('does not infer effects for absent context, start, system or scheduled nodes', () => {
    const p = plan()
    p.cycleMode = 'moc'
    p.events = [{ anchor: start, operations: [countdown()] }]
    const result = simulatePlan(p),
      sources = countdownSources(p)
    expect(actionSpeedModifierTags(action(), undefined, sources)).toEqual([])
    expect(actionSpeedModifierTags(start, result.startState, sources)).toEqual([])
    expect(actionSpeedModifierTags(action('missing'), result.startState, sources)).toEqual([])
    for (const node of result.records.filter(
      (r) => r.kind === 'scheduledEvent' || r.kind === 'cycleBoundary',
    ))
      expect(navigatorSpeedModifierTags(node, sources)).toEqual([])
    const pending = result.snapshots[0]!.nextCycleBoundary!
    expect(navigatorSpeedModifierTags(pending, sources)).toEqual([])
  })
})
