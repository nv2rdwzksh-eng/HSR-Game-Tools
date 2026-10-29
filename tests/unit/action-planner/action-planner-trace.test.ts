import { ordinaryNode } from '../../fixtures/action-planner/ordinary-node'
import { describe, expect, it } from 'vitest'
import {
  applyOperations,
  createInitialState,
  simulatePlan,
  spawnedParticipantId,
  countdownParticipantId,
  stepSimulation,
} from '../../../src/tools/action-planner/engine/engine'
import { cloneState, queueSnapshot } from '../../../src/tools/action-planner/engine/queue'

import type {
  ActorConfig,
  EffectOperation,
  SimulationPlan,
} from '../../../src/tools/action-planner/engine/types'

const actor = (id: string, speed = 100, position = 0): ActorConfig => ({
  id,
  kind: 'actor',
  name: 'Synthetic',
  camp: 'ally',
  position,
  baseSpeed: 100,
  panelSpeed: speed,
})
const target = (...participantIds: string[]) => ({ kind: 'participants' as const, participantIds })
const gauge = (
  id: string,
  participantId: string,
  type: 'advance' | 'delay',
  percent: number,
): EffectOperation => ({ id, type, target: target(participantId), percent })
const plan = (operations: EffectOperation[] = []): SimulationPlan => ({
  cycleMode: 'none',
  aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
  actors: [actor('a', 200), actor('b', 100, 1)],
  events: [{ anchor: { kind: 'start' }, operations }],
  maxNodes: 6,
  maxAV: 600,
})

describe('committed action-change traces', () => {
  it('traces immediate multi-target actions at actual SPD without changing zero-AV order', () => {
    const input = plan([
      { id: 'immediate', type: 'immediatelyAct', target: { kind: 'allies' } },
      { id: 'insert', type: 'immediatelyAct', target: target('b') },
      { id: 'same-position', type: 'immediatelyAct', target: target('b') },
    ])
    const result = simulatePlan(input)
    expect(
      result.records.slice(0, 2).map((r) => [ordinaryNode(r).id, r.elapsedAV, r.deltaAV]),
    ).toEqual([
      ['b', 0, 0],
      ['a', 0, 0],
    ])
    const b = result.records[0]!
    expect(b.actionChanges.map((c) => [c.operationId, c.deltaAV, c.zeroAVInsertion])).toEqual([
      ['immediate', -100, false],
      ['insert', 0, true],
      ['same-position', 0, false],
    ])
    expect(b.actionChanges.every((c) => c.type === 'immediatelyAct')).toBe(true)
    expect(b.actionChanges[0]).toMatchObject({
      sourceAnchor: { kind: 'start' },
      targetAnchor: b.anchor,
      beforeAG: 10000,
      afterAG: 0,
      effectiveSpeed: 100,
    })
    expect(
      result.records.find(
        (r) => ordinaryNode(r).id === 'b' && r.anchor.kind === 'action' && r.anchor.turn === 2,
      )?.actionChanges,
    ).toEqual([])
    const pending = applyOperations(createInitialState(input), input.events[0]!.operations, {
      kind: 'start',
    }).state
    const snapshot = queueSnapshot(pending)
    const copy = cloneState(pending)
    pending.participants[1]!.pendingActionChanges[0]!.targetAnchor.participantId = 'mutated'
    expect(snapshot.queue[0]!.actionChanges[0]!.targetAnchor.participantId).toBe('b')
    expect(copy.participants[1]!.pendingActionChanges[0]!.targetAnchor.participantId).toBe('b')
    expect(input).not.toHaveProperty('actionChanges')
  })

  it('binds immediate self changes to the next turn and excludes invalid or failed commits', () => {
    const input = plan()
    input.events.push({
      anchor: { kind: 'action', participantId: 'a', turn: 1 },
      operations: [
        { id: 'ignored', type: 'immediatelyAct', target: target('a'), phase: 'preAction' },
        { id: 'self', type: 'immediatelyAct', target: target('a'), phase: 'postAction' },
      ],
    })
    const result = simulatePlan(input)
    expect(result.records[0]!.actionChanges).toEqual([])
    expect(result.records[1]!.actionChanges).toEqual([
      expect.objectContaining({
        operationId: 'self',
        targetAnchor: { kind: 'action', participantId: 'a', turn: 2 },
      }),
    ])
    const state = createInitialState(plan())
    const skipped = applyOperations(
      state,
      [{ id: 'missing', type: 'immediatelyAct', target: target('absent') }],
      { kind: 'start' },
    )
    expect(skipped.state.participants.every((p) => !p.pendingActionChanges.length)).toBe(true)
    expect(() =>
      applyOperations(
        state,
        [
          { id: 'immediate', type: 'immediatelyAct', target: target('b') },
          {
            id: 'bad-speed',
            type: 'addSpeedModifier',
            target: target('b'),
            mode: 'flat',
            amount: -200,
            duration: { kind: 'turns', turns: null },
          },
        ],
        { kind: 'start' },
      ),
    ).toThrow()
    expect(state.participants.every((p) => !p.pendingActionChanges.length)).toBe(true)
    const timer = spawnedParticipantId('timer')
    const eventState = applyOperations(
      state,
      [
        {
          id: 'timer',
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'Timer', speed: 70 },
        },
      ],
      { kind: 'start' },
    ).state
    const invalid = applyOperations(
      eventState,
      [{ id: 'invalid', type: 'immediatelyAct', target: target(timer) }],
      { kind: 'start' },
    )
    expect(invalid.diagnostics[0]?.code).toBe('invalid-target')
    expect(invalid.state.participants.every((p) => !p.pendingActionChanges.length)).toBe(true)
  })
  it('records each instantaneous change at its own SPD on the affected action, then clears the next cycle', () => {
    const input = plan()
    input.events.push({
      anchor: { kind: 'action', participantId: 'a', turn: 1 },
      operations: [
        { ...gauge('pull', 'b', 'advance', 20), phase: 'preAction' },
        {
          id: 'speed',
          type: 'addSpeedModifier',
          target: target('b'),
          mode: 'flat',
          amount: 100,
          duration: { kind: 'turns', turns: null },
          phase: 'preAction',
        },
        { ...gauge('push', 'b', 'delay', 10), phase: 'postAction' },
        { ...gauge('clamp', 'b', 'advance', 100), phase: 'postAction' },
      ],
    })
    const result = simulatePlan(input)
    expect(result.records[0].actionChanges).toEqual([])
    const affected = result.records.find((record) => ordinaryNode(record).id === 'b')!
    expect(
      affected.actionChanges.map(({ operationId, deltaAV, effectiveSpeed }) => [
        operationId,
        deltaAV,
        effectiveSpeed,
      ]),
    ).toEqual([
      ['pull', -20, 100],
      ['push', 5, 200],
      ['clamp', -20, 200],
    ])
    expect(affected.actionChanges[0]).toMatchObject({
      beforeAG: 5000,
      afterAG: 3000,
      elapsedAV: 50,
      sourceAnchor: { kind: 'action', participantId: 'a', turn: 1 },
      targetAnchor: affected.anchor,
    })
    expect(
      result.records.find(
        (record) =>
          record.anchor.kind === 'action' &&
          ordinaryNode(record).id === 'b' &&
          record.anchor.turn === 2,
      )!.actionChanges,
    ).toEqual([])
    expect(simulatePlan(input)).toEqual(result)
  })

  it('uses actual clamped AG rather than the requested percentage', () => {
    const input = plan([gauge('clamped', 'b', 'advance', 80)])
    input.actors[1].initialAG = 6000
    const change = simulatePlan(input).records[0].actionChanges[0]
    expect(change).toMatchObject({ beforeAG: 6000, afterAG: 0, effectiveSpeed: 100, deltaAV: -60 })
  })

  it('retains zero-AV refreshes but flags insertion only when the target really moves ahead', () => {
    const input = plan()
    input.actors = [actor('a'), actor('b', 100, 1), actor('c', 100, 2)]
    input.events[0].operations = [
      { id: 'group', type: 'advance', target: { kind: 'allies' }, percent: 100 },
      gauge('repull', 'b', 'advance', 100),
      gauge('same-rank', 'b', 'advance', 100),
      { id: 'group-refresh', type: 'advance', target: { kind: 'allies' }, percent: 100 },
      gauge('zero-percent', 'c', 'advance', 0),
    ]
    const result = simulatePlan(input)
    expect(result.records.slice(0, 3).map((r) => ordinaryNode(r).id)).toEqual(['b', 'a', 'c'])
    expect(
      result.records[0].actionChanges.map(({ operationId, deltaAV, zeroAVInsertion }) => [
        operationId,
        deltaAV,
        zeroAVInsertion,
      ]),
    ).toEqual([
      ['group', -100, false],
      ['repull', 0, true],
      ['same-rank', 0, false],
      ['group-refresh', 0, false],
    ])
    expect(result.records[2].actionChanges.at(-1)).toMatchObject({
      operationId: 'zero-percent',
      deltaAV: 0,
      zeroAVInsertion: false,
    })
  })

  it('excludes the active pre-action target and binds post-action self changes to the next turn', () => {
    const input = plan()
    input.events.push({
      anchor: { kind: 'action', participantId: 'a', turn: 1 },
      operations: [
        { ...gauge('ignored', 'a', 'advance', 100), phase: 'preAction' },
        { ...gauge('next-turn', 'a', 'advance', 100), phase: 'postAction' },
      ],
    })
    const result = simulatePlan(input)
    expect(result.records[0].actionChanges).toEqual([])
    expect(result.records[1].actionChanges).toHaveLength(1)
    expect(result.records[1].actionChanges[0]).toMatchObject({
      operationId: 'next-turn',
      targetAnchor: { kind: 'action', participantId: 'a', turn: 2 },
    })
    expect(
      result.records.find(
        (record) =>
          record.anchor.kind === 'action' &&
          ordinaryNode(record).id === 'a' &&
          record.anchor.turn === 3,
      )!.actionChanges,
    ).toEqual([])
    input.actors[0].actionLimit = 1
    expect(simulatePlan(input).snapshots[1].queue.some(({ id }) => id === 'a')).toBe(false)
  })

  it('binds same-name dynamic actors and shared countdowns by stable identity and removes consumed history', () => {
    const child = spawnedParticipantId('child'),
      timer = countdownParticipantId('speed')
    const input = plan([
      {
        id: 'child',
        type: 'spawnParticipant',
        participant: {
          kind: 'actor',
          name: 'Synthetic',
          camp: 'ally',
          baseSpeed: 100,
          panelSpeed: 100,
          actionLimit: 1,
        },
      },
      gauge('child-pull', child, 'advance', 50),
      {
        id: 'speed',
        type: 'addSpeedModifier',
        target: { kind: 'allies' },
        mode: 'flat',
        amount: 20,
        duration: { kind: 'countdown', name: 'Synthetic', speed: 70 },
      },
      gauge('timer-delay', timer, 'delay', 10),
    ])
    input.maxNodes = 12
    const result = simulatePlan(input)
    const childRecord = result.records.find((r) => ordinaryNode(r).id === child)!
    const timerRecord = result.records.find((r) => ordinaryNode(r).id === timer)!
    expect(childRecord.actionChanges.map(({ operationId }) => operationId)).toEqual(['child-pull'])
    expect(timerRecord.actionChanges[0]).toMatchObject({
      operationId: 'timer-delay',
      targetAnchor: { kind: 'trigger', participantId: timer },
      deltaAV: 1000 / 70,
    })
    expect(
      result.records.filter((r) => ordinaryNode(r).id === child || ordinaryNode(r).id === timer),
    ).toHaveLength(2)
    expect(result.snapshots.at(-1)!.queue.every(({ id }) => id !== child && id !== timer)).toBe(
      true,
    )
    input.events[0].operations = input.events[0].operations.filter(({ id }) => id !== 'child-pull')
    expect(
      ordinaryNode(simulatePlan(input).records.find((r) => ordinaryNode(r).id === child)!)
        .actionChanges,
    ).toEqual([])
  })

  it('keeps skipped and failed operations out of committed history and never publishes a failed node', () => {
    const input = createInitialState(plan())
    const skipped = applyOperations(input, [gauge('missing', 'absent', 'advance', 50)], {
      kind: 'start',
    })
    expect(skipped.diagnostics[0].code).toBe('missing-target')
    expect(
      skipped.state.participants.every(({ pendingActionChanges }) => !pendingActionChanges.length),
    ).toBe(true)
    const operations: EffectOperation[] = [
      { ...gauge('pull', 'b', 'advance', 20), phase: 'preAction' },
      {
        id: 'bad-speed',
        type: 'addSpeedModifier',
        target: target('b'),
        mode: 'flat',
        amount: -200,
        duration: { kind: 'turns', turns: null },
        phase: 'preAction',
      },
    ]
    expect(() => stepSimulation(input, operations)).toThrow()
    expect(
      input.participants.every(({ pendingActionChanges }) => !pendingActionChanges.length),
    ).toBe(true)
    const failed = plan()
    failed.events.push({ anchor: { kind: 'action', participantId: 'a', turn: 1 }, operations })
    const result = simulatePlan(failed)
    expect(result.stopReason).toBe('error')
    expect(result.records).toEqual([])
    expect(result.snapshots).toHaveLength(1)
    expect(result.snapshots[0].queue.every(({ actionChanges }) => !actionChanges.length)).toBe(true)
  })

  it('copies pending traces into snapshots and clones without sharing mutable anchors', () => {
    const initial = createInitialState(plan())
    const state = applyOperations(initial, [gauge('pull', 'b', 'advance', 20)], {
      kind: 'start',
    }).state
    const snapshot = queueSnapshot(state),
      copy = cloneState(state)
    const pending = state.participants.find(({ id }) => id === 'b')!.pendingActionChanges[0]
    pending.targetAnchor.participantId = 'mutated'
    pending.deltaAV = 123
    expect(snapshot.queue.find(({ id }) => id === 'b')!.actionChanges[0].deltaAV).toBe(-20)
    expect(
      copy.participants.find(({ id }) => id === 'b')!.pendingActionChanges[0].targetAnchor
        .participantId,
    ).toBe('b')
    expect(
      initial.participants.every(({ pendingActionChanges }) => !pendingActionChanges.length),
    ).toBe(true)
  })

  it('shows only already committed history in queue projections and preserves the completed history separately', () => {
    const input = plan()
    input.events.push({
      anchor: { kind: 'action', participantId: 'a', turn: 1 },
      operations: [{ ...gauge('future-pull', 'b', 'advance', 20), phase: 'preAction' }],
    })
    const result = simulatePlan(input)
    expect(result.snapshots[0].queue.find(({ id }) => id === 'b')!).toMatchObject({
      actionChanges: [],
    })
    expect(result.snapshots[1].queue.find(({ id }) => id === 'b')!).toMatchObject({
      actionChanges: [expect.objectContaining({ operationId: 'future-pull' })],
    })
    expect(result.records.find((r) => ordinaryNode(r).id === 'b')!).toMatchObject({
      actionChanges: [expect.objectContaining({ operationId: 'future-pull' })],
    })
    expect(result.snapshots[2].queue.find(({ id }) => id === 'b')!.actionChanges).toEqual([])
  })
})
