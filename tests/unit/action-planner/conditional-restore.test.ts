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
import type { ConditionalRestoreOperation } from '../../../src/tools/action-planner/engine/types'

const refund = (
  turn: number,
  cooldownTurns = 1,
  outcome: 'proc' | 'no-proc' = 'proc',
): ConditionalRestoreOperation => ({
  id: `refund-${turn}`,
  type: 'conditionalRestore',
  phase: 'postAction',
  amount: 1,
  chance: 0.5,
  cooldownTurns,
  outcome,
  sourceParticipantId: 'a',
  source: 'Manual refund',
})
function document(initial = 5, cooldown = 1, turns = 3) {
  const doc = emptyDocument()
  doc.plan.skillPoints = { enabled: true, initial, max: 5 }
  doc.plan.actors = [
    {
      id: 'a',
      kind: 'actor',
      camp: 'ally',
      name: 'A',
      position: 0,
      baseSpeed: 100,
      panelSpeed: 100,
    },
  ]
  doc.plan.maxNodes = turns
  doc.plan.events = Array.from({ length: turns }, (_, i) => ({
    anchor: { kind: 'action', participantId: 'a', turn: i + 1 },
    operations: [refund(i + 1, cooldown)],
    skill: { kind: 'skill' },
  }))
  return doc
}
describe('selected conditional Skill Point refunds', () => {
  it('refunds 1 from 4/5 and records the selected chance without sampling', () => {
    const result = simulatePlan(document(5, 1, 1).plan)
    expect(result.records[0]!.conditionalRestores?.[0]).toMatchObject({
      status: 'proc',
      before: 4,
      after: 5,
      restored: 1,
      overflow: 0,
      chance: 0.5,
      availableFromTurn: 3,
    })
    expect(result.skillPointsSummary).toMatchObject({
      totalCost: 1,
      totalRecovery: 1,
      endingBalance: 5,
    })
  })
  it('starts cooldown even when a successful refund fully overflows at 5/5', () => {
    const doc = document(5, 1, 1)
    doc.plan.events[0]!.operations.unshift({
      id: 'fill',
      type: 'restoreSkillPoints',
      phase: 'postAction',
      amount: 1,
      source: 'Fill',
    })
    const result = simulatePlan(doc.plan)
    expect(result.records[0]!.conditionalRestores?.[0]).toMatchObject({
      status: 'proc',
      before: 5,
      after: 5,
      restored: 0,
      overflow: 1,
      wasted: 1,
      availableFromTurn: 3,
    })
    expect(result.records[0]!.skillPointStorage?.wasted).toBe(1)
  })
  it('skips the next own turn, then becomes available on the following turn', () => {
    const result = simulatePlan(document().plan)
    expect(result.records.map((r) => r.conditionalRestores?.[0]?.status)).toEqual([
      'proc',
      'cooldown',
      'proc',
    ])
    expect(result.records.map((r) => r.conditionalRestores?.[0]?.availableFromTurn)).toEqual([
      3, 3, 5,
    ])
    expect(result.records[0]!.beforeEffects.skillPoints?.conditionalCooldowns.size).toBe(0)
    expect(result.records[1]!.beforeEffects.skillPoints?.conditionalCooldowns.get('a')).toBe(3)
  })
  it('no-proc does not start cooldown and cooldown skips do not reset it', () => {
    const doc = document(5, 1, 4)
    doc.plan.events[0]!.operations = [refund(1, 1, 'no-proc')]
    doc.plan.events[2]!.operations = [refund(3, 1, 'no-proc')]
    const result = simulatePlan(doc.plan)
    expect(result.records.map((r) => r.conditionalRestores?.[0]?.status)).toEqual([
      'no-proc',
      'proc',
      'cooldown',
      'proc',
    ])
    expect(result.records[0]!.conditionalRestores?.[0]).toMatchObject({ restored: 0, overflow: 0 })
    expect(result.records[0]!.conditionalRestores?.[0]?.availableFromTurn).toBeUndefined()
    expect(result.records[2]!.conditionalRestores?.[0]?.availableFromTurn).toBe(4)
  })
  it('allows consecutive procs with cooldown zero, independently of the displayed chance', () => {
    const doc = document(5, 0)
    for (const event of doc.plan.events)
      (event.operations[0] as ConditionalRestoreOperation).chance = 0
    expect(simulatePlan(doc.plan).records.map((r) => r.conditionalRestores?.[0]?.status)).toEqual([
      'proc',
      'proc',
      'proc',
    ])
  })
  it('does not advance the source cooldown on allied turns', () => {
    const doc = document()
    doc.plan.actors.push({ ...doc.plan.actors[0]!, id: 'b', position: 1, panelSpeed: 200 })
    for (let turn = 1; turn <= 6; turn++)
      doc.plan.events.push({
        anchor: { kind: 'action', participantId: 'b', turn },
        operations: [],
        skill: { kind: 'basic' },
      })
    doc.plan.maxNodes = 9
    const result = simulatePlan(doc.plan)
    expect(
      result.records
        .filter((r) => r.kind === 'actor' && r.id === 'a')
        .map((r) => r.conditionalRestores?.[0]?.status),
    ).toEqual(['proc', 'cooldown', 'proc'])
  })
  it('records unknown without refund or a new cooldown', () => {
    const doc = document()
    delete doc.plan.events[0]!.skill
    doc.plan.events[0]!.operations = []
    const result = simulatePlan(doc.plan)
    expect(result.records[1]!.conditionalRestores?.[0]).toMatchObject({
      status: 'unknown',
      before: null,
      after: null,
      restored: 0,
    })
    expect(result.records[2]!.beforeEffects.skillPoints?.conditionalCooldowns.size).toBe(0)
  })
  it('does not reach conditional operations when stop blocks payment', () => {
    const result = simulatePlan(document(0).plan)
    expect(result.records).toHaveLength(0)
    expect(result.blockedAction?.conditionalRestores).toBeUndefined()
    expect(result.blockedAction?.beforeEffects.skillPoints?.conditionalCooldowns.size).toBe(0)
  })
  it('refunds counterfactual negative balances in mark mode without validating downstream nodes', () => {
    const doc = document(0)
    doc.plan.skillPoints!.onInsufficient = 'mark'
    const result = simulatePlan(doc.plan)
    expect(result.blockedAction).toBeUndefined()
    expect(result.records[0]!.conditionalRestores?.[0]).toMatchObject({
      before: -1,
      after: 0,
      status: 'proc',
    })
    expect(result.records[1]!.spValidation).toBe('unverified')
    expect(result.records[1]!.beforeEffects.skillPoints?.unverified).toBe(true)
  })
  it('runs selected refunds before turn-end refill, in the postAction list order', () => {
    const doc = document(1, 1, 1)
    doc.plan.events.unshift({
      anchor: { kind: 'start' },
      operations: [
        {
          id: 'opening',
          type: 'restoreSkillPoints',
          amount: 6,
          source: 'Opening',
          storeOverflow: true,
        },
      ],
    })
    const result = simulatePlan(doc.plan)
    expect(result.records[0]!.conditionalRestores?.[0]).toMatchObject({ before: 4, after: 5 })
    expect(result.records[0]!.refill).toBeUndefined()
    expect(result.skillPointsSummary?.storedBalance).toBe(2)
    const noProc = structuredClone(doc)
    noProc.plan.events[1]!.operations = [refund(1, 1, 'no-proc')]
    expect(simulatePlan(noProc.plan).records[0]!.refill?.amount).toBe(1)
  })
  it('uses the same cooldown in postAction previews without changing historical states', () => {
    const doc = document()
    const result = simulatePlan(doc.plan)
    const record = result.records[0]!
    const preview = previewOperationState(
      record.beforeEffects,
      doc.plan.events[0]!.operations,
      record.anchor,
      'postAction',
      undefined,
      { kind: 'skill' },
    )!
    expect(preview.skillPoints?.conditionalCooldowns.get('a')).toBe(3)
    expect(record.beforeEffects.skillPoints?.conditionalCooldowns.size).toBe(0)
  })
  it.each([
    'basic',
    'custom',
    'unknown',
    'start',
    'preAction',
    'enemy',
    'otherActor',
    'cycleBoundary',
    'trigger',
  ])('rejects invalid source context %s', (kind) => {
    const doc = document(5, 1, 1)
    const event = doc.plan.events[0]!
    if (kind === 'basic') event.skill = { kind: 'basic' }
    if (kind === 'custom') event.skill = { kind: 'custom', cost: 1, recovery: 0 }
    if (kind === 'unknown') delete event.skill
    if (kind === 'start') {
      event.anchor = { kind: 'start' }
      delete event.skill
      delete event.operations[0]!.phase
    }
    if (kind === 'preAction') event.operations[0]!.phase = 'preAction'
    if (kind === 'enemy') doc.plan.actors[0]!.camp = 'enemy'
    if (kind === 'otherActor')
      (event.operations[0] as ConditionalRestoreOperation).sourceParticipantId = 'b'
    if (kind === 'cycleBoundary') {
      event.anchor = { kind: 'cycleBoundary', ordinal: 1 }
      delete event.skill
      delete event.operations[0]!.phase
    }
    if (kind === 'trigger') {
      event.anchor = { kind: 'trigger', participantId: 'a' }
      delete event.skill
      delete event.operations[0]!.phase
    }
    expect(simulatePlan(doc.plan).stopReason).toBe('error')
    expect(() => serializePlannerDocument(doc)).toThrow()
  })
  it.each([
    { amount: 0 },
    { amount: -1 },
    { chance: -0.1 },
    { chance: 1.1 },
    { chance: NaN },
    { cooldownTurns: -1 },
    { cooldownTurns: 0.5 },
    { outcome: 'random' },
    { storeOverflow: true },
  ])('rejects invalid fields %j', (fields) => {
    const doc = document(5, 1, 1)
    Object.assign(doc.plan.events[0]!.operations[0]!, fields)
    expect(simulatePlan(doc.plan).stopReason).toBe('error')
    expect(() => serializePlannerDocument(doc)).toThrow()
  })
  it('rejects stacked conditional operations in the same action', () => {
    const doc = document(5, 1, 1)
    doc.plan.events[0]!.operations.push({ ...refund(1), id: 'another' })
    expect(() => serializePlannerDocument(doc)).toThrow()
  })
  it('ignores conditional refunds when SP validation is disabled', () => {
    const doc = document()
    doc.plan.skillPoints!.enabled = false
    const without = structuredClone(doc.plan)
    without.events.forEach((e) => (e.operations = []))
    expect(simulatePlan(doc.plan)).toEqual(simulatePlan(without))
  })
  it('supports target-free editor submission and v8 migration / v9 round trips', () => {
    const old = document(5, 1, 1)
    old.plan.events[0]!.operations = []
    expect(
      validatePlannerFile({ format: PLANNER_FORMAT, version: 8, document: old }).migration
        ?.fromVersion,
    ).toBe(8)
    const planner = useActionPlanner(old.plan)
    planner.select(old.plan.events[0]!.anchor)
    planner.edit()
    Object.assign(planner.draft.value!, {
      type: 'conditionalRestore',
      phase: 'postAction',
      amount: 1,
      chance: 0.5,
      cooldownTurns: 1,
      outcome: 'proc',
      source: 'Manual',
    })
    expect(planner.submit()).toBe(true)
    const op = planner.plan.value.events[0]!.operations[0]!
    expect(op).toMatchObject({ type: 'conditionalRestore', sourceParticipantId: 'a' })
    expect(op).not.toHaveProperty('target')
    const source = serializePlannerDocument(planner.document.value)
    expect(JSON.parse(source).version).toBe(9)
    expect(parsePlannerDocument(source).document).toEqual(planner.document.value)
    expect(source).not.toContain('conditionalCooldowns')
    expect(source).not.toContain('availableFromTurn')
    expect(() =>
      validatePlannerFile({ format: PLANNER_FORMAT, version: 8, document: planner.document.value }),
    ).toThrow()
  })
})
