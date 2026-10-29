import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  createInitialState,
  previewOperationState,
  simulatePlan,
  stepSimulation,
} from '../../../src/tools/action-planner/engine/engine'
import {
  advanceTime,
  cloneState,
  effectiveSpeed,
  nextAnchor,
  queueSnapshot,
  countdownParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import {
  operationTargets,
  selectableTargets,
  targetIds,
  validTargetSelection,
} from '../../../src/tools/action-planner/engine/targeting'
import { validatePlan } from '../../../src/tools/action-planner/engine/validation'
import type {
  AhaState,
  EffectOperation,
  SimulationPlan,
  SimulationState,
  SpeedDuration,
} from '../../../src/tools/action-planner/engine/types'
import { contextAt } from '../../../src/tools/action-planner/model/editor'
import { buildCurrentQueueView } from '../../../src/tools/action-planner/model/current-queue'

const start = { kind: 'start' as const }
const action = (turn = 1) => ({ kind: 'action' as const, participantId: 'aha', turn })
const plan = (speeds = [180, 136], baseSpeed = 80): SimulationPlan => ({
  aha: { id: 'aha', baseSpeed, contributorIds: speeds.map((_, i) => `a${i}`) },
  actors: speeds.map((speed, position) => ({
    id: `a${position}`,
    kind: 'actor',
    name: `A${position}`,
    camp: 'ally',
    position,
    baseSpeed: speed,
    panelSpeed: speed,
    initialAG: 100000,
  })),
  cycleMode: 'none',
  events: [],
  maxNodes: 12,
  maxAV: 600,
})
const aha = (state: SimulationState) =>
  state.participants.find((p): p is AhaState => p.kind === 'aha')!
const spd = (state: SimulationState) => effectiveSpeed(aha(state), state)
const speed = (
  id: string,
  amount: number,
  ids = ['aha'],
  duration: SpeedDuration = { kind: 'turns', turns: null },
  mode: 'flat' | 'percent' = 'flat',
): EffectOperation => ({
  id,
  type: 'addSpeedModifier',
  target: { kind: 'participants', participantIds: ids },
  mode,
  amount,
  duration,
})

describe('Aha natural participant and state-derived speed', () => {
  it.each([
    [[], undefined],
    [[180], 116],
    [[180, 136], 129.6],
    [[200, 180, 160, 140], 149.5],
    [[180, 180], 134],
  ] as [number[], number | undefined][])(
    'calculates ranked contributions for %j',
    (speeds, expected) => {
      const state = createInitialState(plan(speeds))
      if (expected === undefined) expect(aha(state)).toBeUndefined()
      else expect(spd(state)).toBe(expected)
    },
  )
  it('separates live contributions from Aha flat and base-percent modifiers', () => {
    let state = createInitialState(plan())
    expect(spd(state)).toBe(129.6)
    state = applyOperations(state, [speed('flat', 25)], start).state
    expect(spd(state)).toBe(154.6)
    state = applyOperations(
      state,
      [speed('percent', 20, ['aha'], undefined, 'percent')],
      start,
    ).state
    expect(spd(state)).toBe(170.6)
    state = applyOperations(state, [speed('rank', 64, ['a1'])], start).state
    expect(spd(state)).toBe(179)
    expect(aha(state).modifiers).toHaveLength(2)
    const custom = createInitialState(plan([180, 136], 100))
    expect(
      spd(applyOperations(custom, [speed('p', 20, ['aha'], undefined, 'percent')], start).state),
    ).toBe(169.6)
  })
  it('uses complete state including an acting contributor and preserves the elapsed interval', () => {
    const state = createInitialState(plan())
    advanceTime(state, 20)
    expect(aha(state).remainingAG).toBe(7408)
    state.activeParticipantId = 'a1'
    const changed = applyOperations(state, [speed('rank', 64, ['a1'])], start).state
    expect(spd(changed)).toBe(138)
    expect(aha(changed).remainingAG).toBe(7408)
    expect(changed.elapsedAV).toBe(20)
    expect(queueSnapshot(changed).queue.find((p) => p.kind === 'aha')!.remainingAV).toBe(7408 / 138)
    expect(
      changed.participants.filter((p) => p.kind === 'actor').map((p) => p.remainingAG),
    ).toEqual([96400, 97280])
    expect(spd(state)).toBe(129.6)
  })
  it('deep-clones Aha contributors and modifier lifetimes', () => {
    const state = applyOperations(
      createInitialState(plan()),
      [speed('buff', 25, ['aha'], { kind: 'turns', turns: 2 })],
      start,
    ).state
    const clone = cloneState(state)
    aha(clone).contributorIds.pop()
    const lifetime = aha(clone).modifiers[0]!.lifetime
    if (lifetime.kind === 'turns') lifetime.remainingTurns = 0
    expect(aha(state).contributorIds).toHaveLength(2)
    expect(aha(state).modifiers[0]!.lifetime).toEqual({ kind: 'turns', remainingTurns: 2 })
  })
  it.each([1, 2, null])('settles only Aha old turn modifiers (%s)', (turns) => {
    let state = applyOperations(
      createInitialState(plan()),
      [
        speed('buff', 25, ['aha'], { kind: 'turns', turns }),
        speed('actor', 5, ['a0'], { kind: 'turns', turns: 3 }),
      ],
      start,
    ).state
    for (let i = 0; i < 2; i++) {
      const before = state
      const step = stepSimulation(state, [])
      state = step.state
      expect(step.record.anchor).toEqual(action(i + 1))
      expect(before.completedActions).toBe(i)
      expect(state.completedActions).toBe(i + 1)
      expect(state.completedNodes).toBe(i + 1)
      expect(aha(state).remainingAG).toBe(10000)
      expect(nextAnchor(aha(state))).toEqual(action(i + 2))
      const actor = state.participants.find((p) => p.id === 'a0')!
      if (actor.kind !== 'actor') throw new Error('fixture')
      expect(actor.modifiers[0]!.lifetime).toEqual({ kind: 'turns', remainingTurns: 3 })
    }
    expect(aha(state).modifiers.length).toBe(turns === null ? 1 : 0)
    expect(spd(state)).toBeCloseTo(130.6 + (turns === null ? 25 : 0))
  })
  it.each(['preAction', 'postAction'] as const)(
    'does not decrement a new %s Aha modifier in its current turn',
    (phase) => {
      const state = createInitialState(plan())
      const op = { ...speed('new', 25, ['aha'], { kind: 'turns', turns: 1 }), phase }
      const first = stepSimulation(state, [op])
      expect(aha(first.state).modifiers[0]!.lifetime).toEqual({ kind: 'turns', remainingTurns: 1 })
      expect(spd(first.state)).toBe(154.6)
      expect(aha(stepSimulation(first.state, []).state).modifiers).toEqual([])
      const preview = previewOperationState(
        first.record.beforeEffects,
        [op],
        action(),
        'postAction',
      )!
      expect(aha(preview).remainingAG).toBe(aha(first.state).remainingAG)
      expect(spd(preview)).toBe(spd(first.state))
      expect(queueSnapshot(first.record.beforeEffects).queue.some((p) => p.kind === 'aha')).toBe(
        false,
      )
    },
  )
  it('expires one shared countdown on Actor and Aha without resetting their gauges', () => {
    const p = plan()
    p.events = [
      {
        anchor: start,
        operations: [
          speed('shared', 25, ['a0', 'aha'], { kind: 'countdown', name: 'Clock', speed: 500 }),
        ],
      },
    ]
    const result = simulatePlan(p)
    expect(result.records[0]!.anchor).toEqual({
      kind: 'trigger',
      participantId: countdownParticipantId('shared'),
    })
    const snapshot = result.snapshots[1]!.queue.find((p) => p.kind === 'aha')!
    expect(snapshot.remainingAG).toBeCloseTo(10000 - 20 * 159.6)
    expect(snapshot.effectiveSpeed).toBe(129.6)
    expect(snapshot.modifiers).toEqual([])
    expect(
      result.records[0]!.beforeEffects.participants.find((p) => p.kind === 'aha'),
    ).toMatchObject({ modifiers: [] })
  })
  it('restores contribution ranks on a contributor countdown expiry', () => {
    const p = plan()
    p.events = [
      {
        anchor: start,
        operations: [speed('rank', 64, ['a1'], { kind: 'countdown', name: 'Rank', speed: 500 })],
      },
    ]
    const result = simulatePlan(p)
    expect(result.snapshots[0]!.queue.find((p) => p.kind === 'aha')!.effectiveSpeed).toBe(138)
    expect(result.snapshots[1]!.queue.find((p) => p.kind === 'aha')!.effectiveSpeed).toBe(129.6)
    expect(result.snapshots[1]!.queue.find((p) => p.kind === 'aha')!.remainingAG).toBe(7240)
  })
  it('restores live ranks when a contributor turn modifier expires', () => {
    const p = plan()
    p.actors[1]!.initialAG = 0
    const input = applyOperations(
      createInitialState(p),
      [speed('rank', 64, ['a1'], { kind: 'turns', turns: 1 })],
      start,
    ).state
    expect(spd(input)).toBe(138)
    const step = stepSimulation(input, [])
    expect(step.record.anchor).toEqual({ kind: 'action', participantId: 'a1', turn: 1 })
    expect(spd(step.record.beforeEffects)).toBe(138)
    expect(spd(step.state)).toBe(129.6)
    expect(aha(step.state).remainingAG).toBe(10000)
  })
  it('fails contributor retirement atomically when lost contribution makes Aha speed invalid', () => {
    const p = plan([100])
    p.actors[0]!.initialAG = 0
    p.actors[0]!.actionLimit = 1
    const state = applyOperations(createInitialState(p), [speed('negative', -90)], start).state
    expect(spd(state)).toBe(10)
    expect(() => stepSimulation(state, [])).toThrow('invalid-speed')
    expect(state.participants).toHaveLength(2)
    expect(state.completedActions).toBe(0)
  })
  it('continues at base speed after the last contributor retires', () => {
    const p = plan([100])
    p.actors[0]!.initialAG = 0
    p.actors[0]!.actionLimit = 1
    const step = stepSimulation(createInitialState(p), [])
    expect(step.state.participants).toHaveLength(1)
    expect(spd(step.state)).toBe(80)
    expect(aha(step.state).remainingAG).toBe(10000)
    expect(stepSimulation(step.state, []).record.elapsedAV).toBe(125)
  })
  it.each(['moc', 'aa'] as const)(
    'settles the %s boundary after tied natural participants and timers',
    (cycleMode) => {
      const av = cycleMode === 'moc' ? 150 : 300
      const p = plan([100], 10000 / av - 20)
      p.cycleMode = cycleMode
      p.actors[0]!.initialAG = av * 100
      p.events = [
        {
          anchor: start,
          operations: [
            {
              id: 'timer',
              type: 'spawnParticipant',
              participant: { kind: 'scheduledEvent', name: 'Clock', speed: 10000 / av },
            },
          ],
        },
      ]
      const result = simulatePlan(p)
      expect(result.records.slice(0, 4).map((r) => r.kind)).toEqual([
        'actor',
        'aha',
        'scheduledEvent',
        'cycleBoundary',
      ])
      expect(result.records.slice(0, 4).map((r) => r.elapsedAV)).toEqual([av, av, av, av])
    },
  )
  it('uses Aha action nodes for ordinary operations, preview and failed-node replay', () => {
    const p = plan()
    const op = { ...speed('bad', -1000), phase: 'postAction' as const }
    p.events = [{ anchor: action(), operations: [op] }]
    const failed = simulatePlan(p)
    expect(failed.records).toEqual([])
    expect(failed.snapshots).toHaveLength(1)
    expect(failed.stopReason).toBe('error')
    const context = contextAt(p, failed, action())!
    expect(context.activeParticipantId).toBe('aha')
    expect(previewOperationState(context, [op], action(), 'postAction', op.id)).toBeDefined()
    p.events[0]!.operations = [{ ...speed('good', 25), phase: 'postAction' }]
    const result = simulatePlan(p)
    expect(result.records[0]!.anchor).toEqual(action())
    expect(result.records[0]!.actionChanges).toEqual([])
    const current = buildCurrentQueueView(result, 1)!
    expect(current.kind).toBe('acting')
    expect(current.waiting.some((p) => p.kind === 'aha')).toBe(false)
  })
  it('rejects invalid intermediate speed and invalid expiry without leaking state', () => {
    const input = createInitialState(plan())
    expect(() =>
      applyOperations(input, [speed('bad', -1000), speed('rescue', 2000)], start),
    ).toThrow('invalid-speed')
    expect(aha(input).modifiers).toEqual([])
    const buffed = applyOperations(
      input,
      [speed('positive', 100, ['aha'], { kind: 'turns', turns: 1 }), speed('negative', -150)],
      start,
    ).state
    expect(() => stepSimulation(buffed, [])).toThrow('invalid-speed')
    expect(aha(buffed).turns).toBe(0)
  })
  it('allows only explicit speed targets, including mixed Actor/Aha sets', () => {
    const state = createInitialState(plan())
    const a = aha(state),
      actor = state.participants[0]!
    expect(validTargetSelection('addSpeedModifier', [actor, a])).toBe(true)
    expect(selectableTargets('addSpeedModifier', operationTargets(state), [actor.id])).toContain(a)
    expect(targetIds({ kind: 'allies' }, state.participants)).not.toContain('aha')
    expect(targetIds({ kind: 'enemies' }, state.participants)).not.toContain('aha')
    for (const type of ['advance', 'delay', 'immediatelyAct'] as const) {
      expect(validTargetSelection(type, [a])).toBe(false)
      const op: EffectOperation =
        type === 'immediatelyAct'
          ? { id: type, type, target: { kind: 'participants', participantIds: ['aha'] } }
          : {
              id: type,
              type,
              target: { kind: 'participants', participantIds: ['aha'] },
              percent: 10,
            }
      expect(applyOperations(state, [op], start).diagnostics[0]!.code).toBe('invalid-target')
      const p = plan()
      p.events = [{ anchor: start, operations: [op] }]
      expect(validatePlan(p)[0]!.code).toBe('invalid-target')
    }
    const absent = plan([])
    absent.events = [{ anchor: start, operations: [speed('orphan', 25)] }]
    expect(simulatePlan(absent).diagnostics.map((d) => d.code)).toContain('missing-target')
    const timer = { id: 't', kind: 'scheduledEvent' as const, name: 'T' }
    expect(validTargetSelection('addSpeedModifier', [a, timer])).toBe(true)
  })
  it('validates contributor structure, protected identity and AV/node budgets', () => {
    for (const contributorIds of [['aha'], ['unknown'], ['a0', 'a0'], ['spawn:child']]) {
      const p = plan()
      p.aha.contributorIds = contributorIds
      expect(validatePlan(p)).not.toEqual([])
    }
    const enemy = plan()
    enemy.actors[0]!.camp = 'enemy'
    expect(validatePlan(enemy)).not.toEqual([])
    const bad = plan()
    bad.aha.id = 'a0'
    expect(validatePlan(bad)).not.toEqual([])
    const p = plan()
    p.maxNodes = 2
    expect(simulatePlan(p).records.map((r) => r.anchor)).toEqual([action(), action(2)])
    p.maxAV = 1
    expect(simulatePlan(p).records).toEqual([])
  })
})
