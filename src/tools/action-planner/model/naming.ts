import { anchorKey, orderedParticipants } from '../engine/queue'
import { operationTargets, targetIds } from '../engine/targeting'
import type {
  ActionChangeTrace,
  EffectOperation,
  EventAnchor,
  ParticipantInfo,
  SimulationState,
  Target,
} from '../engine/types'
import type { MessageDescriptor } from '../../../locales/types'

export function participantLabels(
  participants: readonly ParticipantInfo[],
  name: (id: string) => string,
): Map<string, string> {
  const groups = new Map<string, ParticipantInfo[]>()
  for (const p of participants) {
    const label = name(p.id)
    const group = groups.get(label) ?? []
    group.push(p)
    groups.set(label, group)
  }
  const labels = new Map<string, string>()
  for (const [label, group] of groups)
    group
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .forEach((p, i) => labels.set(p.id, group.length > 1 ? `${label} #${i + 1}` : label))
  return labels
}
export function namingTargets(
  operation: Exclude<EffectOperation, { type: 'spawnParticipant' | 'restoreSkillPoints' }>,
  state?: SimulationState,
): string[] | undefined {
  if (!state) return undefined
  const participants = operationTargets(state, operation.type)
  const ids = targetIds(operation.target, participants)
  if (ids.some((id) => !participants.some((p) => p.id === id))) return undefined
  if (
    operation.type === 'addSpeedModifier' ||
    operation.type === 'depart' ||
    operation.type === 'returnToField'
  )
    return ids
  const queued = new Set(orderedParticipants(state).map((p) => p.id))
  return ids.filter((id) => queued.has(id))
}
export function targetDescription(
  target: Target,
  name: (id: string) => string,
  ids?: readonly string[],
): string | MessageDescriptor {
  if (ids?.length === 1) return name(ids[0]!)
  if (ids) return { key: 'planner.target.count', params: { count: ids.length } }
  if (target.kind === 'participants' && target.participantIds.length === 1)
    return name(target.participantIds[0]!)
  return { key: `planner.target.${target.kind}` }
}
export function operationNameDescriptor(
  operation: EffectOperation,
  name: (id: string) => string,
  state?: SimulationState,
): MessageDescriptor {
  if (operation.type === 'restoreSkillPoints')
    return {
      key: 'planner.sp.eventLabel',
      params: { amount: operation.amount, source: operation.source },
    }
  if (operation.type === 'spawnParticipant') {
    const p = operation.participant
    const kind =
      p.kind === 'scheduledEvent'
        ? 'createEvent'
        : p.camp === 'enemy'
          ? 'createEnemy'
          : p.category === 'summon'
            ? 'createSummon'
            : p.category === 'memosprite'
              ? 'createMemosprite'
              : 'createActor'
    return { key: `planner.operationName.${kind}`, params: { name: p.name } }
  }
  const target = targetDescription(operation.target, name, namingTargets(operation, state))
  if (operation.type === 'advance' || operation.type === 'delay')
    return {
      key: `planner.operationName.${operation.type}`,
      params: { target, percent: operation.percent },
    }
  if (
    operation.type === 'immediatelyAct' ||
    operation.type === 'depart' ||
    operation.type === 'returnToField'
  )
    return { key: `planner.operationName.${operation.type}`, params: { target } }
  const direction = operation.amount >= 0 ? 'increase' : 'decrease'
  const mode = operation.mode === 'percent' ? 'Percent' : 'Flat'
  return {
    key: `planner.operationName.${direction}${mode}`,
    params: { target, amount: Math.abs(operation.amount) },
  }
}
export function actionDirections(
  anchor: EventAnchor,
  changes: readonly ActionChangeTrace[],
): { advance: boolean; delay: boolean; immediatelyAct: boolean } {
  const relevant = changes.filter((c) => anchorKey(c.targetAnchor) === anchorKey(anchor))
  return {
    advance: relevant.some((c) => c.type === 'advance'),
    delay: relevant.some((c) => c.type === 'delay'),
    immediatelyAct: relevant.some((c) => c.type === 'immediatelyAct'),
  }
}

/** Unknown display nodes use the neutral fallback without weakening engine validation. */
export function nodeCamp(node: {
  kind?: string
  camp?: string
}): 'ally' | 'enemy' | 'event' | 'system' | 'unknown' | 'neutral' {
  if (node.kind === 'aha') return 'neutral'
  if (node.kind === 'cycleBoundary') return 'system'
  if (node.kind === 'scheduledEvent') return 'event'
  return node.camp === 'ally' || node.camp === 'enemy' ? node.camp : 'unknown'
}
