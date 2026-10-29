import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  simulatePlan,
  stepSimulation,
} from '../../../src/tools/action-planner/engine/engine'
import {
  emptyDocument,
  PLANNER_FORMAT,
  serializePlannerDocument,
  parsePlannerDocument,
  validatePlannerFile,
} from '../../../src/tools/action-planner/model/document-file'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import type {
  ActionSkill,
  ParticipantNodeRecord,
} from '../../../src/tools/action-planner/engine/types'

function document(initial = 3, max = 5, skills: (ActionSkill | undefined)[] = []) {
  const doc = emptyDocument()
  doc.plan.skillPoints = { enabled: true, initial, max }
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
  doc.plan.maxNodes = 3
  doc.plan.events = skills.map((skill, i) => ({
    anchor: { kind: 'action', participantId: 'a', turn: i + 1 },
    operations: [],
    ...(skill ? { skill } : {}),
  }))
  return doc
}
const sp = (result: ReturnType<typeof simulatePlan>, index = 0) =>
  (result.records[index] as ParticipantNodeRecord).skillPoints
describe('shared Skill Point validation', () => {
  it('blocks payment at zero before effects, even when the skill would restore points', () => {
    const doc = document(0, 5, [{ kind: 'custom', cost: 1, recovery: 1 }])
    doc.plan.events[0]!.operations.push({
      id: 'spawn',
      type: 'spawnParticipant',
      phase: 'preAction',
      participant: { kind: 'scheduledEvent', name: 'Never', speed: 100 },
    })
    const state = createInitialState(doc.plan)
    const step = stepSimulation(state, doc.plan.events[0]!.operations, doc.plan.events[0]!.skill)
    expect(step.state).toEqual(state)
    expect(step.blocked).toBe(true)
    const result = simulatePlan(doc.plan)
    expect(result.records).toEqual([])
    expect(result.blockedAction?.skillPoints).toMatchObject({
      status: 'insufficient',
      before: 0,
      after: 0,
      cost: 1,
    })
    expect(result.stopReason).toBe('error')
    expect(result.diagnostics).toContainEqual({
      code: 'sp-insufficient',
      severity: 'error',
      anchor: doc.plan.events[0]!.anchor,
    })
  })
  it('restores basic points and records capped restoration and overflow', () => {
    const result = simulatePlan(
      document(4, 5, [{ kind: 'basic' }, { kind: 'basic' }, { kind: 'skill' }]).plan,
    )
    expect(sp(result)).toMatchObject({ before: 4, after: 5, recovery: 1, overflow: 0 })
    expect(sp(result, 1)).toMatchObject({ before: 5, after: 5, recovery: 0, overflow: 1 })
    expect(sp(result, 2)).toMatchObject({ before: 5, after: 4, cost: 1 })
    expect(result.diagnostics.some((d) => d.code === 'sp-overflow')).toBe(true)
  })
  it('pays first, then restores after the complete action without mutating earlier snapshots', () => {
    const doc = document(1, 5, [{ kind: 'custom', cost: 1, recovery: 2 }])
    const result = simulatePlan(doc.plan)
    expect(sp(result)).toMatchObject({ before: 1, after: 2, cost: 1, recovery: 2 })
    expect(result.startState?.skillPoints?.current).toBe(1)
    expect(result.records[0]!.beforeEffects.skillPoints?.current).toBe(1)
  })
  it('propagates unknown and preserves the original timeline and effects', () => {
    const doc = document(0, 5, [undefined, { kind: 'skill' }, { kind: 'basic' }])
    const result = simulatePlan(doc.plan)
    expect(result.records).toHaveLength(3)
    expect(result.records.map((_, i) => sp(result, i)?.status)).toEqual([
      'unknown',
      'unknown',
      'unknown',
    ])
    expect(sp(result, 2)?.after).toBeNull()
    expect(result.diagnostics.filter((d) => d.code === 'sp-unknown')).toHaveLength(1)
    const disabled = simulatePlan({ ...doc.plan, skillPoints: undefined })
    expect(result.records.map((r) => r.elapsedAV)).toEqual(disabled.records.map((r) => r.elapsedAV))
    expect(
      disabled.records.every((r) => r.kind === 'cycleBoundary' || r.skillPoints === undefined),
    ).toBe(true)
  })
  it('does not require enemy annotations and shares the balance between allies', () => {
    const doc = document(1, 5, [{ kind: 'skill' }])
    doc.plan.actors.push({
      ...doc.plan.actors[0]!,
      id: 'enemy',
      camp: 'enemy',
      initialAG: 0,
      actionLimit: 1,
    })
    doc.plan.actors.push({ ...doc.plan.actors[0]!, id: 'b', position: 1 })
    doc.plan.events.push({
      anchor: { kind: 'action', participantId: 'b', turn: 1 },
      operations: [],
      skill: { kind: 'skill' },
    })
    const result = simulatePlan(doc.plan)
    expect(result.records).toHaveLength(2)
    expect(result.blockedAction?.id).toBe('b')
    expect(result.blockedAction?.skillPoints?.before).toBe(0)
  })
  it('migrates Version 3 with validation disabled and round-trips Version 4 settings and annotations', () => {
    const old = document()
    delete old.plan.skillPoints
    const parsed = validatePlannerFile({ format: PLANNER_FORMAT, version: 3, document: old })
    expect(parsed.document.plan.skillPoints).toBeUndefined()
    expect(simulatePlan(parsed.document.plan)).toEqual(simulatePlan(old.plan))
    expect(parsed.migration?.fromVersion).toBe(3)
    const current = document(2, 5, [{ kind: 'custom', cost: 1, recovery: 3 }])
    expect(parsePlannerDocument(serializePlannerDocument(current)).document).toEqual(current)
    expect(JSON.parse(serializePlannerDocument(current)).version).toBe(9)
    expect(() =>
      validatePlannerFile({ format: PLANNER_FORMAT, version: 3, document: current }),
    ).toThrow()
  })
  it.each([
    { enabled: 'yes' },
    { initial: -1 },
    { initial: 6 },
    { max: 1.5 },
    { max: null },
    { extra: 1 },
  ])('rejects malformed configuration %j', (config) => {
    const doc = document()
    Object.assign(doc.plan, { skillPoints: config })
    expect(() => serializePlannerDocument(doc)).toThrow()
    expect(simulatePlan(doc.plan).stopReason).toBe('error')
  })
  it.each([
    { kind: 'custom', cost: -1, recovery: 0 },
    { kind: 'custom', cost: 1 },
    { kind: 'basic', cost: 0 },
    { kind: 'other' },
  ])('rejects malformed skills %j', (skill) => {
    const doc = document(3, 5, [{ kind: 'basic' }])
    Object.assign(doc.plan.events[0]!, { skill })
    expect(() => serializePlannerDocument(doc)).toThrow()
  })
  it('keeps skill-only anchors on operation deletion and allows fixing a blocked action', () => {
    const doc = document(0, 5, [{ kind: 'skill' }])
    const planner = useActionPlanner(doc.plan)
    planner.select(doc.plan.events[0]!.anchor)
    expect(planner.context.value).toBeDefined()
    expect(planner.setSkill({ kind: 'basic' })).toBe(true)
    planner.remove('absent')
    expect(planner.plan.value.events[0]!.skill).toEqual({ kind: 'basic' })
    expect(planner.result.value.blockedAction).toBeUndefined()
  })
})
