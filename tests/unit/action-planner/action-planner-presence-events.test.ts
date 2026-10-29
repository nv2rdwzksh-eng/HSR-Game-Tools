import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  createInitialState,
  simulatePlan,
  stepSimulation,
} from '../../../src/tools/action-planner/engine/engine'
import {
  advanceTime,
  cloneState,
  countdownParticipantId,
  effectiveSpeed,
  FULL_AG,
  nextAnchor,
  orderedParticipants,
  queueSnapshot,
  spawnedParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import { operationTargets, targetIds } from '../../../src/tools/action-planner/engine/targeting'
import { validatePlan } from '../../../src/tools/action-planner/engine/validation'
import type {
  EffectOperation,
  SimulationPlan,
  SimulationState,
} from '../../../src/tools/action-planner/engine/types'
import {
  actionSpeedModifierTags,
  countdownSources,
  navigatorSpeedModifierTags,
  speedModifierTags,
} from '../../../src/tools/action-planner/model/speed-modifier-tags'

const start = { kind: 'start' } as const
const target = (...participantIds: string[]) => ({ kind: 'participants' as const, participantIds })
const presence = (
  id: string,
  type: 'depart' | 'returnToField',
  ...ids: string[]
): EffectOperation => ({ id, type, target: target(...ids) })
const speed = (
  id: string,
  ids: string[],
  amount = 1.5,
  mode: 'flat' | 'percent' = 'percent',
): Extract<EffectOperation, { type: 'addSpeedModifier' }> => ({
  id,
  type: 'addSpeedModifier',
  target: target(...ids),
  mode,
  amount,
  duration: { kind: 'turns', turns: null },
})
const spawn = (id: string, baseSpeed?: number, initialAG = FULL_AG): EffectOperation => ({
  id,
  type: 'spawnParticipant',
  participant: { kind: 'scheduledEvent', name: id, speed: 66, baseSpeed, initialAG },
})
function plan(): SimulationPlan {
  return {
    actors: ['a', 'b'].map((id, position) => ({
      id,
      kind: 'actor',
      name: id,
      camp: 'ally',
      position,
      baseSpeed: 100,
      panelSpeed: 100,
    })),
    aha: { id: 'aha', baseSpeed: 80, contributorIds: ['a'] },
    cycleMode: 'none',
    events: [],
    maxNodes: 20,
    maxAV: 600,
  }
}
const participant = (state: SimulationState, id: string) =>
  state.participants.find((p) => p.id === id)!
const apply = (state: SimulationState, ...ops: EffectOperation[]) =>
  applyOperations(state, ops, start)

describe('generic field presence', () => {
  it.each(['a', 'aha', 'spawn:event'])(
    'freezes AG and keeps the stable queue state of %s',
    (id) => {
      const initial = apply(createInitialState(plan()), spawn('event', 100)).state
      advanceTime(initial, 20)
      const before = cloneState(initial)
      const departed = apply(initial, presence('leave', 'depart', id)).state
      const anchor = nextAnchor(participant(departed, id))
      advanceTime(departed, 30)
      expect(participant(departed, id)).toEqual({ ...participant(before, id), departed: true })
      expect(departed.elapsedAV).toBe(50)
      expect(orderedParticipants(departed).some((p) => p.id === id)).toBe(false)
      expect(operationTargets(departed).some((p) => p.id === id)).toBe(false)
      expect(operationTargets(departed, 'returnToField').map((p) => p.id)).toContain(id)
      const returned = apply(departed, presence('return', 'returnToField', id)).state
      expect(participant(returned, id)).toEqual(participant(before, id))
      expect(nextAnchor(participant(returned, id))).toEqual(anchor)
      expect(queueSnapshot(returned).queue.some((p) => p.id === id)).toBe(true)
      expect(initial).toEqual(before)
    },
  )

  it('preserves zero-AV priority and pending action traces through departure', () => {
    const state = apply(createInitialState(plan()), {
      id: 'pull',
      type: 'immediatelyAct',
      target: target('b', 'a'),
    }).state
    const original = cloneState(state)
    const returned = apply(
      state,
      presence('leave', 'depart', 'b'),
      presence('return', 'returnToField', 'b'),
    ).state
    expect(returned).toEqual(original)
    expect(
      orderedParticipants(returned)
        .slice(0, 2)
        .map((p) => p.id),
    ).toEqual(['a', 'b'])
  })

  it('skips whole invalid explicit groups, including repeated and ordinary off-field targets', () => {
    const state = apply(createInitialState(plan()), presence('leave', 'depart', 'a')).state
    for (const op of [
      presence('again', 'depart', 'a', 'b'),
      presence('wrong-return', 'returnToField', 'a', 'b'),
      speed('buff', ['a', 'b']),
      { id: 'pull', type: 'advance', target: target('a'), percent: 50 } as EffectOperation,
    ]) {
      const result = apply(state, op)
      expect(result.state).toEqual(state)
      expect(result.diagnostics).toMatchObject([{ code: 'invalid-target', operationId: op.id }])
    }
    const missing = apply(state, presence('missing', 'returnToField', 'a', 'deleted'))
    expect(missing.state).toEqual(state)
    expect(missing.diagnostics[0]!.code).toBe('missing-target')
    const grouped = apply(state, {
      id: 'group-return',
      type: 'returnToField',
      target: { kind: 'allies' },
    })
    expect(grouped.diagnostics).toEqual([])
    expect(participant(grouped.state, 'a').departed).toBe(false)
    expect(targetIds({ kind: 'allies' }, grouped.state.participants)).not.toContain('aha')
  })

  it('continues event countdowns with all allied actors departed, while turn buffs do not age', () => {
    const p = plan()
    p.aha.contributorIds = []
    p.events = [
      {
        anchor: start,
        operations: [
          speed('buff', ['a']),
          spawn('clock', 100),
          { id: 'leave-all', type: 'depart', target: { kind: 'allies' } },
        ],
      },
    ]
    const result = simulatePlan(p)
    expect(result.stopReason).toBe('empty')
    expect(result.records.map((r) => r.kind)).toEqual(['scheduledEvent'])
    const a = participant(result.records[0]!.beforeEffects, 'a')
    expect(a).toMatchObject({
      remainingAG: FULL_AG,
      turns: 0,
      departed: true,
      modifiers: [{ lifetime: { remainingTurns: null } }],
    })
    expect(result.snapshots.at(-1)!.queue).toEqual([])
  })

  it('keeps contributions from departed actors and advances independent cycle boundaries', () => {
    const state = createInitialState(plan())
    const ahaSpeed = effectiveSpeed(participant(state, 'aha'), state)
    const departed = apply(state, presence('leave', 'depart', 'a')).state
    expect(effectiveSpeed(participant(departed, 'aha'), departed)).toBe(ahaSpeed)
    const p = plan()
    p.cycleMode = 'moc'
    p.maxNodes = 1
    p.events = [{ anchor: start, operations: [presence('all', 'depart', 'a', 'b', 'aha')] }]
    const result = simulatePlan(p)
    expect(result.records[0]).toMatchObject({ kind: 'cycleBoundary', elapsedAV: 150 })
    expect(
      result.records[0]!.beforeEffects.participants.every((p) => p.remainingAG === FULL_AG),
    ).toBe(true)
  })

  it.each(['preAction', 'postAction'] as const)(
    'completes the active natural turn when leaving in %s',
    (phase) => {
      const state = apply(createInitialState(plan()), {
        ...speed('old', ['a'], 20, 'flat'),
        duration: { kind: 'turns', turns: 1 },
      }).state
      const step = stepSimulation(state, [{ ...presence('leave', 'depart', 'a'), phase }])
      expect(participant(step.state, 'a')).toMatchObject({
        departed: true,
        turns: 1,
        remainingAG: FULL_AG,
        modifiers: [],
      })
      expect(step.state.activeParticipantId).toBeUndefined()
      expect(step.state.completedActions).toBe(1)
      expect(step.record.actionChanges).toEqual([])
    },
  )

  it('expires an actor countdown off field and recomputes returning AV using the new speed', () => {
    const timed: EffectOperation = {
      ...speed('timed', ['a'], 50, 'flat'),
      duration: { kind: 'countdown', name: 'Clock', speed: 200 },
    }
    let state = apply(createInitialState(plan()), timed).state
    advanceTime(state, 20)
    state = apply(state, presence('leave', 'depart', 'a')).state
    const ag = participant(state, 'a').remainingAG
    state = stepSimulation(state, []).state
    expect(participant(state, 'a').modifiers).toEqual([])
    state = apply(state, presence('return', 'returnToField', 'a')).state
    expect(participant(state, 'a').remainingAG).toBe(ag)
    expect(queueSnapshot(state).queue.find((p) => p.id === 'a')!.remainingAV).toBe(ag / 100)
  })

  it('pauses a buff countdown until explicitly returned, preserving finite actor buffs', () => {
    const timed: EffectOperation = {
      ...speed('timed', ['a'], 50, 'flat'),
      duration: { kind: 'countdown', name: 'Clock', speed: 200 },
    }
    const id = countdownParticipantId('timed')
    let state = apply(
      createInitialState(plan()),
      timed,
      { ...speed('turns', ['a'], 5, 'flat'), duration: { kind: 'turns', turns: 2 } },
      presence('leave', 'depart', 'a', id),
    ).state
    advanceTime(state, 40)
    expect(participant(state, id).remainingAG).toBe(FULL_AG)
    expect(participant(state, 'a').modifiers[1]!.lifetime).toMatchObject({ remainingTurns: 2 })
    state = apply(state, presence('return-clock', 'returnToField', id)).state
    state = stepSimulation(state, []).state
    expect(participant(state, 'a').modifiers.map((m) => m.operationId)).toEqual(['turns'])
    expect(participant(state, 'a').remainingAG).toBe(FULL_AG)
  })
})

describe('scheduled event speed modifiers', () => {
  it.each([undefined, 100])(
    'uses the independent speed base %s with additive percentages',
    (base) => {
      let state = apply(createInitialState(plan()), spawn('event', base)).state
      const id = spawnedParticipantId('event')
      const ag = participant(state, id).remainingAG
      state = apply(state, speed('first', [id])).state
      expect(effectiveSpeed(participant(state, id), state)).toBe(base === undefined ? 66.99 : 67.5)
      state = apply(state, speed('second', [id])).state
      expect(effectiveSpeed(participant(state, id), state)).toBe(base === undefined ? 67.98 : 69)
      expect(participant(state, id).remainingAG).toBe(ag)
      expect(participant(state, id).pendingActionChanges).toEqual([])
      expect(state.elapsedAV).toBe(0)
    },
  )

  it('supports mixed explicit groups and deeply owns modifier lifetimes in previews and snapshots', () => {
    const state = apply(createInitialState(plan()), spawn('one', 100), spawn('two', 100)).state
    const ids = ['a', 'aha', 'spawn:one', 'spawn:two']
    const changed = apply(state, speed('group', ids, 25, 'flat')).state
    for (const id of ids) expect(participant(changed, id).modifiers).toHaveLength(1)
    expect(effectiveSpeed(participant(changed, 'spawn:one'), changed)).toBe(91)
    const clone = cloneState(changed)
    participant(clone, 'spawn:one').modifiers[0]!.amount = 99
    participant(clone, 'spawn:one').modifiers[0]!.lifetime = { kind: 'turns', remainingTurns: 4 }
    const snapshot = queueSnapshot(changed)
    snapshot.queue.find((p) => p.id === 'spawn:two')!.modifiers[0]!.amount = 90
    expect(participant(changed, 'spawn:one').modifiers[0]!.amount).toBe(25)
    expect(participant(changed, 'spawn:two').modifiers[0]!.amount).toBe(25)
    expect(participant(changed, 'spawn:one').modifiers[0]!.lifetime).toEqual({
      kind: 'turns',
      remainingTurns: null,
    })
    expect(participant(state, 'spawn:one').modifiers).toEqual([])
    expect(targetIds({ kind: 'allies' }, changed.participants)).toEqual(['a', 'b'])
  })

  it.each([
    { kind: 'turns', turns: 2 },
    { kind: 'countdown', name: 'Bad', speed: 100 },
  ] as const)('rejects unsupported event lifetime %s', (duration) => {
    const op: EffectOperation = { ...speed('bad', ['spawn:event']), duration }
    const state = apply(createInitialState(plan()), spawn('event', 100)).state
    const failed = apply(state, op)
    expect(failed.state).toEqual(state)
    expect(failed.diagnostics[0]!.code).toBe('invalid-target')
    const p = plan()
    p.events = [{ anchor: start, operations: [spawn('event', 100), op] }]
    expect(validatePlan(p)[0]!.code).toBe('invalid-target')
  })

  it.each([-66, -1000, Number.MAX_VALUE])(
    'rejects invalid speed candidates atomically: %s',
    (amount) => {
      const state = apply(createInitialState(plan()), spawn('event', 100)).state
      const original = cloneState(state)
      const op = speed(
        'bad',
        ['spawn:event'],
        amount,
        amount === Number.MAX_VALUE ? 'percent' : 'flat',
      )
      expect(() => apply(state, op)).toThrow()
      expect(state).toEqual(original)
    },
  )

  it('removes unlimited event buffs at trigger and rejects targets during and after trigger', () => {
    const p = plan()
    p.aha.contributorIds = []
    p.events = [
      { anchor: start, operations: [spawn('event', 100, 0), speed('buff', ['spawn:event'])] },
    ]
    p.events.push({
      anchor: { kind: 'trigger', participantId: 'spawn:event' },
      operations: [presence('self', 'depart', 'spawn:event')],
    })
    const result = simulatePlan(p)
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'invalid-target', operationId: 'self' }),
    )
    const record = result.records[0]!
    const sources = countdownSources(p)
    expect(actionSpeedModifierTags(record.anchor, record.beforeEffects, sources)).toMatchObject([
      { amount: 1.5, direction: 'increase' },
    ])
    expect(navigatorSpeedModifierTags(record, sources)).toHaveLength(1)
    expect(
      navigatorSpeedModifierTags(
        result.snapshots[0]!.queue.find((p) => p.id === 'spawn:event')!,
        sources,
      ),
    ).toHaveLength(1)
    expect(
      speedModifierTags(participant(record.beforeEffects, 'spawn:event').modifiers, sources)[0]!
        .lifetime,
    ).toEqual({ kind: 'turns', remainingTurns: null })
    const done = stepSimulation(
      apply(createInitialState(p), ...p.events[0]!.operations).state,
      [],
    ).state
    expect(done.participants.some((p) => p.id === 'spawn:event')).toBe(false)
    expect(apply(done, speed('late', ['spawn:event'])).diagnostics[0]!.code).toBe('missing-target')
  })
})
