import { describe, expect, it } from 'vitest'
import { spawnedParticipantId } from '../../../src/tools/action-planner/engine/queue'
import {
  applyOperations,
  createInitialState,
  simulatePlan,
  stepSimulation,
  previewOperationState,
} from '../../../src/tools/action-planner/engine/engine'
import {
  emptyDocument,
  PLANNER_FORMAT,
  parsePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
} from '../../../src/tools/action-planner/model/document-file'
import type {
  EffectOperation,
  SkillPointMaxModifier,
} from '../../../src/tools/action-planner/engine/types'

function document(
  initial = 0,
  modifiers: SkillPointMaxModifier[] = [{ amount: 2, sourceParticipantId: 'a' }],
) {
  const doc = emptyDocument()
  doc.plan.skillPoints = { enabled: true, initial, max: 5, maxModifiers: modifiers }
  doc.plan.actors = [
    {
      id: 'a',
      kind: 'actor',
      camp: 'ally',
      category: 'character',
      name: 'A',
      position: 0,
      baseSpeed: 100,
      panelSpeed: 100,
    },
  ]
  doc.plan.maxNodes = 1
  doc.plan.events = [
    {
      anchor: { kind: 'action', participantId: 'a', turn: 1 },
      operations: [],
      skill: { kind: 'custom', cost: 0, recovery: 0 },
    },
  ]
  return doc
}
const presence = (type: 'depart' | 'returnToField', ids = ['a']): EffectOperation => ({
  id: type,
  type,
  target: { kind: 'participants', participantIds: ids },
})
describe('generic presence-based Skill Point cap modifiers', () => {
  it('starts at base 5 plus a present ally modifier 2, allowing initial 7', () => {
    const state = createInitialState(document(7).plan)
    expect(state.skillPoints).toMatchObject({ baseMax: 5, max: 7, current: 7, stored: 0 })
  })
  it.each([
    [0, 6, 0],
    [5, 7, 4],
  ])('restores 6 from %s using effective cap 7', (initial, after, stored) => {
    const doc = document(initial)
    doc.plan.events.unshift({
      anchor: { kind: 'start' },
      operations: [
        {
          id: 'restore',
          type: 'restoreSkillPoints',
          amount: 6,
          source: 'Manual',
          storeOverflow: true,
        },
      ],
    })
    const result = simulatePlan(doc.plan)
    expect(result.startSkillPointEvents?.[0]).toMatchObject({ after, stored, overflow: stored })
    expect(result.skillPointsSummary).toMatchObject({
      baseMax: 5,
      effectiveMax: 7,
      storedBalance: stored,
    })
  })
  it('clamps 7 to 5 on departure, preserves storage and never restores points on return', () => {
    const state = createInitialState(document(7).plan)
    state.skillPoints!.stored = 4
    const departed = applyOperations(state, [presence('depart')], { kind: 'start' })
    expect(departed.state.skillPoints).toMatchObject({ max: 5, current: 5, stored: 4 })
    expect(departed.maxChanges?.[0]).toMatchObject({
      beforeMax: 7,
      afterMax: 5,
      before: 7,
      after: 5,
      loss: 2,
      operationId: 'depart',
    })
    expect(departed.diagnostics[0]?.code).toBe('sp-cap-loss')
    expect(state.skillPoints?.current).toBe(7)
    const returned = applyOperations(departed.state, [presence('returnToField')], { kind: 'start' })
    expect(returned.state.skillPoints).toMatchObject({ max: 7, current: 5, stored: 4 })
    expect(returned.maxChanges?.[0]).toMatchObject({ beforeMax: 5, afterMax: 7, loss: 0 })
  })
  it('keeps unconditional modifiers active during departure and removal', () => {
    const doc = document(7, [{ amount: 2 }])
    doc.plan.actors[0]!.actionLimit = 1
    const state = createInitialState(doc.plan)
    expect(
      applyOperations(state, [presence('depart')], { kind: 'start' }).state.skillPoints?.max,
    ).toBe(7)
    const result = simulatePlan(doc.plan)
    expect(result.skillPointsSummary?.effectiveMax).toBe(7)
    expect(result.records[0]!.maxChanges).toBeUndefined()
  })
  it('recalculates after actionLimit removal and summarizes the loss separately', () => {
    const doc = document(7)
    doc.plan.actors[0]!.actionLimit = 1
    const result = simulatePlan(doc.plan)
    expect(result.records[0]!.maxChanges?.[0]).toMatchObject({
      reason: 'removal',
      participantId: 'a',
      loss: 2,
      afterMax: 5,
    })
    expect(result.skillPointsSummary).toMatchObject({
      effectiveMax: 5,
      endingBalance: 5,
      capLoss: 2,
      totalCost: 0,
      totalRecovery: 0,
    })
  })
  it('uses new effective caps for refill and postAction recovery', () => {
    const doc = document(4)
    const state = createInitialState(doc.plan)
    state.skillPoints!.stored = 4
    expect(
      stepSimulation(state, [], { kind: 'custom', cost: 0, recovery: 0 }).record.refill,
    ).toMatchObject({ amount: 3, after: 7, storedAfter: 1 })
    const lowered = stepSimulation(state, [{ ...presence('depart'), phase: 'postAction' }], {
      kind: 'custom',
      cost: 0,
      recovery: 0,
    })
    expect(lowered.record.refill).toMatchObject({ amount: 1, after: 5, storedAfter: 3 })
    const recovered = stepSimulation(
      state,
      [
        { ...presence('depart'), phase: 'postAction' },
        {
          id: 'recover',
          type: 'restoreSkillPoints',
          phase: 'postAction',
          amount: 6,
          source: 'Manual',
          storeOverflow: true,
        },
      ],
      { kind: 'custom', cost: 0, recovery: 0 },
    )
    expect(recovered.record.skillPointEvents?.[0]).toMatchObject({
      restored: 1,
      overflow: 5,
      storedAfter: 9,
    })
  })
  it('replays presence changes in operation previews using the same max', () => {
    const doc = document(7)
    const result = simulatePlan(doc.plan)
    const operations: EffectOperation[] = [{ ...presence('depart'), phase: 'postAction' }]
    const preview = previewOperationState(
      result.records[0]!.beforeEffects,
      operations,
      doc.plan.events[0]!.anchor,
      'postAction',
      undefined,
      { kind: 'custom', cost: 0, recovery: 0 },
    )
    expect(preview?.skillPoints).toMatchObject({ max: 5, current: 5 })
  })
  it('does not clamp unknown balances or alter stored points', () => {
    const state = createInitialState(document().plan)
    state.skillPoints!.current = null
    state.skillPoints!.stored = 4
    const next = applyOperations(state, [presence('depart')], { kind: 'start' })
    expect(next.state.skillPoints).toMatchObject({ max: 5, current: null, stored: 4 })
    expect(next.maxChanges?.[0]).toMatchObject({ before: null, after: null, loss: 0 })
  })
  it('rejects negative effective caps at validation and after source departure', () => {
    expect(simulatePlan(document(0, [{ amount: -6 }]).plan).stopReason).toBe('error')
    const doc = document(0, [{ amount: -6 }, { amount: 2, sourceParticipantId: 'a' }])
    const state = createInitialState(doc.plan)
    expect(() => applyOperations(state, [presence('depart')], { kind: 'start' })).toThrow(
      'invalid-sp-max',
    )
    expect(state.participants[0]!.departed).toBe(false)
    doc.plan.events.unshift({ anchor: { kind: 'start' }, operations: [presence('depart')] })
    const result = simulatePlan(doc.plan)
    expect(result.diagnostics).toContainEqual({
      code: 'invalid-sp-max',
      severity: 'error',
      anchor: { kind: 'start' },
      operationId: 'depart',
      participantId: undefined,
    })
  })
  it('evaluates a multi-target presence operation atomically', () => {
    const doc = document(0, [
      { amount: 2, sourceParticipantId: 'a' },
      { amount: -6, sourceParticipantId: 'b' },
    ])
    doc.plan.actors.push({ ...doc.plan.actors[0]!, id: 'b', position: 1 })
    const state = createInitialState(doc.plan)
    const departed = applyOperations(state, [presence('depart', ['a', 'b'])], { kind: 'start' })
    expect(departed.state.skillPoints?.max).toBe(5)
  })
  it.each(['missing', 'enemy', 'dynamic'])(
    'rejects source %s outside the initial allied roster',
    (source) => {
      const doc = document(0, [
        {
          amount: 2,
          sourceParticipantId: source === 'dynamic' ? spawnedParticipantId('dynamic') : source,
        },
      ])
      doc.plan.actors.push({ ...doc.plan.actors[0]!, id: 'enemy', camp: 'enemy' })
      doc.plan.events.unshift({
        anchor: { kind: 'start' },
        operations: [
          {
            id: 'dynamic',
            type: 'spawnParticipant',
            participant: {
              kind: 'actor',
              camp: 'ally',
              name: 'Dynamic',
              baseSpeed: 100,
              panelSpeed: 100,
            },
          },
        ],
      })
      expect(simulatePlan(doc.plan).stopReason).toBe('error')
      expect(() => serializePlannerDocument(doc)).toThrow()
    },
  )
  it('rejects initial values above the effective cap', () => {
    expect(simulatePlan(document(8).plan).stopReason).toBe('error')
    expect(() => serializePlannerDocument(document(8))).toThrow()
  })
  it.each([
    { amount: 0 },
    { amount: 1.5 },
    { amount: Infinity },
    { amount: 1, extra: true },
    { amount: 1, sourceParticipantId: '' },
  ])('rejects malformed modifier %j', (modifier) => {
    const doc = document()
    Object.assign(doc.plan.skillPoints!, { maxModifiers: [modifier] })
    expect(() => serializePlannerDocument(doc)).toThrow()
  })
  it('migrates v7 without modifiers, round-trips v8 and rejects runtime cap fields', () => {
    const old = document()
    delete old.plan.skillPoints!.maxModifiers
    expect(
      validatePlannerFile({ format: PLANNER_FORMAT, version: 7, document: old }).document,
    ).toEqual(old)
    expect(
      validatePlannerFile({ format: PLANNER_FORMAT, version: 7, document: old }).migration
        ?.fromVersion,
    ).toBe(7)
    const current = document(7)
    const source = serializePlannerDocument(current)
    expect(JSON.parse(source).version).toBe(9)
    expect(parsePlannerDocument(source).document).toEqual(current)
    expect(() =>
      validatePlannerFile({ format: PLANNER_FORMAT, version: 7, document: current }),
    ).toThrow()
    Object.assign(current.plan.skillPoints!, { baseMax: 5 })
    expect(() => serializePlannerDocument(current)).toThrow()
  })
})
