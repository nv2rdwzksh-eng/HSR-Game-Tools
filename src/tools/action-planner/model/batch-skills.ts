import { anchorKey } from '../engine/queue'
import { usesSkillPoints, validActionSkill } from '../engine/skill-points'
import type {
  ActionSkill,
  EventAnchor,
  ParticipantNodeRecord,
  SimulationResult,
} from '../engine/types'
import type { PlannerDocument } from './editor'

export type BatchSkillFilter =
  | { scope: 'all' }
  | { scope: 'after'; anchor: EventAnchor }
  | { scope: 'participant'; participantId: string }
export interface BatchSkillPreview {
  document: PlannerDocument
  result: SimulationResult
  skill: ActionSkill
  selectedCount: number
  overwriteCount: number
  changes: readonly Extract<EventAnchor, { kind: 'action' }>[]
  invalid: 'skill' | 'conditionalSkill' | undefined
}

/** Includes the displayed blocked action; never generates future or unreachable action identities. */
export function batchSkillCandidates(
  result: SimulationResult,
  filter: BatchSkillFilter,
): ParticipantNodeRecord[] {
  const records = [...result.records, ...(result.blockedAction ? [result.blockedAction] : [])]
  const after =
    filter.scope === 'after' && filter.anchor.kind !== 'start'
      ? records.findIndex((record) => anchorKey(record.anchor) === anchorKey(filter.anchor))
      : -1
  if (filter.scope === 'after' && filter.anchor.kind !== 'start' && after === -1) return []
  const seen = new Set<string>()
  return records.filter((record, index): record is ParticipantNodeRecord => {
    if (record.kind !== 'actor' || record.camp !== 'ally' || record.anchor.kind !== 'action')
      return false
    if (!usesSkillPoints(record.beforeEffects.participants.find((p) => p.id === record.id)))
      return false
    if (filter.scope === 'after' && index <= after) return false
    if (filter.scope === 'participant' && record.id !== filter.participantId) return false
    const key = anchorKey(record.anchor)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
const sameSkill = (a: ActionSkill | undefined, b: ActionSkill): boolean =>
  !!a &&
  a.kind === b.kind &&
  (b.kind !== 'custom' || (a.kind === 'custom' && a.cost === b.cost && a.recovery === b.recovery))

export function previewBatchSkills(
  document: PlannerDocument,
  result: SimulationResult,
  filter: BatchSkillFilter,
  skill: ActionSkill,
): BatchSkillPreview {
  const candidates = batchSkillCandidates(result, filter)
  const events = new Map(document.plan.events.map((event) => [anchorKey(event.anchor), event]))
  const changes: Extract<EventAnchor, { kind: 'action' }>[] = []
  let overwriteCount = 0
  let invalid: BatchSkillPreview['invalid'] = validActionSkill(skill) ? undefined : 'skill'
  for (const record of candidates) {
    const event = events.get(anchorKey(record.anchor))
    if (sameSkill(event?.skill, skill)) continue
    if (event?.skill) overwriteCount++
    if (skill.kind !== 'skill' && event?.operations.some((op) => op.type === 'conditionalRestore'))
      invalid = 'conditionalSkill'
    if (record.anchor.kind === 'action') changes.push({ ...record.anchor })
  }
  return Object.freeze({
    document,
    result,
    skill: Object.freeze({ ...skill }),
    selectedCount: candidates.length,
    overwriteCount,
    changes: Object.freeze(changes.map((anchor) => Object.freeze(anchor))),
    invalid,
  })
}

/** Preserves all existing events and operation arrays; new entries are skill-only action events. */
export function applyBatchSkillPreview(preview: BatchSkillPreview): PlannerDocument['plan'] {
  const pending = new Map(preview.changes.map((anchor) => [anchorKey(anchor), anchor]))
  const events = preview.document.plan.events.map((event) => {
    if (!pending.delete(anchorKey(event.anchor))) return event
    return { ...event, skill: { ...preview.skill } }
  })
  for (const anchor of pending.values())
    events.push({ anchor: { ...anchor }, operations: [], skill: { ...preview.skill } })
  return { ...preview.document.plan, events }
}
