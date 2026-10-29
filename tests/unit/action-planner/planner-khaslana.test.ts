import { describe, expect, it } from 'vitest'
import { effectScope, watch } from 'vue'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import {
  buildKhaslanaPreset,
  type KhaslanaPresetInput,
} from '../../../src/tools/action-planner/model/presets'
import { buildOperation, operationDraft } from '../../../src/tools/action-planner/model/editor'
import {
  emptyDocument,
  parsePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
  PLANNER_FORMAT,
} from '../../../src/tools/action-planner/model/document-file'
import { createPlannerPersistence } from '../../../src/tools/action-planner/model/persistence'
import { createInitialState, simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import {
  effectiveSpeed,
  FULL_AG,
  spawnedParticipantId,
} from '../../../src/tools/action-planner/engine/queue'
import type {
  SimulationPlan,
  EffectOperation,
} from '../../../src/tools/action-planner/engine/types'
import { operationNameDescriptor } from '../../../src/tools/action-planner/model/naming'
import { operationMetadata } from '../../../src/tools/action-planner/model/metadata'

const input = (baseSpeed = 100, inheritancePercent = 60): KhaslanaPresetInput => ({
  baseSpeed,
  inheritancePercent,
  names: Array.from({ length: 8 }, (_, i) => `Synthetic-${i + 1}`),
})
function plan(): SimulationPlan {
  const p = emptyDocument().plan
  p.actors = ['a', 'b', 'enemy'].map((id, position) => ({
    id,
    kind: 'actor',
    name: id,
    camp: position === 2 ? 'enemy' : 'ally',
    position: position === 2 ? 0 : position,
    baseSpeed: 100,
    panelSpeed: 100,
  }))
  p.events = [
    {
      anchor: { kind: 'start' },
      operations: [
        {
          id: 'existing',
          type: 'advance',
          target: { kind: 'participants', participantIds: ['b'] },
          percent: 20,
        },
      ],
    },
  ]
  p.maxNodes = 30
  return p
}
function planner(p = plan()) {
  const planner = useActionPlanner(
    p,
    { customNames: { existing: 'Retained' }, characterIds: {} },
    'Synthetic',
  )
  planner.edit()
  return planner
}
const spawnOps = (p: SimulationPlan) =>
  p.events.flatMap((event) => event.operations).filter((op) => op.type === 'spawnParticipant')

describe('Khaslana ordinary-operation batch preset', () => {
  it.each([
    [100, 60],
    [100, 66],
    [94, 67.5],
    [200, 84],
  ])('builds exact gauges and additive speed bases for B=%s r=%s', (base, ratio) => {
    const p = planner()
    const before = p.document.value
    expect(p.submitKhaslana(input(base, ratio))).toBe(true)
    const spawns = spawnOps(p.plan.value)
    expect(spawns).toHaveLength(8)
    const operations = p.plan.value.events.flatMap((event) => event.operations)
    expect(operations).toHaveLength(11)
    expect(new Set(operations.map((op) => op.id)).size).toBe(11)
    expect(new Set(spawns.map((op) => spawnedParticipantId(op.id))).size).toBe(8)
    for (const [index, op] of spawns.entries())
      expect(op.participant).toMatchObject({
        kind: 'scheduledEvent',
        baseSpeed: base,
        speed: base * (ratio / 100),
        initialAG: (index * FULL_AG) / 7,
      })
    expect(spawns[0]!.participant.initialAG).toBe(0)
    expect(spawns[7]!.participant.initialAG).toBe(FULL_AG)
    expect(p.plan.value.events[0]!.operations[0]).toEqual(before.plan.events[0]!.operations[0])
    expect(p.document.value.metadata.customNames.existing).toBe('Retained')
    const depart = operations.find((op) => op.type === 'depart')!
    expect(depart).toMatchObject({ target: { kind: 'participants', participantIds: ['a', 'b'] } })
    const final = p.plan.value.events.find((event) => event.anchor.kind === 'trigger')!
    expect(final.anchor).toEqual({
      kind: 'trigger',
      participantId: spawnedParticipantId(spawns[7]!.id),
    })
    expect(final.operations[0]).toMatchObject({
      type: 'returnToField',
      target: depart.type === 'depart' ? depart.target : undefined,
    })
    expect(p.result.value.diagnostics).toEqual([])
    const records = p.result.value.records.filter((record) => record.kind === 'scheduledEvent')
    expect(records.map((record) => (record.kind !== 'cycleBoundary' ? record.id : ''))).toEqual(
      spawns.map((op) => spawnedParticipantId(op.id)),
    )
    const finalIndex = p.result.value.records.findIndex(
      (record) =>
        record.kind !== 'cycleBoundary' && record.id === spawnedParticipantId(spawns[7]!.id),
    )
    const returned = p.result.value.snapshots[finalIndex + 1]!.queue
    expect(returned.find((p) => p.id === 'a')!.remainingAG).toBe(FULL_AG)
    expect(returned.find((p) => p.id === 'b')!.remainingAG).toBe(8000)
    expect(p.result.value.snapshots[0]!.queue.some((p) => p.camp === 'ally')).toBe(false)
    expect(before.plan.events).toHaveLength(1)
  })

  it.each(['preAction', 'postAction'] as const)(
    'retains natural phase %s and existing operations',
    (phase) => {
      const p = planner()
      p.select({ kind: 'action', participantId: 'b', turn: 1 })
      p.edit()
      p.draft.value!.phase = phase
      expect(p.submitKhaslana(input())).toBe(true)
      const generated = p.plan.value.events.find(
        (event) => event.anchor.kind === 'action',
      )!.operations
      expect(generated).toHaveLength(9)
      expect(generated.every((op) => op.phase === phase)).toBe(true)
      expect(
        p.plan.value.events.find((event) => event.anchor.kind === 'trigger')!.operations[0]!.phase,
      ).toBeUndefined()
      expect(p.result.value.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    },
  )

  it('retains a return anchor outside the budget and recovers it after expanding the budget', () => {
    const limited = plan()
    limited.maxNodes = 2
    const p = planner(limited)
    expect(p.submitKhaslana(input())).toBe(true)
    const final = p.plan.value.events.find((event) => event.anchor.kind === 'trigger')!
    expect(p.unreached.value).toContainEqual(final)
    const imported = parsePlannerDocument(serializePlannerDocument(p.document.value)).document
    imported.plan.maxNodes = 30
    const result = simulatePlan(imported.plan)
    expect(result.diagnostics).toEqual([])
    expect(
      result.snapshots.some((s) => s.elapsedAV > 100 && s.queue.some((p) => p.id === 'a')),
    ).toBe(true)
  })

  it('commits and saves the complete document once, with zero writes on cancellation or failure', () => {
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
    const previous = p.document.value
    const result = p.result.value
    p.cancel()
    expect(p.submitKhaslana(input())).toBe(false)
    p.edit()
    expect(p.submitKhaslana(input(0))).toBe(false)
    expect(p.document.value).toBe(previous)
    expect(p.result.value).toBe(result)
    expect(storage.writes).toBe(0)
    expect(p.submitKhaslana(input())).toBe(true)
    expect(storage.writes).toBe(1)
    const restored = createPlannerPersistence(() => storage).initialize().document
    expect(restored).toEqual(p.document.value)
    expect(simulatePlan(restored.plan)).toEqual(p.result.value)
    scope.stop()
  })

  it('rolls back a batch that exceeds file limits without publishing any events', () => {
    const p = planner()
    const before = p.document.value
    const badInput = input()
    badInput.names[7] = 'x'.repeat(300)
    const result = p.result.value
    expect(p.submitKhaslana(badInput)).toBe(false)
    expect(p.document.value).toBe(before)
    expect(p.result.value).toBe(result)
    expect(spawnOps(p.plan.value)).toEqual([])
  })

  it('rejects replay errors and generated invalid return targets as one whole batch', () => {
    const broken = plan()
    broken.events.push({
      anchor: { kind: 'action', participantId: 'enemy', turn: 1 },
      operations: [
        {
          id: 'bad-speed',
          type: 'addSpeedModifier',
          phase: 'postAction',
          target: { kind: 'participants', participantIds: ['enemy'] },
          mode: 'flat',
          amount: -100,
          duration: { kind: 'turns', turns: null },
        },
      ],
    })
    const p = planner(broken)
    const before = p.document.value
    expect(p.submitKhaslana(input())).toBe(false)
    expect(p.document.value).toBe(before)
    const limited = plan()
    limited.actors[0]!.actionLimit = 1
    const q = planner(limited)
    q.select({ kind: 'action', participantId: 'a', turn: 1 })
    q.edit()
    const qBefore = q.document.value
    expect(q.submitKhaslana(input())).toBe(false)
    expect(q.document.value).toBe(qBefore)
  })

  it('uses imported and orphan identities without collisions and can add the preset again after return', () => {
    const imported = plan()
    imported.events.push({
      anchor: { kind: 'trigger', participantId: 'spawn:editor-1' },
      operations: [
        {
          id: 'editor-2',
          type: 'returnToField',
          target: { kind: 'participants', participantIds: ['orphan'] },
        },
      ],
    })
    const p = planner(imported)
    expect(p.submitKhaslana(input())).toBe(true)
    const first = spawnOps(p.plan.value)
    expect(first.some((op) => op.id === 'editor-1' || op.id === 'editor-2')).toBe(false)
    p.select({ kind: 'trigger', participantId: spawnedParticipantId(first[7]!.id) })
    p.edit()
    expect(p.submitKhaslana(input(120, 66))).toBe(true)
    const all = p.plan.value.events.flatMap((e) => e.operations)
    expect(spawnOps(p.plan.value)).toHaveLength(16)
    expect(new Set(all.map((op) => op.id)).size).toBe(all.length)
  })

  it('edits event names/speeds without losing the speed base, ID or fractional gauge; deletion leaves an orphan', () => {
    const p = planner()
    expect(p.submitKhaslana(input(100, 66))).toBe(true)
    const spawns = spawnOps(p.plan.value)
    const edited = spawns[1]!
    p.select({ kind: 'start' })
    p.edit(edited)
    p.draft.value!.participant.name = 'User name'
    p.draft.value!.participant.speed = 70
    expect(p.submit()).toBe(true)
    expect(spawnOps(p.plan.value)[1]).toMatchObject({
      id: edited.id,
      participant: { name: 'User name', baseSpeed: 100, speed: 70, initialAG: FULL_AG / 7 },
    })
    const source = serializePlannerDocument(p.document.value)
    expect(source).not.toContain('departed')
    expect(source).not.toContain('modifiers')
    expect(parsePlannerDocument(source).document).toEqual(p.document.value)
    p.remove(spawns[7]!.id)
    expect(p.unreached.value.some((event) => event.anchor.kind === 'trigger')).toBe(true)
  })

  it('supports standard event multi-target speed edits and presence naming from the actual context', () => {
    const p = planner()
    expect(p.submitKhaslana(input(100, 66))).toBe(true)
    const spawns = spawnOps(p.plan.value)
    p.select({ kind: 'trigger', participantId: spawnedParticipantId(spawns[0]!.id) })
    p.edit()
    const draft = p.draft.value!
    draft.type = 'addSpeedModifier'
    draft.selectedIds = spawns.slice(1).map((op) => spawnedParticipantId(op.id))
    draft.mode = 'percent'
    draft.amount = 1.5
    expect(p.submit()).toBe(false)
    expect(p.invalid.value).toContain('duration')
    draft.duration.turns = ''
    const before = p.document.value
    draft.amount = -100
    expect(p.submit()).toBe(false)
    expect(p.invalid.value).toContain('effectiveSpeed')
    expect(p.document.value).toBe(before)
    draft.amount = 1.5
    expect(p.submit()).toBe(true)
    const second = p.result.value.records.find(
      (r) => r.kind !== 'cycleBoundary' && r.id === spawnedParticipantId(spawns[1]!.id),
    )!
    expect(second.kind !== 'cycleBoundary' && second.effectiveSpeed).toBe(67.5)
    const state = second.beforeEffects
    const a = state.participants.find((p) => p.id === 'a')!
    const op: EffectOperation = {
      id: 'return',
      type: 'returnToField',
      target: { kind: 'participants', participantIds: ['a'] },
    }
    expect(operationNameDescriptor(op, (id) => id, state)).toEqual({
      key: 'planner.operationName.returnToField',
      params: { target: 'a' },
    })
    expect(operationMetadata(op, (id) => id, state).targetIds).toEqual(['a'])
    expect(a.departed).toBe(true)
    const event = state.participants.find((p) => p.id === spawnedParticipantId(spawns[1]!.id))!
    expect(effectiveSpeed(event, state)).toBe(67.5)
  })

  it('rejects empty ally sets, bad input and overflow before allocating any identities', () => {
    const document = emptyDocument()
    document.plan = plan()
    let allocations = 0
    const allocator = () => `allocated-${++allocations}`
    for (const invalid of [
      input(NaN),
      input(-1),
      input(100, 0),
      input(100, Infinity),
      input(Number.MAX_VALUE, Number.MAX_VALUE),
    ]) {
      expect(
        buildKhaslanaPreset(
          document,
          { kind: 'start' },
          'postAction',
          createInitialState(document.plan),
          invalid,
          allocator,
        ).document,
      ).toBeUndefined()
    }
    const empty = emptyDocument()
    expect(
      buildKhaslanaPreset(
        empty,
        { kind: 'start' },
        'postAction',
        createInitialState(empty.plan),
        input(),
        allocator,
      ).invalid,
    ).toContain('target')
    expect(allocations).toBe(0)
    expect(
      buildOperation(
        operationDraft({
          id: 'return',
          type: 'returnToField',
          target: { kind: 'participants', participantIds: ['a'] },
        }),
        'return',
        { kind: 'start' },
        createInitialState(document.plan),
      ).invalid,
    ).toContain('target')
  })

  it('keeps strict V1/V2/V3 migration and rejects runtime fields and invalid bases', () => {
    for (const version of [1, 2, 3]) {
      const document = JSON.parse(JSON.stringify(emptyDocument()))
      if (version < 3) delete document.plan.aha
      if (version === 1) delete document.plan.cycleMode
      expect(
        validatePlannerFile({ format: PLANNER_FORMAT, version, document }).document.plan.aha,
      ).toBeDefined()
    }
    const p = planner()
    p.submitKhaslana(input())
    const file = JSON.parse(serializePlannerDocument(p.document.value))
    file.document.plan.events[0].operations[1].participant.baseSpeed = 0
    expect(() => validatePlannerFile(file)).toThrow()
    file.document.plan.events[0].operations[1].participant.baseSpeed = 100
    file.document.plan.events[0].operations[1].participant.departed = false
    expect(() => validatePlannerFile(file)).toThrow()
  })
})
