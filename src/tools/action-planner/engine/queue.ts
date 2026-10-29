import { isNaturalParticipant } from './types'
import type {
  AhaConfig,
  ActorState,
  ActionChangeTrace,
  Diagnostic,
  DiagnosticCode,
  EventAnchor,
  ParticipantState,
  ParticipantAnchor,
  QueueSnapshot,
  SimulationState,
  SpeedModifierInstance,
} from './types'
import { pendingCycleBoundary } from './cycle'

export const FULL_AG = 10000
export const DEFAULT_LIMITS = { maxNodes: 60, maxAV: 600 } as const
export const HARD_LIMITS = { maxNodes: 500, maxAV: 100000 } as const
export const anchorKey = (anchor: EventAnchor): string =>
  anchor.kind === 'start'
    ? 'start'
    : anchor.kind === 'cycleBoundary'
      ? `cycleBoundary:${anchor.ordinal}`
      : anchor.kind === 'trigger'
        ? `trigger:${encodeURIComponent(anchor.participantId)}`
        : `action:${encodeURIComponent(anchor.participantId)}:${anchor.turn}`
export const spawnedParticipantId = (operationId: string): string =>
  `spawn:${encodeURIComponent(operationId)}`
export const countdownParticipantId = (operationId: string): string =>
  `countdown:${encodeURIComponent(operationId)}`
export const modifierId = (operationId: string, participantId: string): string =>
  `${encodeURIComponent(operationId)}::${encodeURIComponent(participantId)}`
export class SimulationError extends Error {
  constructor(public diagnostic: Diagnostic) {
    super(diagnostic.code)
  }
}
export function fail(code: DiagnosticCode, participantId?: string): never {
  throw new SimulationError({
    code,
    severity: 'error',
    ...(participantId ? { participantId } : {}),
  })
}
export function finite(value: number): number {
  if (!Number.isFinite(value)) fail('non-finite')
  return value
}
export const defaultAhaConfig = (): AhaConfig => ({
  id: 'aha-instant',
  baseSpeed: 80,
  contributorIds: [] as string[],
})
/** Shared formula only; runtime speeds must be resolved through effectiveSpeed. */
export function elationContribution(speeds: readonly number[]): number {
  return [...speeds]
    .sort((a, b) => b - a)
    .slice(0, 4)
    .reduce((sum, speed, index) => finite(sum + speed / (5 * 2 ** index)), 0)
}
function modifierSpeed(participant: ParticipantState): number {
  const baseSpeed =
    participant.kind === 'scheduledEvent'
      ? (participant.baseSpeed ?? participant.speed)
      : participant.baseSpeed
  return participant.modifiers.reduce(
    (sum, buff) =>
      finite(sum + (buff.mode === 'flat' ? buff.amount : (baseSpeed * buff.amount) / 100)),
    0,
  )
}
function checkedSpeed(speed: number, id: string): number {
  finite(speed)
  if (speed <= 0) fail('invalid-speed', id)
  return speed
}
function actorSpeed(actor: ActorState): number {
  return checkedSpeed(actor.panelSpeed + modifierSpeed(actor), actor.id)
}
export function effectiveSpeed(participant: ParticipantState, state: SimulationState): number {
  if (participant.kind === 'scheduledEvent')
    return checkedSpeed(participant.speed + modifierSpeed(participant), participant.id)
  if (participant.kind === 'actor') return actorSpeed(participant)
  const speeds = state.participants
    .filter((p): p is ActorState => p.kind === 'actor' && participant.contributorIds.includes(p.id))
    .map(actorSpeed)
  return checkedSpeed(
    finite(participant.baseSpeed + elationContribution(speeds)) + modifierSpeed(participant),
    participant.id,
  )
}
function cloneModifiers(modifiers: readonly SpeedModifierInstance[]): SpeedModifierInstance[] {
  return modifiers.map((buff) => ({ ...buff, lifetime: { ...buff.lifetime } }))
}
export function cloneState(state: SimulationState): SimulationState {
  return {
    ...state,
    ...(state.skillPoints ? { skillPoints: { ...state.skillPoints } } : {}),
    ...(state.cycle ? { cycle: { ...state.cycle } } : {}),
    issuedParticipantIds: new Set(state.issuedParticipantIds),
    participants: state.participants.map((participant) => ({
      ...participant,
      ...(participant.kind === 'aha' ? { contributorIds: [...participant.contributorIds] } : {}),
      pendingActionChanges: cloneActionChanges(participant.pendingActionChanges),
      modifiers: cloneModifiers(participant.modifiers),
    })),
  }
}
export function cloneActionChanges(changes: readonly ActionChangeTrace[]): ActionChangeTrace[] {
  return changes.map((change) => ({
    ...change,
    sourceAnchor: { ...change.sourceAnchor },
    targetAnchor: { ...change.targetAnchor },
  }))
}
export function orderedParticipants(state: SimulationState): ParticipantState[] {
  return state.participants
    .filter((participant) => !participant.departed && participant.id !== state.activeParticipantId)
    .sort((a, b) => {
      const difference =
        a.remainingAG / effectiveSpeed(a, state) - b.remainingAG / effectiveSpeed(b, state)
      if (difference !== 0) return difference
      if (a.remainingAG === 0 && b.remainingAG === 0) {
        if (a.zeroBatch !== b.zeroBatch) return b.zeroBatch - a.zeroBatch
        if (a.zeroBatch && a.zeroOrder !== b.zeroOrder) return a.zeroOrder - b.zeroOrder
      }
      return a.order - b.order
    })
}
export function nextAnchor(participant: ParticipantState): ParticipantAnchor {
  return isNaturalParticipant(participant)
    ? { kind: 'action', participantId: participant.id, turn: participant.turns + 1 }
    : { kind: 'trigger', participantId: participant.id }
}
export function queueSnapshot(state: SimulationState): QueueSnapshot {
  const boundary = pendingCycleBoundary(state)
  return {
    ...(boundary ? { nextCycleBoundary: boundary } : {}),
    elapsedAV: state.elapsedAV,
    completedNodes: state.completedNodes,
    completedActions: state.completedActions,
    queue: orderedParticipants(state).map((participant) => ({
      id: participant.id,
      kind: participant.kind,
      name: participant.name,
      iconUrl: participant.iconUrl,
      ...(isNaturalParticipant(participant) ? { camp: participant.camp } : {}),
      anchor: nextAnchor(participant),
      remainingAG: participant.remainingAG,
      remainingAV: finite(participant.remainingAG / effectiveSpeed(participant, state)),
      effectiveSpeed: effectiveSpeed(participant, state),
      actionChanges: cloneActionChanges(participant.pendingActionChanges),
      modifiers: cloneModifiers(participant.modifiers),
    })),
  }
}
export function assertState(state: SimulationState): void {
  for (const participant of state.participants)
    finite(participant.remainingAG / effectiveSpeed(participant, state))
}
/** Only normalize subtraction roundoff; never use an AV ordering epsilon. */
export function advanceTime(state: SimulationState, deltaAV: number): void {
  const speeds = state.participants.map((p) => effectiveSpeed(p, state))
  state.elapsedAV = finite(state.elapsedAV + deltaAV)
  for (const [index, participant] of state.participants.entries()) {
    if (participant.departed) continue
    const consumed = finite(deltaAV * speeds[index]!)
    const residual = participant.remainingAG - consumed
    const tolerance = Number.EPSILON * 8 * Math.max(FULL_AG, participant.remainingAG, consumed)
    participant.remainingAG = residual <= tolerance ? 0 : residual
    if (participant.remainingAG > 0) {
      participant.zeroBatch = 0
      participant.zeroOrder = 0
    }
  }
}
