import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  simulatePlan,
  stepSimulation,
} from '../../../src/tools/action-planner/engine/engine'
import {
  emptyDocument,
  PLANNER_FORMAT,
  parsePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
} from '../../../src/tools/action-planner/model/document-file'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import type { ActorConfig, EffectOperation } from '../../../src/tools/action-planner/engine/types'

const recovery = (id = 'recover', storeOverflow?: boolean): EffectOperation => ({
  id,
  type: 'restoreSkillPoints',
  amount: 6,
  source: 'Manual recovery',
  ...(storeOverflow !== undefined ? { storeOverflow } : {}),
})
function document(initial = 0) {
  const doc = emptyDocument()
  doc.plan.skillPoints = { enabled: true, initial, max: 5 }
  doc.plan.actors = [
    {
      id: 'a',
      kind: 'actor',
      camp: 'ally',
      category: 'character',
      position: 0,
      name: 'A',
      baseSpeed: 100,
      panelSpeed: 100,
    },
  ]
  doc.plan.maxNodes = 1
  doc.plan.events = [
    { anchor: { kind: 'start' }, operations: [] },
    {
      anchor: { kind: 'action', participantId: 'a', turn: 1 },
      operations: [],
      skill: { kind: 'custom', cost: 0, recovery: 0 },
    },
  ]
  return doc
}
describe('generic Skill Point overflow storage and turn-end refill', () => {
  it('restores 6 from 0/5 and stores 1 with the default storage cap', () => {
    const doc = document()
    doc.plan.events[0]!.operations = [recovery('recover', true)]
    const result = simulatePlan(doc.plan)
    expect(result.startSkillPointEvents?.[0]).toMatchObject({
      before: 0,
      after: 5,
      restored: 5,
      overflow: 1,
      stored: 1,
      wasted: 0,
      storedAfter: 1,
    })
    expect(result.skillPointsSummary).toMatchObject({
      totalRecovery: 5,
      endingBalance: 5,
      storedBalance: 1,
    })
    expect(result.startState?.skillPoints).toMatchObject({ stored: 0, storedMax: 10 })
  })
  it('stores 6 from 5/5 and caps two recoveries at 10, wasting the remaining 2', () => {
    const doc = document(5)
    doc.plan.events[0]!.operations = [recovery('first', true), recovery('second', true)]
    const result = simulatePlan(doc.plan)
    expect(result.startSkillPointEvents?.[0]).toMatchObject({
      overflow: 6,
      stored: 6,
      wasted: 0,
      storedAfter: 6,
    })
    expect(result.startSkillPointEvents?.[1]).toMatchObject({
      overflow: 6,
      stored: 4,
      wasted: 2,
      storedAfter: 10,
    })
    expect(result.skillPointsSummary).toMatchObject({ totalRecovery: 0, storedBalance: 10 })
  })
  it.each([undefined, false])('discards overflow when storeOverflow is %s', (flag) => {
    const doc = document(5)
    doc.plan.events[0]!.operations = [recovery('recover', flag)]
    expect(simulatePlan(doc.plan).startSkillPointEvents?.[0]).toMatchObject({
      overflow: 6,
      stored: 0,
      wasted: 6,
      storedAfter: 0,
    })
  })
  it('disables storage at storedMax zero', () => {
    const doc = document(5)
    doc.plan.skillPoints!.storedMax = 0
    doc.plan.events[0]!.operations = [recovery('recover', true)]
    expect(simulatePlan(doc.plan).startSkillPointEvents?.[0]).toMatchObject({
      stored: 0,
      wasted: 6,
      storedAfter: 0,
    })
  })
  it('refills 3/5 from stored 4 and preserves independently owned before states', () => {
    const doc = document(3)
    const state = createInitialState(doc.plan)
    state.skillPoints!.stored = 4
    const step = stepSimulation(state, [], { kind: 'custom', cost: 0, recovery: 0 })
    expect(step.record.refill).toEqual({
      amount: 2,
      before: 3,
      after: 5,
      storedBefore: 4,
      storedAfter: 2,
    })
    expect(step.state.skillPoints).toMatchObject({ current: 5, stored: 2 })
    expect(step.record.skillPointStorage).toMatchObject({
      overflow: 0,
      stored: 0,
      wasted: 0,
      storedAfter: 2,
    })
    expect(state.skillPoints).toMatchObject({ current: 3, stored: 4 })
    expect(step.record.beforeEffects.skillPoints?.stored).toBe(4)
  })
  it('refills after postAction restoration and before action-limit removal', () => {
    const doc = document(5)
    doc.plan.actors[0]!.actionLimit = 1
    const state = createInitialState(doc.plan)
    state.skillPoints!.stored = 4
    const step = stepSimulation(
      state,
      [
        {
          id: 'post',
          type: 'restoreSkillPoints',
          phase: 'postAction',
          amount: 1,
          source: 'Manual',
        },
      ],
      { kind: 'custom', cost: 2, recovery: 0 },
    )
    expect(step.record.refill).toMatchObject({
      amount: 1,
      before: 4,
      after: 5,
      storedBefore: 4,
      storedAfter: 3,
    })
    expect(step.state.participants).toEqual([])
  })
  it.each(['enemy', 'summon', 'memosprite'])('does not refill after %s actions', (category) => {
    const doc = document(3)
    if (category === 'enemy') doc.plan.actors[0]!.camp = 'enemy'
    else doc.plan.actors[0]!.category = category as ActorConfig['category']
    const state = createInitialState(doc.plan)
    state.skillPoints!.stored = 4
    const step = stepSimulation(state, [], { kind: 'custom', cost: 0, recovery: 0 })
    expect(step.record.refill).toBeUndefined()
    expect(step.state.skillPoints).toMatchObject({ current: 3, stored: 4 })
  })
  it('does not refill a scheduled event', () => {
    const doc = document(3)
    doc.plan.events[0]!.operations = [
      {
        id: 'event',
        type: 'spawnParticipant',
        participant: { kind: 'scheduledEvent', name: 'Event', speed: 100, initialAG: 0 },
      },
    ]
    const result = simulatePlan(doc.plan)
    expect(result.records[0]!.kind).toBe('scheduledEvent')
    expect(result.records[0]!.refill).toBeUndefined()
  })
  it('never uses storage to fund a stopped action and does not commit candidate deposits', () => {
    const doc = document()
    const state = createInitialState(doc.plan)
    state.skillPoints!.stored = 4
    const step = stepSimulation(state, [], { kind: 'skill' })
    expect(step.blocked).toBe(true)
    expect(step.record.refill).toBeUndefined()
    expect(step.state.skillPoints).toMatchObject({ current: 0, stored: 4 })
    const candidate = stepSimulation(
      state,
      [{ ...recovery('candidate', true), phase: 'preAction' }],
      { kind: 'custom', cost: 6, recovery: 0 },
    )
    expect(candidate.record.skillPointEvents?.[0]).toMatchObject({
      stored: 1,
      storedAfter: 5,
      committed: false,
    })
    expect(candidate.state.skillPoints?.stored).toBe(4)
  })
  it('refills counterfactual negative balances in mark mode without removing the failure status', () => {
    const doc = document()
    doc.plan.skillPoints!.onInsufficient = 'mark'
    const state = createInitialState(doc.plan)
    state.skillPoints!.stored = 4
    const step = stepSimulation(state, [], { kind: 'skill' })
    expect(step.blocked).toBeUndefined()
    expect(step.record.spValidation).toBe('insufficient')
    expect(step.record.refill).toEqual({
      amount: 4,
      before: -1,
      after: 3,
      storedBefore: 4,
      storedAfter: 0,
    })
    expect(step.state.skillPoints).toMatchObject({ current: 3, stored: 0, unverified: true })
  })
  it('does not refill an unknown action and does not invent storage from unknown overflow', () => {
    const doc = document(3)
    const state = createInitialState(doc.plan)
    state.skillPoints!.stored = 4
    const step = stepSimulation(state, [])
    expect(step.record.refill).toBeUndefined()
    expect(step.state.skillPoints).toMatchObject({ current: null, stored: 4 })
    const unknown = stepSimulation(state, [{ ...recovery('unknown', true), phase: 'postAction' }])
    expect(unknown.record.skillPointEvents?.[0]).toMatchObject({
      after: null,
      overflow: null,
      stored: null,
      wasted: null,
      storedAfter: null,
    })
    expect(unknown.record.refill).toBeUndefined()
  })
  it('counts storage withdrawal only when refilled, including a deposit and refill on the same node', () => {
    const doc = document()
    doc.plan.events[1]!.operations = [{ ...recovery('pre', true), phase: 'preAction' }]
    doc.plan.events[1]!.skill = { kind: 'skill' }
    const result = simulatePlan(doc.plan)
    expect(result.records[0]!.refill?.amount).toBe(1)
    expect(result.records[0]!.skillPointStorage).toEqual({
      overflow: 1,
      stored: 1,
      wasted: 0,
      storedAfter: 0,
    })
    expect(result.skillPointsSummary).toMatchObject({
      totalCost: 1,
      totalRecovery: 6,
      endingBalance: 5,
      storedBalance: 0,
    })
  })
  it('round-trips v7 configuration and migrates v6 without creating runtime storage or opting in', () => {
    const old = document(3)
    old.plan.events[0]!.operations = [recovery()]
    const parsed = validatePlannerFile({ format: PLANNER_FORMAT, version: 6, document: old })
    expect(parsed.migration?.fromVersion).toBe(6)
    expect(parsed.document).toEqual(old)
    expect(simulatePlan(parsed.document.plan).startSkillPointEvents?.[0]?.stored).toBe(0)
    const current = document(5)
    current.plan.skillPoints!.storedMax = 10
    current.plan.events[0]!.operations = [recovery('store', true)]
    const source = serializePlannerDocument(current)
    expect(JSON.parse(source).version).toBe(9)
    expect(parsePlannerDocument(source).document).toEqual(current)
    expect(source).not.toContain('storedAfter')
    expect(source).not.toContain('"stored":')
    expect(() =>
      validatePlannerFile({ format: PLANNER_FORMAT, version: 6, document: current }),
    ).toThrow()
  })
  it.each([-1, 1.5, null, '10'])('rejects invalid storage cap %j', (storedMax) => {
    const doc = document()
    Object.assign(doc.plan.skillPoints!, { storedMax })
    expect(() => serializePlannerDocument(doc)).toThrow()
  })
  it('keeps the operation checkbox through editing and rejects a non-boolean store flag', () => {
    const doc = document(5)
    const planner = useActionPlanner(doc.plan)
    planner.select({ kind: 'start' })
    planner.edit()
    Object.assign(planner.draft.value!, {
      type: 'restoreSkillPoints',
      amount: 6,
      source: 'Manual',
      storeOverflow: true,
    })
    expect(planner.submit()).toBe(true)
    const op = planner.plan.value.events.find((e) => e.anchor.kind === 'start')!.operations[0]!
    expect(op).toMatchObject({ storeOverflow: true })
    planner.edit(op)
    expect(planner.draft.value?.storeOverflow).toBe(true)
    expect(planner.submit()).toBe(true)
    Object.assign(op, { storeOverflow: 1 })
    expect(() => serializePlannerDocument(planner.document.value)).toThrow()
  })
})
