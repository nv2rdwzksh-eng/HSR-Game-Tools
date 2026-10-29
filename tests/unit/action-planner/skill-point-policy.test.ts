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
import type {
  ParticipantNodeRecord,
  SkillPointsConfig,
} from '../../../src/tools/action-planner/engine/types'

function document(mode?: 'stop' | 'mark') {
  const doc = emptyDocument()
  doc.plan.skillPoints = {
    enabled: true,
    initial: 0,
    max: 5,
    ...(mode ? { onInsufficient: mode } : {}),
  }
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
  doc.plan.maxNodes = 3
  doc.plan.events = [1, 2, 3].map((turn) => ({
    anchor: { kind: 'action', participantId: 'a', turn },
    operations: [],
    skill: { kind: turn === 3 ? 'basic' : 'skill' },
  }))
  return doc
}
const skillAt = (result: ReturnType<typeof simulatePlan>, i = 0) =>
  (result.records[i] as ParticipantNodeRecord).skillPoints!
describe('Skill Point insufficiency policies', () => {
  it('includes committed opening and postAction events in totals, restoring from negative balance', () => {
    const doc = document('mark')
    doc.plan.maxNodes = 1
    doc.plan.events[0]!.skill = { kind: 'custom', cost: 3, recovery: 0 }
    doc.plan.events[0]!.operations.push({
      id: 'post',
      type: 'restoreSkillPoints',
      phase: 'postAction',
      amount: 2,
      source: 'Manual refund',
    })
    doc.plan.events.unshift({
      anchor: { kind: 'start' },
      operations: [{ id: 'opening', type: 'restoreSkillPoints', amount: 2, source: 'Opening' }],
    })
    const result = simulatePlan(doc.plan)
    expect(skillAt(result)).toMatchObject({ before: 2, after: -1, paid: 3 })
    expect(result.records[0]!.skillPointEvents?.[0]).toMatchObject({
      before: -1,
      after: 1,
      restored: 2,
      overflow: 0,
    })
    expect(result.skillPointsSummary).toMatchObject({
      totalCost: 3,
      totalRecovery: 4,
      endingBalance: 1,
      status: 'unverified',
    })
    expect(result.startState?.skillPoints?.current).toBe(0)
  })
  it('defaults to stop and records no actual payment for the blocked action', () => {
    const result = simulatePlan(document().plan)
    expect(result.records).toHaveLength(0)
    expect(result.blockedAction?.skillPoints).toMatchObject({
      status: 'insufficient',
      before: 0,
      after: 0,
      cost: 1,
      paid: 0,
      recovery: 0,
      overflow: 0,
    })
    expect(result.skillPointsSummary).toMatchObject({
      firstInsufficient: { kind: 'action', participantId: 'a', turn: 1 },
      totalCost: 0,
      totalRecovery: 0,
      endingBalance: 0,
      status: 'insufficient',
    })
    expect(result).toEqual(simulatePlan(document('stop').plan))
  })
  it('marks a negative payment, continues settlement and leaves downstream nodes unverified', () => {
    const result = simulatePlan(document('mark').plan)
    expect(result.records).toHaveLength(3)
    expect(result.blockedAction).toBeUndefined()
    expect(skillAt(result)).toMatchObject({
      status: 'insufficient',
      before: 0,
      paid: 1,
      after: -1,
      recovery: 0,
      overflow: 0,
    })
    expect(result.records.map((r) => r.spValidation)).toEqual([
      'insufficient',
      'unverified',
      'unverified',
    ])
    expect(skillAt(result, 1)).toMatchObject({
      status: 'unverified',
      before: -1,
      paid: 1,
      after: -2,
    })
    expect(skillAt(result, 2)).toMatchObject({
      status: 'unverified',
      before: -2,
      paid: 0,
      recovery: 1,
      after: -1,
    })
    expect(result.skillPointsSummary).toMatchObject({
      totalCost: 2,
      totalRecovery: 1,
      endingBalance: -1,
      status: 'unverified',
    })
    expect(result.skillPointsSummary?.firstInsufficient).toEqual(
      document('mark').plan.events[0]!.anchor,
    )
    expect(result.diagnostics.filter((d) => d.code === 'sp-marked')).toHaveLength(1)
  })
  it('runs the original operations in mark mode and uses the same counterfactual previews', () => {
    const doc = document('mark')
    doc.plan.maxNodes = 1
    doc.plan.events[0]!.operations.push({
      id: 'speed',
      type: 'addSpeedModifier',
      phase: 'preAction',
      target: { kind: 'allies' },
      mode: 'flat',
      amount: 10,
      duration: { kind: 'turns', turns: null },
    })
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
    expect(preview.skillPoints?.current).toBe(-1)
    expect(preview.participants[0]!.modifiers).toHaveLength(1)
    expect(record.beforeEffects.skillPoints?.current).toBe(0)
  })
  it('keeps unverified status after recovery reaches the cap, with actual restoration and overflow', () => {
    const doc = document('mark')
    doc.plan.events[0]!.skill = { kind: 'custom', cost: 1, recovery: 10 }
    const result = simulatePlan(doc.plan)
    expect(skillAt(result)).toMatchObject({
      status: 'insufficient',
      paid: 1,
      recovery: 6,
      overflow: 4,
      after: 5,
    })
    expect(skillAt(result, 1).status).toBe('unverified')
    expect(result.skillPointsSummary).toMatchObject({
      totalCost: 2,
      totalRecovery: 7,
      endingBalance: 5,
      status: 'unverified',
    })
  })
  it('counts only committed restoration and labels preAction candidates on stop', () => {
    const doc = document('stop')
    doc.plan.events[0]!.skill = { kind: 'custom', cost: 2, recovery: 1 }
    doc.plan.events[0]!.operations.push({
      id: 'refund',
      type: 'restoreSkillPoints',
      phase: 'preAction',
      amount: 1,
      source: 'Manual refund',
    })
    const result = simulatePlan(doc.plan)
    expect(result.blockedAction?.skillPointEvents?.[0]).toMatchObject({
      before: 0,
      after: 1,
      restored: 1,
      committed: false,
    })
    expect(result.blockedAction?.skillPoints).toMatchObject({ paid: 0, recovery: 0, after: 1 })
    expect(result.skillPointsSummary).toMatchObject({
      totalCost: 0,
      totalRecovery: 0,
      endingBalance: 0,
    })
  })
  it('gives unknown precedence when an unannotated skill occurs before insufficiency', () => {
    const doc = document('mark')
    delete doc.plan.events[0]!.skill
    const result = simulatePlan(doc.plan)
    expect(result.records.map((r) => r.spValidation)).toEqual(['unknown', 'unknown', 'unknown'])
    expect(result.skillPointsSummary).toEqual({
      totalCost: null,
      totalRecovery: null,
      endingBalance: null,
      storedBalance: 0,
      baseMax: 5,
      effectiveMax: 5,
      capLoss: 0,
      status: 'unknown',
    })
    expect(result.blockedAction).toBeUndefined()
  })
  it('turns downstream unknown after an unannotated counterfactual action and retains the first failure', () => {
    const doc = document('mark')
    delete doc.plan.events[1]!.skill
    const result = simulatePlan(doc.plan)
    expect(result.records.map((r) => r.spValidation)).toEqual([
      'insufficient',
      'unknown',
      'unknown',
    ])
    expect(result.skillPointsSummary).toMatchObject({
      firstInsufficient: doc.plan.events[0]!.anchor,
      totalCost: null,
      totalRecovery: null,
      endingBalance: null,
      storedBalance: 0,
      baseMax: 5,
      effectiveMax: 5,
      capLoss: 0,
      status: 'unknown',
    })
  })
  it('marks downstream scheduled events and cycle boundaries unverified as well', () => {
    const doc = document('mark')
    doc.plan.cycleMode = 'moc'
    doc.plan.maxNodes = 4
    doc.plan.events.unshift({
      anchor: { kind: 'start' },
      operations: [
        {
          id: 'event',
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'Event', speed: 100, initialAG: 15000 },
        },
      ],
    })
    const result = simulatePlan(doc.plan)
    expect(result.records.map((r) => r.kind)).toEqual([
      'actor',
      'scheduledEvent',
      'cycleBoundary',
      'actor',
    ])
    expect(result.records.map((r) => r.spValidation)).toEqual([
      'insufficient',
      'unverified',
      'unverified',
      'unverified',
    ])
  })
  it('replays with different results when the policy changes and round-trips configuration only', () => {
    const doc = document('stop')
    const planner = useActionPlanner(doc.plan)
    expect(planner.result.value.blockedAction).toBeDefined()
    expect(
      planner.applySetup(doc.plan.actors, 3, 600, {}, 'none', doc.plan.aha, {
        ...doc.plan.skillPoints,
        onInsufficient: 'mark',
      }),
    ).toBe(true)
    expect(planner.result.value.records).toHaveLength(3)
    expect(planner.result.value.blockedAction).toBeUndefined()
    const source = serializePlannerDocument(planner.document.value)
    expect(JSON.parse(source).version).toBe(9)
    expect(parsePlannerDocument(source).document).toEqual(planner.document.value)
    expect(source).not.toContain('skillPointsSummary')
    expect(source).not.toContain('unverified')
  })
  it.each([4, 5])(
    'migrates Version %s with default stop, preserving existing config and identity',
    (version) => {
      const doc = document()
      const parsed = validatePlannerFile({ format: PLANNER_FORMAT, version, document: doc })
      expect(parsed.document).toEqual(doc)
      expect(parsed.migration?.fromVersion).toBe(version)
      expect(simulatePlan(parsed.document.plan)).toEqual(simulatePlan(document('stop').plan))
      expect(() =>
        validatePlannerFile({ format: PLANNER_FORMAT, version, document: document('mark') }),
      ).toThrow()
    },
  )
  it.each(['continue', null, 0])('rejects invalid policy %j', (value) => {
    const doc = document()
    doc.plan.skillPoints = { ...doc.plan.skillPoints, onInsufficient: value } as SkillPointsConfig
    expect(simulatePlan(doc.plan).stopReason).toBe('error')
    expect(() => serializePlannerDocument(doc)).toThrow()
  })
})
