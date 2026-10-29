import { ordinaryNode } from '../../fixtures/action-planner/ordinary-node'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import {
  contextAt,
  operationDraft,
  buildOperation,
} from '../../../src/tools/action-planner/model/editor'
import {
  actionDirections,
  operationNameDescriptor,
  namingTargets,
  participantLabels,
} from '../../../src/tools/action-planner/model/naming'
import {
  applyOperations,
  createInitialState,
  simulatePlan,
} from '../../../src/tools/action-planner/engine/engine'
import {
  anchorKey,
  countdownParticipantId,
  spawnedParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import {
  operationTargets,
  selectableTargets,
} from '../../../src/tools/action-planner/engine/targeting'
import type {
  EffectOperation,
  EventAnchor,
  SimulationPlan,
} from '../../../src/tools/action-planner/engine/types'
const a: EventAnchor = { kind: 'action', participantId: 'a', turn: 1 }
const start: EventAnchor = { kind: 'start' }
const target = (...participantIds: string[]) => ({ kind: 'participants' as const, participantIds })
const plan = (): SimulationPlan => ({
  cycleMode: 'none',
  aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
  actors: ['a', 'b'].map((id, position) => ({
    id,
    name: id,
    kind: 'actor',
    camp: 'ally',
    baseSpeed: 100,
    panelSpeed: position === 0 ? 200 : 100,
    position,
  })),
  events: [],
  maxNodes: 8,
  maxAV: 600,
})
const spawn: EffectOperation = {
  id: 'spawn',
  type: 'spawnParticipant',
  participant: {
    kind: 'actor',
    category: 'summon',
    name: '龙灵',
    camp: 'ally',
    baseSpeed: 100,
    panelSpeed: 130,
    actionLimit: 2,
  },
}
const names = (id: string) =>
  ({ a: 'A', b: 'B', [spawnedParticipantId('spawn')]: '龙灵' })[id] ?? id

describe('real planner document and drafts', () => {
  it('defaults only new drafts to post-action and preserves implicit legacy pre-action', () => {
    expect(operationDraft().phase).toBe('postAction')
    expect(
      operationDraft({ id: '', type: 'advance', target: target('b'), percent: 40 }).phase,
    ).toBe('postAction')
    expect(
      operationDraft({ id: 'old', type: 'advance', target: target('b'), percent: 40 }).phase,
    ).toBe('preAction')
    expect(
      operationDraft({
        id: 'old',
        type: 'advance',
        target: target('b'),
        percent: 40,
        phase: 'postAction',
      }).phase,
    ).toBe('postAction')
  })
  it('treats preset templates with empty IDs as new operations', () => {
    const draft = operationDraft({ id: '', type: 'advance', target: target('b'), percent: 40 })
    expect(draft.id).toBeUndefined()
    expect(draft.original).toBeUndefined()
    expect(
      buildOperation(draft, 'new-preset', start, createInitialState(plan())).operation,
    ).toMatchObject({ id: 'new-preset', percent: 40 })
  })

  it('starts empty with engine defaults', () => {
    const p = useActionPlanner()
    expect(p.plan.value).toEqual({
      cycleMode: 'none',
      aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
      actors: [],
      events: [],
      maxNodes: 60,
      maxAV: 600,
    })
    expect(p.stage.value).toBe('setup')
    const other = useActionPlanner()
    expect(other.plan.value).not.toBe(p.plan.value)
    expect(other.plan.value.actors).not.toBe(p.plan.value.actors)
    expect(other.plan.value.events).not.toBe(p.plan.value.events)
    expect(other.plan.value.aha).not.toBe(p.plan.value.aha)
    expect(other.plan.value.aha.contributorIds).not.toBe(p.plan.value.aha.contributorIds)
  })
  it.each(['advance', 'delay', 'immediatelyAct', 'addSpeedModifier', 'spawnParticipant'] as const)(
    'submits %s to the real plan',
    (type) => {
      const p = useActionPlanner(plan())
      p.select(a)
      p.edit()
      const d = p.draft.value!
      d.type = type
      d.selectedIds = ['b']
      d.participant.name = '龙灵'
      d.participant.category = 'summon'
      d.amount = 60
      expect(p.submit()).toBe(true)
      expect(p.plan.value.events[0]!.operations[0]!.type).toBe(type)
      expect(p.result.value).toEqual(simulatePlan(p.plan.value))
      if (type === 'immediatelyAct') {
        expect(ordinaryNode(p.result.value.records[1]!).id).toBe('b')
        expect(p.result.value.records[1]!.deltaAV).toBe(0)
        expect(p.plan.value.events[0]!.operations[0]).not.toHaveProperty('percent')
      }
    },
  )
  it('preserves IDs, moves only in-window, and clears custom metadata on deletion', () => {
    const input = plan()
    input.events = [
      {
        anchor: a,
        operations: [
          { id: 'x', type: 'advance', target: target('b'), percent: 30, phase: 'postAction' },
          { id: 'y', type: 'delay', target: target('b'), percent: 10, phase: 'postAction' },
        ],
      },
    ]
    const p = useActionPlanner(input, { customNames: { x: 'Custom' }, characterIds: {} })
    p.select(a)
    p.edit(p.operations.value[0])
    p.draft.value!.percent = 50
    expect(p.submit()).toBe(true)
    expect(p.operations.value[0]).toMatchObject({ id: 'x', percent: 50 })
    expect(p.document.value.metadata.customNames.x).toBe('Custom')
    p.move('y', -1)
    expect(p.operations.value.map((o) => o.id)).toEqual(['y', 'x'])
    p.edit(p.operations.value[1])
    p.draft.value!.phase = 'preAction'
    p.submit()
    expect(p.operations.value.find((o) => o.id === 'x')?.phase).toBe('preAction')
    p.remove('x')
    expect(p.document.value.metadata.customNames).toEqual({})
  })
  it('cancels and navigates without committing, including stage and view switches', () => {
    const p = useActionPlanner(plan())
    const before = p.plan.value
    p.edit()
    p.draft.value!.amount = 99
    p.cancel()
    expect(p.plan.value).toBe(before)
    p.edit()
    p.select(a)
    expect(p.draft.value).toBeUndefined()
    p.edit()
    p.stage.value = 'planning'
    expect(p.draft.value).toBeUndefined()
    p.edit()
    p.view.value = 'queue'
    expect(p.draft.value).toBeUndefined()
  })
  it('renames metadata without simulation replay and clears to automatic naming', () => {
    const input = plan()
    input.events = [
      {
        anchor: start,
        operations: [{ type: 'advance', percent: 20, target: target('b'), id: 'x' }],
      },
    ]
    const p = useActionPlanner(input)
    const before = p.result.value
    p.edit(p.operations.value[0])
    p.draft.value!.customName = 'My pull'
    p.submit()
    expect(p.result.value).toBe(before)
    expect(p.document.value.metadata.customNames.x).toBe('My pull')
    p.edit(p.operations.value[0])
    p.draft.value!.customName = '  '
    p.submit()
    expect(p.document.value.metadata.customNames.x).toBeUndefined()
    expect(p.result.value).toBe(before)
  })
  it('keeps unreachable anchors when the team or budget changes', () => {
    const p = useActionPlanner(plan())
    p.select({ kind: 'action', participantId: 'b', turn: 6 })
    p.replacePlan({
      ...p.plan.value,
      events: [
        {
          anchor: { kind: 'action', participantId: 'b', turn: 6 },
          operations: [
            { id: 'late', type: 'immediatelyAct', target: target('a'), phase: 'postAction' },
          ],
        },
      ],
    })
    p.applySetup([p.plan.value.actors[0]!], 2, 100, {})
    expect(p.unreached.value[0]!.anchor).toEqual({ kind: 'action', participantId: 'b', turn: 6 })
    expect(p.selected.value).toMatchObject({ participantId: 'b' })
    expect(p.result.value.diagnostics.some((d) => d.code === 'unreached-anchor')).toBe(true)
    p.deleteEvent(p.unreached.value[0]!.anchor)
    expect(p.plan.value.events).toEqual([])
  })
  it('previews preceding creations and changing phase changes available targets', () => {
    const input = plan()
    input.events = [
      {
        anchor: a,
        operations: [
          { ...spawn, phase: 'preAction' },
          { id: 'later', type: 'advance', target: target('b'), percent: 20, phase: 'preAction' },
        ],
      },
    ]
    const p = useActionPlanner(input)
    p.select(a)
    p.edit(p.operations.value[1])
    expect(p.targets.value.some((x) => x.id === spawnedParticipantId('spawn'))).toBe(true)
    p.edit(p.operations.value[0])
    expect(p.targets.value.some((x) => x.id === spawnedParticipantId('spawn'))).toBe(false)
  })
  it('shares one countdown, enforces target restrictions and accepts unlimited turns', () => {
    const p = useActionPlanner(plan())
    p.edit()
    let d = p.draft.value!
    d.type = 'addSpeedModifier'
    d.selectedIds = ['a', 'b']
    d.duration.kind = 'countdown'
    d.duration.countdownName = 'Clock'
    d.duration.countdownSpeed = 70
    expect(p.submit()).toBe(true)
    const id = p.operations.value[0]!.id
    expect(p.plan.value.events[0]!.operations).toHaveLength(1)
    expect(
      p.result.value.participants.filter((x) => x.id === countdownParticipantId(id)),
    ).toHaveLength(1)
    p.edit()
    d = p.draft.value!
    d.selectedIds = [countdownParticipantId(id)]
    expect(p.submit()).toBe(true)
    p.edit()
    d = p.draft.value!
    d.type = 'immediatelyAct'
    d.selectedIds = [countdownParticipantId(id)]
    expect(p.submit()).toBe(false)
    d.type = 'addSpeedModifier'
    d.selectedIds = ['a']
    d.duration.turns = ''
    expect(p.submit()).toBe(true)
    expect(p.operations.value.at(-1)).toMatchObject({ duration: { kind: 'turns', turns: null } })
  })
  it('recovers failed-operation context and repairs runtime invalid speed', () => {
    const input = plan()
    input.events = [
      {
        anchor: a,
        operations: [
          {
            id: 'bad',
            type: 'addSpeedModifier',
            target: target('b'),
            mode: 'flat',
            amount: -200,
            duration: { kind: 'turns', turns: null },
            phase: 'postAction',
          },
        ],
      },
    ]
    const p = useActionPlanner(input)
    expect(p.result.value.stopReason).toBe('error')
    expect(contextAt(input, p.result.value, a)?.elapsedAV).toBe(50)
    p.select(a)
    p.edit(p.operations.value[0])
    p.draft.value!.amount = 20
    expect(p.submit()).toBe(true)
    expect(p.result.value.stopReason).not.toBe('error')
  })
  it('rejects invalid targets, respects asymmetric gauge semantics and locks spawn kind', () => {
    const state = createInitialState(plan())
    const d = operationDraft()
    d.selectedIds = ['missing']
    expect(buildOperation(d, 'x', start, state).invalid).toContain('target')
    d.selectedIds = ['b']
    d.percent = 150
    expect(buildOperation(d, 'x', start, state).operation).toMatchObject({ percent: 150 })
    d.type = 'delay'
    expect(buildOperation(d, 'x', start, state).operation).toMatchObject({ percent: 150 })
    const locked = operationDraft(spawn)
    locked.participant.kind = 'scheduledEvent'
    expect(buildOperation(locked, 'spawn', start, state).invalid).toContain('form')
  })
  it('switching hidden duration fields does not leak parameters', async () => {
    const p = useActionPlanner(plan())
    p.edit()
    p.draft.value!.type = 'addSpeedModifier'
    p.draft.value!.duration.kind = 'countdown'
    p.draft.value!.duration.countdownName = ''
    expect(p.submit()).toBe(false)
    p.draft.value!.duration.kind = 'turns'
    await nextTick()
    expect(p.invalid.value).toEqual([])
    expect(p.submit()).toBe(true)
    expect(p.operations.value[0]).not.toHaveProperty('duration.name')
  })
})

describe('presentation names and affected-action arrows', () => {
  it('describes targets, directions and creation categories without translated copy', () => {
    const state = applyOperations(createInitialState(plan()), [spawn], start).state
    const group: EffectOperation = {
      id: 'x',
      type: 'advance',
      target: { kind: 'allies' },
      percent: 50,
    }
    expect(namingTargets(group, state)).toEqual(['a', 'b', spawnedParticipantId('spawn')])
    expect(operationNameDescriptor(group, names, state)).toEqual({
      key: 'planner.operationName.advance',
      params: { target: { key: 'planner.target.count', params: { count: 3 } }, percent: 50 },
    })
    expect(operationNameDescriptor({ ...group, target: target('b') }, names, state)).toEqual({
      key: 'planner.operationName.advance',
      params: { target: 'B', percent: 50 },
    })
    expect(operationNameDescriptor(group, names).params?.target).toEqual({
      key: 'planner.target.allies',
    })
    expect(operationNameDescriptor(spawn, names)).toEqual({
      key: 'planner.operationName.createSummon',
      params: { name: '龙灵' },
    })
    if (spawn.participant.kind !== 'actor') throw new Error('fixture')
    for (const [category, key] of [
      ['memosprite', 'createMemosprite'],
      ['custom', 'createActor'],
    ] as const)
      expect(
        operationNameDescriptor(
          { ...spawn, participant: { ...spawn.participant, category } },
          names,
        ).key,
      ).toBe('planner.operationName.' + key)
    expect(
      operationNameDescriptor(
        { ...spawn, participant: { ...spawn.participant, camp: 'enemy' } },
        names,
      ).key,
    ).toBe('planner.operationName.createEnemy')
    expect(
      operationNameDescriptor(
        {
          id: 'event',
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'Clock', speed: 70 },
        },
        names,
      ),
    ).toEqual({ key: 'planner.operationName.createEvent', params: { name: 'Clock' } })
    const speed: EffectOperation = {
      id: 'speed',
      type: 'addSpeedModifier',
      target: target('b'),
      mode: 'percent',
      amount: -15.5,
      duration: { kind: 'turns', turns: null },
    }
    expect(operationNameDescriptor(speed, names, state)).toEqual({
      key: 'planner.operationName.decreasePercent',
      params: { target: 'B', amount: 15.5 },
    })
    expect(operationNameDescriptor({ ...speed, amount: 20, mode: 'flat' }, names, state).key).toBe(
      'planner.operationName.increaseFlat',
    )
  })
  it('stable same-name labels use IDs instead of queue order', () => {
    const labels = participantLabels(
      [
        { id: 'z', kind: 'actor', name: 'Same' },
        { id: 'a', kind: 'actor', name: 'Same' },
      ],
      () => 'Same',
    )
    expect(labels.get('a')).toBe('Same #1')
    expect(labels.get('z')).toBe('Same #2')
  })
  it('marks affected B, not source A; preserves both directions and resets after deletion', () => {
    const input = plan()
    input.events = [
      {
        anchor: a,
        operations: [
          { id: 'pull', type: 'advance', target: target('b'), percent: 20, phase: 'preAction' },
          { id: 'push', type: 'delay', target: target('b'), percent: 10, phase: 'postAction' },
        ],
      },
    ]
    const result = simulatePlan(input)
    expect(actionDirections(a, result.records[0]!.actionChanges)).toEqual({
      advance: false,
      delay: false,
      immediatelyAct: false,
    })
    const b = result.records.find((r) => ordinaryNode(r).id === 'b')!
    expect(actionDirections(b.anchor, b.actionChanges)).toEqual({
      advance: true,
      delay: true,
      immediatelyAct: false,
    })
    expect(actionDirections(a, b.actionChanges)).toEqual({
      advance: false,
      delay: false,
      immediatelyAct: false,
    })
    const queue = result.snapshots[1]!.queue.find((q) => q.id === 'b')!
    expect(actionDirections(queue.anchor, queue.actionChanges)).toEqual({
      advance: true,
      delay: true,
      immediatelyAct: false,
    })
    const plain = simulatePlan({ ...input, events: [] }).records.find(
      (r) => ordinaryNode(r).id === 'b',
    )!
    expect(actionDirections(plain.anchor, plain.actionChanges)).toEqual({
      advance: false,
      delay: false,
      immediatelyAct: false,
    })
  })
  it('retains zero-AV insertion and shows legal zero-percent effects', () => {
    const input = plan()
    input.events = [
      {
        anchor: start,
        operations: [
          { id: 'pull', type: 'advance', target: { kind: 'allies' }, percent: 100 },
          { id: 'again', type: 'advance', target: target('b'), percent: 100 },
        ],
      },
    ]
    const r = simulatePlan(input).records[0]!
    const insertion = r.actionChanges.filter((c) => c.zeroAVInsertion)
    expect(insertion).toHaveLength(1)
    expect(actionDirections(r.anchor, insertion).advance).toBe(true)
    const zero = simulatePlan({
      ...plan(),
      events: [
        {
          anchor: start,
          operations: [{ id: 'noop', type: 'advance', target: target('b'), percent: 0 }],
        },
      ],
    }).records.find((r) => ordinaryNode(r).id === 'b')!
    expect(actionDirections(zero.anchor, zero.actionChanges).advance).toBe(true)
  })
  it('the triggering event has left targeting eligibility', () => {
    const event: EffectOperation = {
      id: 'clock',
      type: 'spawnParticipant',
      participant: { kind: 'scheduledEvent', name: 'Clock', speed: 300 },
    }
    const input = plan()
    input.events = [{ anchor: start, operations: [event] }]
    const result = simulatePlan(input)
    const r = result.records[0]!
    expect(anchorKey(r.anchor)).toBe(
      anchorKey({ kind: 'trigger', participantId: spawnedParticipantId('clock') }),
    )
    const available = operationTargets(r.beforeEffects)
    expect(available.some((p) => p.id === spawnedParticipantId('clock'))).toBe(false)
    expect(
      selectableTargets('immediatelyAct', available, []).every((p) => p.kind === 'actor'),
    ).toBe(true)
  })
})
