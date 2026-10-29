import { describe, expect, it } from 'vitest'
import {
  simulatePlan,
  previewOperationState,
} from '../../../src/tools/action-planner/engine/engine'
import {
  emptyDocument,
  PLANNER_FORMAT,
  parsePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
} from '../../../src/tools/action-planner/model/document-file'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { operationMetadata } from '../../../src/tools/action-planner/model/metadata'
import type {
  EffectOperation,
  ParticipantNodeRecord,
} from '../../../src/tools/action-planner/engine/types'

const restore = (amount: number, phase?: 'preAction' | 'postAction'): EffectOperation => ({
  id: 'restore',
  type: 'restoreSkillPoints',
  amount,
  source: 'Synthetic ultimate',
  ...(phase ? { phase } : {}),
})
function document(initial = 0, phase?: 'preAction' | 'postAction', amount = 1) {
  const doc = emptyDocument()
  doc.plan.skillPoints = { enabled: true, initial, max: 5 }
  doc.plan.actors = [
    {
      id: 'a',
      kind: 'actor',
      camp: 'ally',
      position: 0,
      name: 'A',
      baseSpeed: 100,
      panelSpeed: 100,
    },
  ]
  doc.plan.maxNodes = 1
  doc.plan.events = [
    phase
      ? {
          anchor: { kind: 'action', participantId: 'a', turn: 1 },
          operations: [restore(amount, phase)],
          skill: { kind: 'skill' },
        }
      : { anchor: { kind: 'start' }, operations: [restore(amount)] },
  ]
  return doc
}
describe('positive Skill Point operations', () => {
  it('restores two points at battle start and records the receipt', () => {
    const result = simulatePlan(document(3, undefined, 2).plan)
    expect(result.startSkillPointEvents).toEqual([
      {
        operationId: 'restore',
        source: 'Synthetic ultimate',
        amount: 2,
        before: 3,
        after: 5,
        restored: 2,
        overflow: 0,
        stored: 0,
        wasted: 0,
        storedAfter: 0,
      },
    ])
    expect(result.records[0]!.beforeEffects.skillPoints?.current).toBe(5)
  })
  it('allows a zero-balance skill after preAction recovery, before other preAction effects', () => {
    const doc = document(0, 'preAction')
    // Recovery must run first even if it appears after ordinary preAction operations.
    doc.plan.events[0]!.operations.unshift({
      id: 'spawn',
      type: 'spawnParticipant',
      phase: 'preAction',
      participant: { kind: 'scheduledEvent', name: 'Event', speed: 100 },
    })
    const result = simulatePlan(doc.plan)
    expect(result.blockedAction).toBeUndefined()
    expect((result.records[0] as ParticipantNodeRecord).skillPoints).toMatchObject({
      status: 'known',
      before: 1,
      after: 0,
    })
    expect(result.records[0]!.skillPointEvents?.[0]).toMatchObject({
      before: 0,
      after: 1,
      restored: 1,
    })
  })
  it('does not allow postAction recovery to fund this action', () => {
    const result = simulatePlan(document(0, 'postAction').plan)
    expect(result.records).toHaveLength(0)
    expect(result.blockedAction?.skillPoints?.status).toBe('insufficient')
    expect(result.blockedAction?.skillPointEvents).toBeUndefined()
  })
  it('records two overflow at 5/5 and keeps the cap', () => {
    const result = simulatePlan(document(5, undefined, 2).plan)
    expect(result.startSkillPointEvents?.[0]).toMatchObject({
      before: 5,
      after: 5,
      restored: 0,
      overflow: 2,
    })
    expect(result.diagnostics).toContainEqual({
      code: 'sp-overflow',
      severity: 'info',
      anchor: { kind: 'start' },
      operationId: 'restore',
    })
  })
  it.each([-1, 0, 0.5, NaN, Infinity])('rejects invalid restoration %s', (amount) => {
    const doc = document(0, undefined, amount)
    expect(simulatePlan(doc.plan).stopReason).toBe('error')
    expect(() => serializePlannerDocument(doc)).toThrow()
  })
  it('preserves unknown after a restoration event', () => {
    const doc = document(0, 'postAction')
    delete doc.plan.events[0]!.skill
    const result = simulatePlan(doc.plan)
    expect(result.records[0]!.skillPointEvents?.[0]).toMatchObject({
      before: null,
      after: null,
      restored: null,
      overflow: null,
    })
    expect((result.records[0] as ParticipantNodeRecord).skillPoints?.after).toBeNull()
  })
  it('restores the skill before postAction operations, preserving their order', () => {
    const doc = document(4, 'postAction', 1)
    doc.plan.events[0]!.skill = { kind: 'basic' }
    doc.plan.events[0]!.operations.push({ ...restore(2, 'postAction'), id: 'second' })
    const result = simulatePlan(doc.plan)
    expect((result.records[0] as ParticipantNodeRecord).skillPoints).toMatchObject({
      before: 4,
      after: 5,
      recovery: 1,
      overflow: 0,
    })
    expect(result.records[0]!.skillPointEvents?.map((e) => e.overflow)).toEqual([1, 2])
    const context = result.records[0]!.beforeEffects
    expect(
      previewOperationState(
        context,
        doc.plan.events[0]!.operations,
        doc.plan.events[0]!.anchor,
        'postAction',
        'second',
        { kind: 'basic' },
      )?.skillPoints?.current,
    ).toBe(5)
  })
  it('ignores valid events entirely when validation is disabled', () => {
    const doc = document(0, 'preAction')
    doc.plan.skillPoints = { enabled: false }
    const expected = structuredClone(doc.plan)
    expected.events[0]!.operations = []
    expect(simulatePlan(doc.plan)).toEqual(simulatePlan(expected))
  })
  it('migrates Version 4 without enabling validation and preserves explicit settings', () => {
    const old = emptyDocument()
    expect(
      validatePlannerFile({ format: PLANNER_FORMAT, version: 4, document: old }).document.plan
        .skillPoints,
    ).toBeUndefined()
    const configured = document()
    configured.plan.events = []
    const parsed = validatePlannerFile({ format: PLANNER_FORMAT, version: 4, document: configured })
    expect(parsed.document).toEqual(configured)
    expect(parsed.migration?.fromVersion).toBe(4)
    expect(() =>
      validatePlannerFile({ format: PLANNER_FORMAT, version: 4, document: document() }),
    ).toThrow()
    const source = serializePlannerDocument(document())
    expect(JSON.parse(source).version).toBe(7)
    expect(parsePlannerDocument(source).document).toEqual(document())
    expect(source).not.toContain('skillPointEvents')
  })
  it.each(['enemy', 'aha', 'trigger', 'cycleBoundary', 'orphan'])(
    'rejects restoration on %s anchors',
    (kind) => {
      const doc = document(0, 'preAction')
      const event = doc.plan.events[0]!
      if (kind === 'enemy') doc.plan.actors[0]!.camp = 'enemy'
      if (kind === 'aha') event.anchor = { kind: 'action', participantId: doc.plan.aha.id, turn: 1 }
      if (kind === 'trigger') {
        event.anchor = { kind: 'trigger', participantId: 'a' }
        event.operations = [restore(1)]
      }
      if (kind === 'cycleBoundary') {
        event.anchor = { kind: 'cycleBoundary', ordinal: 1 }
        event.operations = [restore(1)]
      }
      if (kind === 'orphan') event.anchor = { kind: 'action', participantId: 'missing', turn: 1 }
      delete event.skill
      expect(simulatePlan(doc.plan).stopReason).toBe('error')
      expect(() => serializePlannerDocument(doc)).toThrow()
    },
  )
  it('supports repairing blocked payment through a target-free preAction draft', () => {
    const doc = document(0, 'postAction')
    doc.plan.events[0]!.operations = []
    const planner = useActionPlanner(doc.plan)
    planner.select(doc.plan.events[0]!.anchor)
    planner.edit()
    Object.assign(planner.draft.value!, {
      type: 'restoreSkillPoints',
      phase: 'preAction',
      amount: 1,
      source: 'Manual refund',
      selectedIds: [],
    })
    expect(planner.preview.value?.skillPoints?.current).toBe(0)
    expect(planner.submit()).toBe(true)
    expect(planner.result.value.blockedAction).toBeUndefined()
    const operation = planner.plan.value.events[0]!.operations[0]!
    expect(operation).not.toHaveProperty('target')
    expect(operationMetadata(operation, (id) => id).fields[0]?.message).toMatchObject({
      key: 'planner.sp.eventLabel',
      params: { amount: 1, source: 'Manual refund' },
    })
  })
  it('rejects source and target forgery at the file boundary', () => {
    for (const extra of [
      { source: '' },
      { source: ' '.repeat(4) },
      { source: 'a'.repeat(257) },
      { target: { kind: 'allies' } },
    ]) {
      const doc = document()
      Object.assign(doc.plan.events[0]!.operations[0]!, extra)
      expect(() => serializePlannerDocument(doc)).toThrow()
    }
  })
})
