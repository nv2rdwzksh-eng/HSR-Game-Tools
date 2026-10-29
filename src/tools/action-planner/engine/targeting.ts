import type {
  ParticipantInfo,
  SimulationState,
  SpeedDuration,
  Target,
  TargetedOperation,
} from './types'

export function targetIds(target: Target, participants: readonly ParticipantInfo[]): string[] {
  return target.kind === 'participants'
    ? [...target.participantIds]
    : participants
        .filter(
          (participant) =>
            participant.kind === 'actor' &&
            participant.camp === (target.kind === 'allies' ? 'ally' : 'enemy'),
        )
        .map((participant) => participant.id)
}
/** Structural eligibility also works with the definition catalog, without runtime presence. */
export function validTargetSelection(
  type: TargetedOperation['type'],
  participants: readonly ParticipantInfo[],
): boolean {
  return (
    participants.length > 0 &&
    (type === 'depart' ||
      type === 'returnToField' ||
      participants.every(
        (participant) =>
          participant.kind === 'actor' ||
          (type === 'addSpeedModifier' &&
            (participant.kind === 'aha' || participant.kind === 'scheduledEvent')),
      ) ||
      (participants.length === 1 &&
        participants[0]!.kind === 'scheduledEvent' &&
        (type === 'advance' || type === 'delay')))
  )
}
export function selectableTargets(
  type: TargetedOperation['type'],
  participants: readonly ParticipantInfo[],
  selectedIds: readonly string[],
): ParticipantInfo[] {
  return participants.filter((candidate) =>
    validTargetSelection(type, [
      ...participants.filter(
        (participant) => selectedIds.includes(participant.id) && participant.id !== candidate.id,
      ),
      candidate,
    ]),
  )
}

export function validSpeedDurationForTargets(
  duration: SpeedDuration,
  participants: readonly ParticipantInfo[],
): boolean {
  return (
    !participants.some((participant) => participant.kind === 'scheduledEvent') ||
    (duration.kind === 'turns' && duration.turns === null)
  )
}

/** A triggering event remains in state for diagnostics, but has left the targetable queue. */
export function operationTargets(
  state: SimulationState | undefined,
  type: TargetedOperation['type'] = 'advance',
): ParticipantInfo[] {
  return (
    state?.participants.filter(
      (participant) =>
        (participant.kind !== 'scheduledEvent' || participant.id !== state.activeParticipantId) &&
        participant.departed === (type === 'returnToField'),
    ) ?? []
  )
}
