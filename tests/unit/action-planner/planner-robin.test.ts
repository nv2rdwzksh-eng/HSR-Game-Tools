import { describe, expect, it } from 'vitest'
import { effectScope, watch } from 'vue'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import {
  buildRobinPreset,
  robinPresetAvailability,
} from '../../../src/tools/action-planner/model/presets'
import {
  emptyDocument,
  parsePlannerDocument,
  serializePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'
import { createPlannerPersistence } from '../../../src/tools/action-planner/model/persistence'
import { operationsAt, type PlannerDocument } from '../../../src/tools/action-planner/model/editor'
import {
  applyOperations,
  createInitialState,
  simulatePlan,
} from '../../../src/tools/action-planner/engine/engine'
import {
  advanceTime,
  FULL_AG,
  spawnedParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import type { EffectOperation, EventAnchor } from '../../../src/tools/action-planner/engine/types'

const start: EventAnchor = { kind: 'start' }
const input = { name: 'Synthetic Concerto' }
const target = (id: string) => ({ kind: 'participants' as const, participantIds: [id] })
function fixture(position = 3): PlannerDocument {
  const document = emptyDocument()
  const ids = ['a', 'b', 'c']
  ids.splice(position, 0, 'r')
  document.plan.actors = ids.map((id, position) => ({
    id,
    kind: 'actor',
    name: id === 'r' ? 'User renamed this actor' : id,
    camp: 'ally',
    position,
    baseSpeed: 100,
    panelSpeed: id === 'b' ? 150 : id === 'c' ? 120 : 100,
  }))
  document.metadata.characterIds = { r: '1309' }
  document.plan.maxNodes = 30
  return document
}
function planner(document = fixture()) {
  const p = useActionPlanner(document.plan, document.metadata, document.name)
  p.edit()
  return p
}
type Planner = ReturnType<typeof planner>
const allOps = (p: Planner) => p.plan.value.events.flatMap((event) => event.operations)
const spawn = (p: Planner) => allOps(p).find((op) => op.type === 'spawnParticipant')!
const trigger = (p: Planner): EventAnchor => ({
  kind: 'trigger',
  participantId: spawnedParticipantId(spawn(p).id),
})

describe('Robin ordinary-operation batch preset', () => {
  it.each([0, 1, 2, 3])(
    'identifies renamed Robin in position %s and builds five ordinary operations',
    (position) => {
      const p = planner(fixture(position))
      const before = p.document.value
      expect(p.submitRobin(input)).toBe(true)
      const operations = operationsAt(p.plan.value, start)
      expect(operations.map((op) => op.type)).toEqual([
        'depart',
        'immediatelyAct',
        'spawnParticipant',
      ])
      expect(operations[0]).toMatchObject({ target: target('r') })
      expect(operations[1]).toMatchObject({ target: { kind: 'allies' } })
      expect(spawn(p).participant).toEqual({
        kind: 'scheduledEvent',
        name: input.name,
        speed: 90,
        initialAG: FULL_AG,
      })
      const returned = operationsAt(p.plan.value, trigger(p))
      expect(returned.map((op) => op.type)).toEqual(['returnToField', 'immediatelyAct'])
      expect(
        returned.every(
          (op) =>
            op.type !== 'spawnParticipant' &&
            op.type !== 'restoreSkillPoints' &&
            op.target.kind === 'participants' &&
            op.target.participantIds[0] === 'r',
        ),
      ).toBe(true)
      expect(allOps(p)).toHaveLength(5)
      expect(allOps(p).every((op) => op.phase === undefined)).toBe(true)
      expect(new Set(allOps(p).map((op) => op.id)).size).toBe(5)
      expect(p.result.value.diagnostics).toEqual([])
      expect(before.plan.events).toEqual([])
    },
  )

  it('orders the ally batch by the pre-operation queue and returns Robin at zero AV', () => {
    const p = planner()
    p.submitRobin(input)
    const records = p.result.value.records
    expect(
      records.slice(0, 3).map((r) => [r.kind !== 'cycleBoundary' && r.id, r.elapsedAV]),
    ).toEqual([
      ['b', 0],
      ['c', 0],
      ['a', 0],
    ])
    const teamId = operationsAt(p.plan.value, start)[1]!.id
    expect(
      records
        .slice(0, 3)
        .every((r) => r.actionChanges.some((change) => change.operationId === teamId)),
    ).toBe(true)
    const index = records.findIndex((r) => r.kind === 'scheduledEvent')
    expect(records[index]!.elapsedAV).toBeCloseTo(FULL_AG / 90, 10)
    expect(records[index + 1]).toMatchObject({
      id: 'r',
      deltaAV: 0,
      elapsedAV: records[index]!.elapsedAV,
    })
    expect(records.slice(0, index).some((r) => r.kind !== 'cycleBoundary' && r.id === 'r')).toBe(
      false,
    )
    expect(records[index + 1]!.actionChanges).toMatchObject([
      { type: 'immediatelyAct', beforeAG: FULL_AG, afterAG: 0 },
    ])
  })

  it('uses the insertion preview, excluding departed allies and including spawned allied actors', () => {
    const document = fixture()
    document.plan.events = [
      {
        anchor: start,
        operations: [
          { id: 'leave-c', type: 'depart', target: target('c') },
          {
            id: 'summon',
            type: 'spawnParticipant',
            participant: {
              kind: 'actor',
              camp: 'ally',
              name: 'Synthetic summon',
              baseSpeed: 200,
              panelSpeed: 200,
            },
          },
        ],
      },
    ]
    document.metadata.customNames = { 'leave-c': 'Keep this name' }
    const p = planner(document)
    expect(p.submitRobin(input)).toBe(true)
    expect(operationsAt(p.plan.value, start).slice(0, 2)).toEqual(
      document.plan.events[0]!.operations,
    )
    expect(p.document.value.metadata.customNames).toEqual(document.metadata.customNames)
    expect(
      p.result.value.records.slice(0, 3).map((r) => r.kind !== 'cycleBoundary' && r.id),
    ).toEqual(['spawn:summon', 'b', 'a'])
    expect(p.result.value.records.some((r) => r.kind !== 'cycleBoundary' && r.id === 'c')).toBe(
      false,
    )
  })

  it('freezes Robin AG and keeps return and immediatelyAct as separate semantics', () => {
    const p = planner()
    p.submitRobin(input)
    let state = applyOperations(
      createInitialState(p.plan.value),
      operationsAt(p.plan.value, start),
      start,
    ).state
    advanceTime(state, 40)
    expect(state.participants.find((p) => p.id === 'r')).toMatchObject({
      departed: true,
      remainingAG: FULL_AG,
    })
    const countdown = p.result.value.records.find((r) => r.kind === 'scheduledEvent')!
    expect(countdown.beforeEffects.participants.find((p) => p.id === 'r')).toMatchObject({
      departed: true,
      remainingAG: FULL_AG,
    })
    const returned = operationsAt(p.plan.value, trigger(p))
    state = applyOperations(countdown.beforeEffects, returned.slice(0, 1), trigger(p)).state
    expect(state.participants.find((p) => p.id === 'r')).toMatchObject({
      departed: false,
      remainingAG: FULL_AG,
      turns: 0,
      pendingActionChanges: [],
    })
    state = applyOperations(state, returned.slice(1), trigger(p)).state
    expect(state.participants.find((p) => p.id === 'r')).toMatchObject({ remainingAG: 0, turns: 0 })
  })

  it.each([
    ['advance', 20, 8000 / 90],
    ['delay', 20, 12000 / 90],
    ['addSpeedModifier', 90, FULL_AG / 180],
  ] as const)('lets ordinary %s change the independent countdown', (type, amount, expected) => {
    const document = fixture()
    document.plan.actors.find((a) => a.id === 'r')!.panelSpeed = 777
    const p = planner(document)
    p.submitRobin(input)
    const eventId = spawnedParticipantId(spawn(p).id)
    p.edit()
    p.draft.value!.type = type
    p.draft.value!.selectedIds = [eventId]
    if (type === 'addSpeedModifier') {
      p.draft.value!.mode = 'flat'
      p.draft.value!.amount = amount
      p.draft.value!.duration.turns = ''
    } else p.draft.value!.percent = amount
    expect(p.submit()).toBe(true)
    expect(p.result.value.records.find((r) => r.kind === 'scheduledEvent')!.elapsedAV).toBeCloseTo(
      expected,
      10,
    )
  })

  it('merges an existing trigger and gives the later Robin zero batch priority', () => {
    const document = fixture()
    const anchor: EventAnchor = { kind: 'trigger', participantId: 'spawn:batch-3' }
    const existing: EffectOperation = {
      id: 'existing',
      type: 'immediatelyAct',
      target: { kind: 'allies' },
    }
    document.plan.events = [{ anchor, operations: [existing] }]
    document.metadata.customNames = { existing: 'Retained trigger operation' }
    let serial = 0
    const built = buildRobinPreset(
      document,
      start,
      'postAction',
      createInitialState(document.plan),
      input,
      () => `batch-${++serial}`,
    )
    expect(operationsAt(built.document!.plan, anchor).map((op) => op.type)).toEqual([
      'immediatelyAct',
      'returnToField',
      'immediatelyAct',
    ])
    expect(operationsAt(document.plan, anchor)).toEqual([existing])
    expect(built.document!.metadata).toEqual(document.metadata)
    const result = simulatePlan(built.document!.plan)
    const index = result.records.findIndex((r) => r.kind === 'scheduledEvent')
    expect(
      result.records
        .slice(index + 1, index + 5)
        .map((r) => [r.kind !== 'cycleBoundary' && r.id, r.deltaAV]),
    ).toEqual([
      ['r', 0],
      ['b', 0],
      ['c', 0],
      ['a', 0],
    ])
    expect(result.diagnostics).toEqual([])
  })

  it.each(['preAction', 'postAction'] as const)(
    'supports Robin own %s without interrupting the natural turn reset',
    (phase) => {
      const p = planner()
      p.select({ kind: 'action', participantId: 'r', turn: 1 })
      p.edit()
      p.draft.value!.phase = phase
      expect(p.submitRobin(input)).toBe(true)
      expect(operationsAt(p.plan.value, p.selected.value).every((op) => op.phase === phase)).toBe(
        true,
      )
      const event = p.result.value.records.find((r) => r.kind === 'scheduledEvent')!
      expect(event.beforeEffects.participants.find((p) => p.id === 'r')).toMatchObject({
        departed: true,
        remainingAG: FULL_AG,
        turns: 1,
      })
      expect(operationsAt(p.plan.value, trigger(p)).every((op) => op.phase === undefined)).toBe(
        true,
      )
    },
  )

  it('rejects an active teammate before action and accepts postAction at the actual phase tail', () => {
    const document = fixture()
    const anchor: EventAnchor = { kind: 'action', participantId: 'b', turn: 1 }
    document.plan.events = [
      {
        anchor,
        operations: [
          { id: 'before', type: 'advance', target: target('a'), percent: 0, phase: 'preAction' },
          { id: 'after', type: 'advance', target: target('c'), percent: 0, phase: 'postAction' },
        ],
      },
    ]
    const p = planner(document)
    p.select(anchor)
    p.edit()
    p.draft.value!.phase = 'preAction'
    expect(p.robinPresetIssue.value).toBe('activeAlly')
    const before = p.document.value
    const result = p.result.value
    expect(p.submitRobin(input)).toBe(false)
    expect(p.invalid.value).toEqual(['robin:activeAlly'])
    expect(p.document.value).toBe(before)
    expect(p.result.value).toBe(result)
    p.draft.value!.phase = 'postAction'
    expect(p.robinPresetIssue.value).toBeUndefined()
    expect(p.submitRobin(input)).toBe(true)
    expect(operationsAt(p.plan.value, anchor).slice(0, 2)).toEqual(
      document.plan.events[0]!.operations,
    )
    expect(
      operationsAt(p.plan.value, anchor)
        .slice(2)
        .map((op) => op.phase),
    ).toEqual(['postAction', 'postAction', 'postAction'])
    expect(p.result.value.diagnostics).toEqual([])
  })

  it('accepts preAction when the current teammate has already departed at the insertion point', () => {
    const document = fixture()
    const anchor: EventAnchor = { kind: 'action', participantId: 'b', turn: 1 }
    document.plan.events = [
      {
        anchor,
        operations: [
          { id: 'leave-active', type: 'depart', target: target('b'), phase: 'preAction' },
        ],
      },
    ]
    const p = planner(document)
    p.select(anchor)
    p.edit()
    p.draft.value!.phase = 'preAction'
    expect(p.submitRobin(input)).toBe(true)
    expect(p.result.value.diagnostics).toEqual([])
  })

  it('omits an empty ally immediate action when Robin is the only actor on the field', () => {
    const document = fixture()
    document.plan.events = [
      {
        anchor: start,
        operations: [
          {
            id: 'leave-team',
            type: 'depart',
            target: { kind: 'participants', participantIds: ['a', 'b', 'c'] },
          },
        ],
      },
    ]
    const p = planner(document)
    expect(p.submitRobin(input)).toBe(true)
    expect(
      operationsAt(p.plan.value, start)
        .slice(1)
        .map((op) => op.type),
    ).toEqual(['depart', 'spawnParticipant'])
    expect(
      p.result.value.records
        .slice(0, 2)
        .map((r) => [r.kind !== 'cycleBoundary' && r.id, r.deltaAV]),
    ).toEqual([
      [spawnedParticipantId(spawn(p).id), FULL_AG / 90],
      ['r', 0],
    ])
    expect(p.result.value.diagnostics).toEqual([])
  })

  it('rejects missing, ambiguous, departed, removed and unavailable contexts without allocating IDs', () => {
    const document = fixture()
    const state = createInitialState(document.plan)
    let allocations = 0
    const build = (doc: PlannerDocument, preview = state) =>
      buildRobinPreset(doc, start, 'postAction', preview, input, () => `id-${++allocations}`)
    expect(build({ ...document, metadata: { customNames: {}, characterIds: {} } }).invalid).toEqual(
      ['robin:missing'],
    )
    expect(
      build({ ...document, metadata: { customNames: {}, characterIds: { r: '1309', a: '1309' } } })
        .invalid,
    ).toEqual(['robin:ambiguous'])
    expect(
      build(
        document,
        applyOperations(state, [{ id: 'leave', type: 'depart', target: target('r') }], start).state,
      ).invalid,
    ).toEqual(['robin:departed'])
    expect(
      build(document, { ...state, participants: state.participants.filter((p) => p.id !== 'r') })
        .invalid,
    ).toEqual(['robin:unavailable'])
    expect(
      buildRobinPreset(document, start, 'postAction', undefined, input, () => `id-${++allocations}`)
        .invalid,
    ).toEqual(['robin:context'])
    expect(
      buildRobinPreset(
        document,
        start,
        'postAction',
        state,
        { name: ' ' },
        () => `id-${++allocations}`,
      ).invalid,
    ).toEqual(['form'])
    expect(allocations).toBe(0)
    const p = planner(document)
    p.select({ kind: 'trigger', participantId: 'orphan' })
    p.edit()
    expect(p.submitRobin(input)).toBe(false)
    expect(p.robinPresetIssue.value).toBe('context')
  })

  it('detects earlier Robin departure at the insertion point instead of the final catalog', () => {
    const document = fixture()
    document.plan.events = [
      { anchor: start, operations: [{ id: 'leave', type: 'depart', target: target('r') }] },
    ]
    const p = planner(document)
    expect(p.result.value.participants.some((p) => p.id === 'r')).toBe(true)
    expect(p.robinPresetIssue.value).toBe('departed')
    expect(p.submitRobin(input)).toBe(false)
  })

  it('publishes and saves once, with no writes on file, replay or generated-target failure', () => {
    const p = planner()
    const storage = {
      raw: serializePlannerDocument(p.document.value),
      writes: 0,
      getItem() {
        return this.raw
      },
      setItem(_key: string, value: string) {
        this.raw = value
        this.writes++
      },
    }
    const persistence = createPlannerPersistence(() => storage)
    persistence.initialize()
    const scope = effectScope()
    scope.run(() => watch(p.document, (document) => persistence.save(document), { flush: 'sync' }))
    const before = p.document.value
    const result = p.result.value
    expect(p.submitRobin({ name: 'x'.repeat(300) })).toBe(false)
    expect(p.document.value).toBe(before)
    expect(p.result.value).toBe(result)
    expect(storage.writes).toBe(0)
    expect(p.submitRobin(input)).toBe(true)
    expect(storage.writes).toBe(1)
    expect(
      allOps(p).every(
        (op) => !['editor-1', 'editor-2', 'editor-3', 'editor-4', 'editor-5'].includes(op.id),
      ),
    ).toBe(true)
    expect(JSON.parse(storage.raw).version).toBe(7)
    const restored = createPlannerPersistence(() => storage).initialize().document
    expect(restored).toEqual(p.document.value)
    expect(parsePlannerDocument(serializePlannerDocument(restored)).document).toEqual(restored)
    expect(simulatePlan(restored.plan)).toEqual(p.result.value)
    scope.stop()

    for (const failure of ['replay', 'return-target'] as const) {
      const document = fixture()
      if (failure === 'replay')
        document.plan.events = [
          {
            anchor: { kind: 'action', participantId: 'a', turn: 1 },
            operations: [
              {
                id: 'bad-speed',
                type: 'addSpeedModifier',
                target: target('a'),
                phase: 'postAction',
                mode: 'flat',
                amount: -100,
                duration: { kind: 'turns', turns: null },
              },
            ],
          },
        ]
      else document.plan.actors.find((a) => a.id === 'r')!.actionLimit = 1
      const q = planner(document)
      if (failure === 'return-target') {
        q.select({ kind: 'action', participantId: 'r', turn: 1 })
        q.edit()
      }
      const previous = q.document.value
      const previousResult = q.result.value
      let writes = 0
      const failureScope = effectScope()
      failureScope.run(() => watch(q.document, () => writes++, { flush: 'sync' }))
      expect(q.submitRobin(input)).toBe(false)
      expect(q.document.value).toBe(previous)
      expect(q.result.value).toBe(previousResult)
      expect(q.invalid.value).toEqual(['form'])
      expect(writes).toBe(0)
      failureScope.stop()
    }
  })

  it('reserves orphan IDs, repeats after return, and leaves deleted countdown anchors for repair', () => {
    const document = fixture()
    document.plan.events = [
      {
        anchor: { kind: 'trigger', participantId: 'spawn:editor-1' },
        operations: [
          {
            id: 'editor-2',
            type: 'returnToField',
            target: target('orphan'),
          },
        ],
      },
    ]
    const p = planner(document)
    p.submitRobin(input)
    expect(spawn(p).id).not.toBe('editor-1')
    const firstSpawn = spawn(p)
    const firstTrigger = trigger(p)
    p.select(firstTrigger)
    p.edit()
    expect(p.submitRobin(input)).toBe(true)
    expect(allOps(p).filter((op) => op.type === 'spawnParticipant')).toHaveLength(2)
    expect(new Set(allOps(p).map((op) => op.id)).size).toBe(allOps(p).length)
    p.select(start)
    p.edit(firstSpawn)
    p.draft.value!.participant.name = 'Edited countdown'
    p.draft.value!.participant.speed = 95
    expect(p.submit()).toBe(true)
    expect(allOps(p).find((op) => op.id === firstSpawn.id)).toMatchObject({
      id: firstSpawn.id,
      participant: { name: 'Edited countdown', speed: 95, initialAG: FULL_AG },
    })
    p.remove(firstSpawn.id)
    expect(operationsAt(p.plan.value, firstTrigger)).toHaveLength(5)
    expect(
      p.unreached.value.some(
        (event) =>
          event.anchor.kind === 'trigger' &&
          event.anchor.participantId === spawnedParticipantId(firstSpawn.id),
      ),
    ).toBe(true)
    expect(parsePlannerDocument(serializePlannerDocument(p.document.value)).document).toEqual(
      p.document.value,
    )
    p.cancel()
    expect(p.submitRobin(input)).toBe(false)
  })

  it.each(['nodes', 'av'] as const)(
    'retains budget-limited return anchors and recovers after increasing %s',
    (budget) => {
      const document = fixture()
      if (budget === 'nodes') document.plan.maxNodes = 1
      else document.plan.maxAV = 1
      const p = planner(document)
      expect(p.submitRobin(input)).toBe(true)
      expect(p.unreached.value).toContainEqual(expect.objectContaining({ anchor: trigger(p) }))
      const imported = parsePlannerDocument(serializePlannerDocument(p.document.value)).document
      imported.plan.maxNodes = 30
      imported.plan.maxAV = 600
      const result = simulatePlan(imported.plan)
      expect(result.diagnostics).toEqual([])
      expect(result.records.some((r) => r.kind !== 'cycleBoundary' && r.id === 'r')).toBe(true)
      expect(robinPresetAvailability(imported, undefined).issue).toBe('context')
    },
  )
})
