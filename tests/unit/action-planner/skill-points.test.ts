import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  simulatePlan,
  stepSimulation,
  previewOperationState,
} from '../../../src/tools/action-planner/engine/engine'
import { usesSkillPoints } from '../../../src/tools/action-planner/engine/skill-points'
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
  ActorConfig,
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
  it.each(['summon', 'memosprite'] as const)(
    'ignores missing and legacy skills on %s actions in execution, preview and editing',
    (category) => {
      for (const skill of [
        undefined,
        { kind: 'skill' },
        { kind: 'basic' },
        { kind: 'custom', cost: 99, recovery: 99 },
      ] as (ActionSkill | undefined)[]) {
        const doc = document(0, 5, [skill])
        doc.plan.actors[0]!.category = category
        doc.plan.maxNodes = 1
        expect(parsePlannerDocument(serializePlannerDocument(doc)).document).toEqual(doc)
        const result = simulatePlan(doc.plan)
        expect(result.blockedAction).toBeUndefined()
        expect(result.records).toHaveLength(1)
        expect(sp(result)).toBeUndefined()
        expect(result.records[0]!.spValidation).toBe('known')
        expect(result.skillPointsSummary).toMatchObject({
          endingBalance: 0,
          totalCost: 0,
          totalRecovery: 0,
        })
        expect(
          result.diagnostics.some((d) =>
            ['sp-unknown', 'sp-insufficient', 'sp-marked'].includes(d.code),
          ),
        ).toBe(false)
        for (const phase of ['preAction', 'postAction'] as const) {
          const preview = previewOperationState(
            result.records[0]!.beforeEffects,
            [],
            result.records[0]!.anchor,
            phase,
            undefined,
            skill,
          )
          expect(preview?.skillPoints?.current).toBe(0)
        }
        const planner = useActionPlanner(doc.plan)
        planner.select(result.records[0]!.anchor)
        expect(planner.setSkill({ kind: 'basic' })).toBe(false)
        expect(planner.plan.value.events).toEqual(doc.plan.events)
      }
    },
  )
  it.each(['summon', 'memosprite'] as const)(
    'allows manual recovery without annotations on %s',
    (category) => {
      const doc = document(0, 5, [undefined])
      doc.plan.actors[0]!.category = category
      doc.plan.maxNodes = 1
      doc.plan.events[0]!.operations = [
        {
          id: 'manual',
          type: 'restoreSkillPoints',
          phase: 'postAction',
          amount: 1,
          source: 'Synthetic recovery',
        },
      ]
      const result = simulatePlan(doc.plan)
      expect(result.records[0]!.skillPointEvents?.[0]).toMatchObject({
        before: 0,
        after: 1,
        restored: 1,
      })
      expect(result.skillPointsSummary?.endingBalance).toBe(1)
      expect(sp(result)).toBeUndefined()
    },
  )
  it.each([undefined, 'custom', 'character'] as const)(
    'keeps normal payment and unknown propagation for category %s',
    (category) => {
      const doc = document(1, 5, [{ kind: 'skill' }])
      doc.plan.actors[0]!.category = category
      expect(usesSkillPoints(doc.plan.actors[0])).toBe(true)
      expect(sp(simulatePlan(doc.plan))).toMatchObject({ before: 1, after: 0, paid: 1 })
      delete doc.plan.events[0]!.skill
      expect(sp(simulatePlan(doc.plan))?.status).toBe('unknown')
      expect(usesSkillPoints({ ...doc.plan.actors[0]!, camp: 'enemy' } as ActorConfig)).toBe(false)
      expect(usesSkillPoints(undefined)).toBe(false)
    },
  )
  it('marks a blocked anchor as reached while retaining later unreachable diagnostics', () => {
    const doc = document(0, 5, [{ kind: 'skill' }, { kind: 'skill' }])
    for (let i = 0; i < 2; i++)
      doc.plan.events[i]!.operations.push({
        id: `later-${i}`,
        type: 'restoreSkillPoints',
        phase: 'postAction',
        amount: 1,
        source: 'Synthetic recovery',
      })
    const result = simulatePlan(doc.plan)
    expect(result.blockedAction?.anchor).toEqual(doc.plan.events[0]!.anchor)
    expect(
      result.diagnostics.filter((d) => d.code === 'unreached-anchor').map((d) => d.anchor),
    ).toEqual([doc.plan.events[1]!.anchor])
    expect(result.diagnostics.some((d) => d.code === 'sp-insufficient')).toBe(true)
  })
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
