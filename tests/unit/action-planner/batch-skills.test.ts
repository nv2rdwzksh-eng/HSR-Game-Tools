import { describe, expect, it } from 'vitest'
import { watch } from 'vue'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import { anchorKey } from '../../../src/tools/action-planner/engine/queue'
import {
  emptyDocument,
  PLANNER_VERSION,
  serializePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'
import {
  batchSkillCandidates,
  previewBatchSkills,
  applyBatchSkillPreview,
} from '../../../src/tools/action-planner/model/batch-skills'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { createPlannerPersistence } from '../../../src/tools/action-planner/model/persistence'

function document() {
  const doc = emptyDocument()
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
    {
      id: 'b',
      kind: 'actor',
      camp: 'ally',
      name: 'B',
      position: 1,
      baseSpeed: 100,
      panelSpeed: 200,
    },
    {
      id: 'enemy',
      kind: 'actor',
      camp: 'enemy',
      name: 'Enemy',
      position: 0,
      baseSpeed: 150,
      panelSpeed: 150,
    },
  ]
  doc.plan.aha.contributorIds = ['a']
  doc.plan.maxNodes = 10
  doc.plan.maxAV = 260
  doc.plan.events = [
    {
      anchor: { kind: 'start' },
      operations: [
        {
          id: 'clock',
          type: 'spawnParticipant',
          participant: { kind: 'scheduledEvent', name: 'Clock', speed: 100, initialAG: 0 },
        },
      ],
    },
    {
      anchor: { kind: 'action', participantId: 'a', turn: 1 },
      skill: { kind: 'basic' },
      operations: [
        {
          id: 'keep',
          type: 'addSpeedModifier',
          phase: 'postAction',
          target: { kind: 'allies' },
          mode: 'flat',
          amount: 0,
          duration: { kind: 'turns', turns: null },
        },
      ],
    },
    {
      anchor: { kind: 'action', participantId: 'a', turn: 99 },
      skill: { kind: 'custom', cost: 0, recovery: 0 },
      operations: [],
    },
  ]
  doc.metadata.customNames.keep = 'Keep this operation'
  return doc
}
describe('bounded batch skill annotations', () => {
  it('filters allied actions and respects record order after the selected anchor, including equal AV', () => {
    const doc = document()
    const result = simulatePlan(doc.plan)
    const all = batchSkillCandidates(result, { scope: 'all' })
    expect(all.length).toBeGreaterThan(3)
    expect(
      all.every((r) => r.kind === 'actor' && r.camp === 'ally' && r.anchor.kind === 'action'),
    ).toBe(true)
    expect(batchSkillCandidates(result, { scope: 'after', anchor: { kind: 'start' } })).toEqual(all)
    const after = batchSkillCandidates(result, {
      scope: 'after',
      anchor: { kind: 'action', participantId: 'a', turn: 1 },
    })
    expect(
      after.some((r) => r.anchor.kind === 'action' && r.id === 'b' && r.anchor.turn === 2),
    ).toBe(true)
    expect(
      after.some((r) => r.id === 'a' && r.anchor.kind === 'action' && r.anchor.turn === 1),
    ).toBe(false)
    expect(
      batchSkillCandidates(result, { scope: 'participant', participantId: 'a' }).every(
        (r) => r.id === 'a',
      ),
    ).toBe(true)
    expect(
      batchSkillCandidates(result, {
        scope: 'after',
        anchor: { kind: 'action', participantId: 'a', turn: 99 },
      }),
    ).toEqual([])
  })
  it('reports overwrite counts, preserves operations and identity, and creates missing skill-only events', () => {
    const doc = document()
    const before = serializePlannerDocument(doc)
    const result = simulatePlan(doc.plan)
    const preview = previewBatchSkills(
      doc,
      result,
      { scope: 'participant', participantId: 'a' },
      { kind: 'skill' },
    )
    expect(preview.overwriteCount).toBe(1)
    expect(preview.changes).toHaveLength(2)
    const next = applyBatchSkillPreview(preview)
    expect(serializePlannerDocument(doc)).toBe(before)
    const old = doc.plan.events[1]!
    const updated = next.events.find((e) => anchorKey(e.anchor) === anchorKey(old.anchor))!
    expect(updated.anchor).toBe(old.anchor)
    expect(updated.operations).toBe(old.operations)
    expect(updated.skill).toEqual({ kind: 'skill' })
    expect(
      next.events.find(
        (e) => e.anchor.kind === 'action' && e.anchor.participantId === 'a' && e.anchor.turn === 2,
      ),
    ).toMatchObject({ operations: [], skill: { kind: 'skill' } })
    expect(next.events[0]).toBe(doc.plan.events[0])
    expect(next.events[2]).toBe(doc.plan.events[2])
    expect(next.maxNodes).toBe(doc.plan.maxNodes)
    expect(next.maxAV).toBe(doc.plan.maxAV)
  })
  it('requires a preview confirmation token and publishes/persists once; cancel never writes', () => {
    const doc = document()
    const planner = useActionPlanner(doc.plan, doc.metadata)
    let raw: string | null = null
    let writes = 0
    const persistence = createPlannerPersistence(() => ({
      getItem: () => raw,
      setItem: (_key, value) => {
        raw = value
        writes++
      },
    }))
    persistence.initialize()
    const stop = watch(planner.document, (value) => persistence.save(value), { flush: 'sync' })
    const original = planner.document.value
    expect(planner.confirmBatchSkills()).toBe(false)
    planner.reviewBatchSkills({ scope: 'all' }, { kind: 'skill' })
    expect(planner.batchSkillPreview.value!.overwriteCount).toBe(1)
    expect(planner.document.value).toBe(original)
    planner.cancelBatchSkills()
    expect(writes).toBe(0)
    expect(raw).toBeNull()
    const reviewed = planner.reviewBatchSkills({ scope: 'all' }, { kind: 'skill' })
    expect(planner.confirmBatchSkills(reviewed)).toBe(true)
    expect(writes).toBe(1)
    expect(planner.document.value.metadata).toEqual(doc.metadata)
    expect(JSON.parse(raw!).version).toBe(PLANNER_VERSION)
    expect(PLANNER_VERSION).toBe(9)
    expect(raw).not.toContain('batchSkillPreview')
    expect(raw).not.toContain('ledger')
    stop()
  })
  it('rejects stale confirmation instead of applying an outdated range to changed identities', () => {
    const doc = document()
    const planner = useActionPlanner(doc.plan, doc.metadata)
    const reviewed = planner.reviewBatchSkills({ scope: 'all' }, { kind: 'skill' })
    planner.rename('Changed while reviewing')
    const current = planner.document.value
    expect(planner.confirmBatchSkills(reviewed)).toBe(false)
    expect(planner.batchSkillError.value).toBe('stale')
    expect(planner.document.value).toBe(current)
  })
  it('allows fixing the displayed blocked action without annotating newly revealed future actions', () => {
    const doc = emptyDocument()
    doc.plan.skillPoints = { enabled: true, initial: 0 }
    doc.plan.actors = [document().plan.actors[0]!]
    doc.plan.maxNodes = 3
    doc.plan.events = [
      {
        anchor: { kind: 'action', participantId: 'a', turn: 1 },
        operations: [],
        skill: { kind: 'skill' },
      },
    ]
    const planner = useActionPlanner(doc.plan)
    const preview = planner.reviewBatchSkills({ scope: 'all' }, { kind: 'basic' })
    expect(preview.selectedCount).toBe(1)
    expect(planner.confirmBatchSkills(preview)).toBe(true)
    expect(planner.result.value.records).toHaveLength(3)
    expect(planner.plan.value.events).toHaveLength(1)
  })
  it('detects conditional-refund incompatibility without altering operations or publishing a partial batch', () => {
    const doc = document()
    doc.plan.events[1]!.skill = { kind: 'skill' }
    doc.plan.events[1]!.operations.push({
      id: 'refund',
      type: 'conditionalRestore',
      phase: 'postAction',
      amount: 1,
      chance: 0.5,
      cooldownTurns: 1,
      outcome: 'proc',
      sourceParticipantId: 'a',
      source: 'Refund',
    })
    const planner = useActionPlanner(doc.plan, doc.metadata)
    const original = planner.document.value
    const preview = planner.reviewBatchSkills({ scope: 'all' }, { kind: 'basic' })
    expect(preview.invalid).toBe('conditionalSkill')
    expect(planner.confirmBatchSkills(preview)).toBe(false)
    expect(planner.document.value).toBe(original)
  })
  it('does not commit identical skills or invalid custom amounts', () => {
    const doc = document()
    const planner = useActionPlanner(doc.plan, doc.metadata)
    let preview = planner.reviewBatchSkills(
      { scope: 'all' },
      { kind: 'custom', cost: -1, recovery: 0 },
    )
    expect(preview.invalid).toBe('skill')
    expect(planner.confirmBatchSkills(preview)).toBe(false)
    preview = planner.reviewBatchSkills({ scope: 'all' }, { kind: 'skill' })
    expect(planner.confirmBatchSkills(preview)).toBe(true)
    const current = planner.document.value
    preview = planner.reviewBatchSkills({ scope: 'all' }, { kind: 'skill' })
    expect(preview.changes).toHaveLength(0)
    expect(planner.confirmBatchSkills(preview)).toBe(false)
    expect(planner.document.value).toBe(current)
  })
})
