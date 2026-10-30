import { describe, expect, it } from 'vitest'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import {
  emptyDocument,
  serializePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'
import { buildSkillPointLedger } from '../../../src/tools/action-planner/model/skill-point-ledger'

function document() {
  const doc = emptyDocument()
  doc.plan.cycleMode = 'moc'
  doc.plan.skillPoints = { enabled: true, initial: 3, max: 5 }
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
  doc.plan.maxAV = 260
  doc.plan.events = [
    {
      anchor: { kind: 'action', participantId: 'a', turn: 1 },
      operations: [],
      skill: { kind: 'basic' },
    },
    { anchor: { kind: 'cycleBoundary', ordinal: 1 }, operations: [] },
    {
      anchor: { kind: 'action', participantId: 'a', turn: 2 },
      operations: [
        {
          id: 'cycle-recovery',
          type: 'restoreSkillPoints',
          phase: 'preAction',
          amount: 1,
          source: 'Cycle recovery',
        },
      ],
      skill: { kind: 'skill' },
    },
  ]
  return doc
}
describe('read-only per-cycle Skill Point ledger', () => {
  it('groups by boundaries and keeps skill/external restoration separate', () => {
    const doc = document()
    const result = simulatePlan(doc.plan)
    const before = structuredClone(result)
    const source = serializePlannerDocument(doc)
    const rows = buildSkillPointLedger(result, 'moc')
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({
      cycle: 0,
      openingBalance: 3,
      totalCost: 0,
      skillRecovery: 1,
      externalRecovery: 0,
      endingBalance: 4,
    })
    expect(rows[1]).toMatchObject({
      cycle: 1,
      openingBalance: 4,
      totalCost: 1,
      skillRecovery: 0,
      externalRecovery: 1,
      endingBalance: 4,
    })
    expect(rows[2]).toMatchObject({ cycle: 2, openingBalance: 4, endingBalance: 4 })
    expect(rows.reduce((n, row) => n + row.totalCost!, 0)).toBe(
      result.skillPointsSummary!.totalCost,
    )
    expect(
      rows.reduce((n, row) => n + row.skillRecovery! + row.externalRecovery! + row.refill!, 0),
    ).toBe(result.skillPointsSummary!.totalRecovery)
    expect(result).toEqual(before)
    expect(serializePlannerDocument(doc)).toBe(source)
  })
  it('uses actual record order for same-AV actions before a boundary and handles an endpoint at that boundary', () => {
    const doc = document()
    doc.plan.actors[0]!.initialAG = 15000
    doc.plan.maxNodes = 2
    doc.plan.skillPoints!.maxModifiers = [{ amount: 2, sourceParticipantId: 'a' }]
    doc.plan.events[1]!.operations = [
      {
        id: 'depart-at-boundary',
        type: 'depart',
        target: { kind: 'participants', participantIds: ['a'] },
      },
    ]
    const result = simulatePlan(doc.plan)
    expect(result.records.map((r) => r.kind)).toEqual(['actor', 'cycleBoundary'])
    const rows = buildSkillPointLedger(result, 'moc')
    expect(rows[0]).toMatchObject({ skillRecovery: 1, endingBalance: 4 })
    expect(rows[1]).toMatchObject({
      openingBalance: 4,
      externalRecovery: 0,
      endingBalance: 4,
      endingMax: 5,
    })
  })
  it('shows one whole-run row with cycles disabled and includes opening operations', () => {
    const doc = document()
    doc.plan.cycleMode = 'none'
    doc.plan.events[2]!.operations = []
    doc.plan.events[1] = {
      anchor: { kind: 'start' },
      operations: [{ id: 'opening', type: 'restoreSkillPoints', amount: 1, source: 'Opening' }],
    }
    const rows = buildSkillPointLedger(simulatePlan(doc.plan), 'none')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      cycle: null,
      openingBalance: 3,
      totalCost: 1,
      skillRecovery: 1,
      externalRecovery: 1,
      endingBalance: 4,
    })
  })
  it('suppresses complete totals for unknown rows while preserving earlier known cycles', () => {
    const doc = document()
    delete doc.plan.events[2]!.skill
    const rows = buildSkillPointLedger(simulatePlan(doc.plan), 'moc')
    expect(rows[0]).toMatchObject({ unknown: false, totalCost: 0, endingBalance: 4 })
    for (const row of rows.slice(1))
      expect(row).toMatchObject({
        unknown: true,
        totalCost: null,
        skillRecovery: null,
        externalRecovery: null,
        refill: null,
        capLoss: null,
        endingBalance: null,
      })
  })
  it('marks counterfactual cycles unverified and finds the first recorded shortfall in each cycle', () => {
    const doc = document()
    doc.plan.skillPoints = { enabled: true, initial: 0, max: 5, onInsufficient: 'mark' }
    doc.plan.events[0]!.skill = { kind: 'skill' }
    const rows = buildSkillPointLedger(simulatePlan(doc.plan), 'moc')
    expect(rows.every((row) => row.unverified && !row.unknown)).toBe(true)
    expect(rows[0].firstInsufficient).toMatchObject({ participantId: 'a', turn: 1 })
    expect(rows[1].firstInsufficient).toMatchObject({ participantId: 'a', turn: 2 })
    expect(rows[1]).toMatchObject({ totalCost: 1, externalRecovery: 1, endingBalance: -1 })
  })
  it('accounts for buffer refill and cap-clamp losses without counting storage deposits as restoration', () => {
    const doc = document()
    doc.plan.skillPoints = {
      enabled: true,
      initial: 7,
      max: 5,
      maxModifiers: [{ amount: 2, sourceParticipantId: 'a' }],
    }
    doc.plan.events.unshift({
      anchor: { kind: 'start' },
      operations: [
        {
          id: 'store',
          type: 'restoreSkillPoints',
          amount: 6,
          source: 'Store',
          storeOverflow: true,
        },
      ],
    })
    doc.plan.events[1]!.skill = { kind: 'skill' }
    doc.plan.events[2]!.operations = [
      { id: 'depart', type: 'depart', target: { kind: 'participants', participantIds: ['a'] } },
    ]
    const result = simulatePlan(doc.plan)
    const rows = buildSkillPointLedger(result, 'moc')
    expect(rows[0]).toMatchObject({
      openingBalance: 7,
      totalCost: 1,
      externalRecovery: 0,
      refill: 1,
      endingBalance: 7,
      storedBalance: 5,
    })
    expect(rows[1]).toMatchObject({
      openingMax: 7,
      endingMax: 5,
      capLoss: 2,
      endingBalance: 5,
      storedBalance: 5,
    })
    expect(rows[1].capChanges[0]).toMatchObject({ beforeMax: 7, afterMax: 5, loss: 2 })
    expect(rows.reduce((n, row) => n + row.capLoss!, 0)).toBe(result.skillPointsSummary!.capLoss)
  })
  it('excludes uncommitted recovery at the blocked node while showing its failure anchor', () => {
    const doc = document()
    doc.plan.skillPoints!.initial = 0
    doc.plan.events[0]!.skill = { kind: 'custom', cost: 2, recovery: 0 }
    doc.plan.events[0]!.operations = [
      {
        id: 'candidate',
        type: 'restoreSkillPoints',
        phase: 'preAction',
        amount: 1,
        source: 'Candidate',
      },
    ]
    const rows = buildSkillPointLedger(simulatePlan(doc.plan), 'moc')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      stopped: true,
      unverified: false,
      externalRecovery: 0,
      totalCost: 0,
      endingBalance: 0,
      firstInsufficient: doc.plan.events[0]!.anchor,
    })
  })
  it('includes selected conditional refunds in external restoration', () => {
    const doc = document()
    doc.plan.cycleMode = 'none'
    doc.plan.maxNodes = 1
    doc.plan.events = [
      {
        anchor: { kind: 'action', participantId: 'a', turn: 1 },
        skill: { kind: 'skill' },
        operations: [
          {
            id: 'refund',
            type: 'conditionalRestore',
            phase: 'postAction',
            amount: 1,
            chance: 0.5,
            cooldownTurns: 1,
            outcome: 'proc',
            sourceParticipantId: 'a',
            source: 'Refund',
          },
        ],
      },
    ]
    expect(buildSkillPointLedger(simulatePlan(doc.plan), 'none')[0]).toMatchObject({
      totalCost: 1,
      externalRecovery: 1,
      skillRecovery: 0,
      endingBalance: 3,
    })
  })
  it('does not invent accounting when SP validation is disabled', () => {
    const doc = document()
    doc.plan.skillPoints!.enabled = false
    expect(buildSkillPointLedger(simulatePlan(doc.plan), 'moc')).toEqual([])
  })
})
