import { fail } from './queue'
import type {
  ConditionalRestoreOperation,
  ConditionalRestoreRecord,
  SkillPointsState,
} from './types'

/** The caller supplies the selected result; chance is deliberately never sampled or averaged. */
export function conditionalRestore(
  state: SkillPointsState,
  operation: ConditionalRestoreOperation,
  turn: number,
): ConditionalRestoreRecord {
  const available = state.conditionalCooldowns.get(operation.sourceParticipantId)
  const record: ConditionalRestoreRecord = {
    operationId: operation.id,
    source: operation.source,
    sourceParticipantId: operation.sourceParticipantId,
    amount: operation.amount,
    chance: operation.chance,
    cooldownTurns: operation.cooldownTurns,
    outcome: operation.outcome,
    status: 'no-proc',
    before: state.current,
    after: state.current,
    restored: 0,
    overflow: 0,
    stored: 0,
    wasted: 0,
    storedAfter: state.stored,
    ...(available === undefined ? {} : { availableFromTurn: available }),
  }
  if (state.current === null) record.status = 'unknown'
  else if (available !== undefined && turn < available) record.status = 'cooldown'
  else if (operation.outcome === 'proc') {
    const availableFromTurn = turn + operation.cooldownTurns + 1
    if (!Number.isSafeInteger(availableFromTurn)) fail('invalid-input')
    const restored = Math.min(operation.amount, state.max - state.current)
    state.current += restored
    state.conditionalCooldowns.set(operation.sourceParticipantId, availableFromTurn)
    Object.assign(record, {
      status: 'proc',
      after: state.current,
      restored,
      overflow: operation.amount - restored,
      wasted: operation.amount - restored,
      availableFromTurn,
    })
  }
  return record
}
