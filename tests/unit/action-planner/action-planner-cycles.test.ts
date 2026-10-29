import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  nextSimulationEvent,
  simulatePlan,
  stepSimulation,
} from '../../../src/tools/action-planner/engine/engine'
import { anchorKey, effectiveSpeed } from '../../../src/tools/action-planner/engine/queue'
import { cycleBoundaryAV } from '../../../src/tools/action-planner/engine/cycle'
import {
  operationTargets,
  selectableTargets,
  targetIds,
  validTargetSelection,
} from '../../../src/tools/action-planner/engine/targeting'
import {
  validAnchor,
  validateOperations,
} from '../../../src/tools/action-planner/engine/validation'
import type {
  ActorConfig,
  CycleMode,
  EffectOperation,
  SimulationPlan,
} from '../../../src/tools/action-planner/engine/types'

const actor = (id = 'a', firstAV = 200, position = 0, actionLimit?: number): ActorConfig => ({
  id,
  name: id,
  kind: 'actor',
  camp: 'ally',
  position,
  baseSpeed: 100,
  panelSpeed: 100,
  initialAG: firstAV * 100,
  ...(actionLimit ? { actionLimit } : {}),
})
const plan = (cycleMode: CycleMode = 'moc'): SimulationPlan => ({
  cycleMode,
  aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
  actors: [actor()],
  events: [],
  maxAV: 600,
  maxNodes: 30,
})
const boundary = (ordinal = 1) => ({ kind: 'cycleBoundary' as const, ordinal })
const action = (participantId: string) => ({ kind: 'action' as const, participantId, turn: 1 })
const immediate = (id: string, participantId = 'a'): EffectOperation => ({
  id,
  type: 'immediatelyAct',
  target: { kind: 'participants', participantIds: [participantId] },
})
const keys = (p: SimulationPlan) =>
  simulatePlan(p).records.map((r) => [anchorKey(r.anchor), r.elapsedAV])

describe('independent endgame cycle scheduling', () => {
  it.each([
    ['moc', [150, 250, 350]],
    ['aa', [300, 400, 500]],
  ] as const)('generates lazy fixed %s boundaries', (mode, times) => {
    const p = plan(mode)
    p.actors = [actor('a', 1000)]
    p.maxAV = times[2]
    const result = simulatePlan(p)
    expect(result.records.map((r) => r.elapsedAV)).toEqual(times)
    expect(result.records.map((r) => anchorKey(r.anchor))).toEqual([
      'cycleBoundary:1',
      'cycleBoundary:2',
      'cycleBoundary:3',
    ])
    expect(result.snapshots.at(-1)!.completedActions).toBe(0)
    expect(result.snapshots.at(-1)!.completedNodes).toBe(3)
    expect(cycleBoundaryAV(mode, 3)).toBe(times[2])
    for (const record of result.records) {
      expect(record.kind).toBe('cycleBoundary')
      for (const field of ['id', 'name', 'camp', 'effectiveSpeed', 'remainingAG'])
        expect(record).not.toHaveProperty(field)
    }
  })
  it('none adds neither nodes nor runtime cycle state', () => {
    const p = plan('none')
    expect(createInitialState(p)).not.toHaveProperty('cycle')
    expect(simulatePlan(p).records.every((r) => r.kind !== 'cycleBoundary')).toBe(true)
    expect(simulatePlan(p).snapshots.every((s) => !s.nextCycleBoundary)).toBe(true)
  })
  it.each([149.999, 150, 150.001])('orders full precision %s against 150', (time) => {
    const p = plan()
    p.actors = [actor('a', time)]
    p.maxAV = 151
    const result = keys(p)
    if (time < 150) expect(result.map((r) => r[0])).toEqual(['action:a:1', 'cycleBoundary:1'])
    else
      expect(result.map((r) => r[0])).toEqual(
        time === 150 ? ['action:a:1', 'cycleBoundary:1'] : ['cycleBoundary:1', 'action:a:1'],
      )
  })
  it('drains multiple ordinary actors and new zero AV insertions before the boundary', () => {
    const p = plan()
    p.maxAV = 150
    p.actors = [
      actor('a', 150, 0, 1),
      actor('b', 250, 1, 1),
      actor('c', 250, 2, 1),
      actor('d', 150, 3, 1),
    ]
    p.events = [
      { anchor: action('a'), operations: [{ ...immediate('pull-b', 'b'), phase: 'postAction' }] },
      {
        anchor: action('b'),
        operations: [
          {
            id: 'pull-c',
            type: 'advance',
            percent: 100,
            target: { kind: 'participants', participantIds: ['c'] },
            phase: 'postAction',
          },
        ],
      },
    ]
    expect(keys(p)).toEqual(
      ['action:a:1', 'action:b:1', 'action:c:1', 'action:d:1', 'cycleBoundary:1'].map((k) => [
        k,
        150,
      ]),
    )
  })
  it('a Scheduled Event and its zero AV action precede the boundary', () => {
    const p = plan()
    p.actors = [actor('a', 250, 0, 1)]
    p.maxAV = 150
    p.events = [
      {
        anchor: { kind: 'start' },
        operations: [
          {
            id: 'timer',
            type: 'spawnParticipant',
            participant: { kind: 'scheduledEvent', name: 'Timer', speed: 100, initialAG: 15000 },
          },
        ],
      },
      {
        anchor: { kind: 'trigger', participantId: 'spawn:timer' },
        operations: [immediate('timer-pull')],
      },
    ]
    expect(keys(p)).toEqual(
      ['trigger:spawn%3Atimer', 'action:a:1', 'cycleBoundary:1'].map((k) => [k, 150]),
    )
  })
  it('actions created by a boundary follow their source and retain a cycle source trace', () => {
    const p = plan()
    p.maxAV = 150
    p.events = [{ anchor: boundary(), operations: [immediate('pull')] }]
    const result = simulatePlan(p)
    expect(result.records.map((r) => anchorKey(r.anchor))).toEqual([
      'cycleBoundary:1',
      'action:a:1',
    ])
    expect(result.records[1]!.deltaAV).toBe(0)
    expect(result.records[1]!.actionChanges[0]).toMatchObject({
      sourceAnchor: boundary(),
      targetAnchor: action('a'),
      type: 'immediatelyAct',
    })
  })
  it('preserves remaining AG and turn buffs while applying a cycle speed effect', () => {
    const p = plan()
    p.maxAV = 210
    p.events = [
      {
        anchor: boundary(),
        operations: [
          {
            id: 'speed',
            type: 'addSpeedModifier',
            target: { kind: 'allies' },
            mode: 'flat',
            amount: 100,
            duration: { kind: 'turns', turns: 2 },
          },
        ],
      },
    ]
    const result = simulatePlan(p)
    expect(result.records[0]!.beforeEffects.participants[0]!.remainingAG).toBe(5000)
    const snapshot = result.snapshots[1]!.queue[0]!
    expect(snapshot.remainingAG).toBe(5000)
    expect(snapshot.remainingAV).toBe(25)
    expect(snapshot.modifiers[0]!.lifetime).toEqual({ kind: 'turns', remainingTurns: 2 })
    expect(result.records[1]!.elapsedAV).toBe(175)
    expect(result.snapshots[2]!.queue[0]!.modifiers[0]!.lifetime).toEqual({
      kind: 'turns',
      remainingTurns: 1,
    })
  })
  it('boundaries do not decrement existing turn buffs or expire a future countdown', () => {
    const p = plan()
    p.actors = [actor('a', 1000)]
    p.maxAV = 250
    p.events = [
      {
        anchor: { kind: 'start' },
        operations: [
          {
            id: 'turns',
            type: 'addSpeedModifier',
            target: { kind: 'allies' },
            mode: 'flat',
            amount: 10,
            duration: { kind: 'turns', turns: 2 },
          },
          {
            id: 'countdown',
            type: 'addSpeedModifier',
            target: { kind: 'allies' },
            mode: 'flat',
            amount: 10,
            duration: { kind: 'countdown', name: 'Expiry', speed: 25 },
          },
        ],
      },
    ]
    const result = simulatePlan(p),
      entry = result.snapshots.at(-1)!.queue.find((q) => q.id === 'a')!
    expect(entry.modifiers).toHaveLength(2)
    expect(entry.modifiers[0]!.lifetime).toEqual({ kind: 'turns', remainingTurns: 2 })
    expect(entry.remainingAG).toBe(70000)
    p.maxAV = 400
    const expired = simulatePlan(p)
    expect(expired.records.at(-1)!.anchor).toEqual({
      kind: 'trigger',
      participantId: 'countdown:countdown',
    })
    expect(expired.records.at(-2)!.anchor).toEqual(boundary(3))
    expect(expired.snapshots.at(-1)!.queue[0]!.modifiers).toHaveLength(1)
    const countdown = p.events[0]!.operations[1]!
    if (countdown.type !== 'addSpeedModifier' || countdown.duration.kind !== 'countdown')
      throw new Error('Fixture')
    countdown.duration.speed = 40
    p.maxAV = 250
    const tied = simulatePlan(p)
    expect(tied.records.slice(-2).map((r) => [anchorKey(r.anchor), r.elapsedAV])).toEqual([
      ['trigger:countdown%3Acountdown', 250],
      ['cycleBoundary:2', 250],
    ])
    expect(
      effectiveSpeed(
        tied.records.at(-1)!.beforeEffects.participants[0]!,
        tied.records.at(-1)!.beforeEffects,
      ),
    ).toBe(110)
  })
  it('creates ordinary actors and countdown events with the usual initial gauge formula', () => {
    const p = plan()
    p.maxAV = 250
    p.events = [
      {
        anchor: boundary(),
        operations: [
          {
            id: 'child',
            type: 'spawnParticipant',
            participant: {
              kind: 'actor',
              name: 'Child',
              camp: 'enemy',
              baseSpeed: 100,
              panelSpeed: 200,
              actionLimit: 1,
            },
          },
          {
            id: 'event',
            type: 'spawnParticipant',
            participant: { kind: 'scheduledEvent', name: 'Event', speed: 100 },
          },
        ],
      },
    ]
    const result = simulatePlan(p)
    expect(
      result.records.find(
        (r) => r.anchor.kind === 'action' && r.anchor.participantId === 'spawn:child',
      )!.elapsedAV,
    ).toBe(200)
    expect(result.records.find((r) => r.anchor.kind === 'trigger')!.elapsedAV).toBe(250)
    expect(result.records.at(-1)!.anchor).toEqual(boundary(2))
  })
  it('counts boundaries toward nodes and permits an exact maxAV boundary', () => {
    const p = plan()
    p.actors = [actor('a', 1000)]
    p.maxNodes = 2
    expect(keys(p)).toEqual([
      ['cycleBoundary:1', 150],
      ['cycleBoundary:2', 250],
    ])
    expect(simulatePlan(p).stopReason).toBe('nodes')
    p.maxNodes = 30
    p.maxAV = 150
    expect(keys(p)).toEqual([['cycleBoundary:1', 150]])
    p.maxAV = 149.999
    expect(keys(p)).toEqual([])
  })
  it('stops an empty queue, but executes a due boundary that can revive it', () => {
    const p = plan()
    p.actors = []
    expect(keys(p)).toEqual([])
    p.actors = [actor('a', 100, 0, 1)]
    expect(keys(p)).toEqual([['action:a:1', 100]])
    p.actors = [actor('a', 150, 0, 1)]
    p.maxNodes = 1
    expect(keys(p)).toEqual([['action:a:1', 150]])
    expect(simulatePlan(p).stopReason).toBe('nodes')
    p.cycleMode = 'none'
    expect(simulatePlan(p).stopReason).toBe('empty')
    p.cycleMode = 'moc'
    p.maxNodes = 30
    p.maxAV = 250
    p.events = [
      {
        anchor: boundary(),
        operations: [
          {
            id: 'revive',
            type: 'spawnParticipant',
            participant: {
              kind: 'actor',
              name: 'Child',
              camp: 'ally',
              baseSpeed: 100,
              panelSpeed: 100,
              actionLimit: 1,
            },
          },
        ],
      },
    ]
    expect(keys(p)).toEqual([
      ['action:a:1', 150],
      ['cycleBoundary:1', 150],
      ['action:spawn%3Arevive:1', 250],
      ['cycleBoundary:2', 250],
    ])
  })
  it('keeps the existing zero AV budget guard ahead of a waiting boundary', () => {
    const p = plan()
    p.actors = [actor('a', 150)]
    p.maxNodes = 4
    p.events = [1, 2, 3, 4].map((turn) => ({
      anchor: { kind: 'action', participantId: 'a', turn },
      operations: [{ ...immediate(`self-${turn}`), phase: 'postAction' }],
    }))
    expect(simulatePlan(p).records).toHaveLength(4)
    expect(simulatePlan(p).records.every((r) => r.kind === 'actor')).toBe(true)
  })
  it('rejects invalid ordinals and phases without adding systems to target catalogs', () => {
    for (const ordinal of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(validAnchor(boundary(ordinal))).toBe(false)
    expect(
      validateOperations([{ ...immediate('bad'), phase: 'postAction' }], boundary()),
    ).toHaveLength(1)
    const state = createInitialState(plan()),
      targets = operationTargets(state)
    for (const type of ['advance', 'delay', 'immediatelyAct', 'addSpeedModifier'] as const) {
      expect(selectableTargets(type, targets, []).map((p) => p.id)).toEqual(['a'])
      expect(
        validTargetSelection(type, [
          { kind: 'cycleBoundary', name: 'Cycle', id: 'cycleBoundary:1' },
        ] as unknown as typeof targets),
      ).toBe(false)
    }
    expect(targetIds({ kind: 'allies' }, targets)).toEqual(['a'])
    expect(targetIds({ kind: 'enemies' }, targets)).toEqual([])
    expect(nextSimulationEvent(state)!.anchor).toEqual(boundary())
    const step = stepSimulation(state, [])
    expect(effectiveSpeed(step.state.participants[0]!, step.state)).toBe(100)
    expect(state.cycle!.nextOrdinal).toBe(1)
    expect(step.state.cycle!.nextOrdinal).toBe(2)
  })
})
