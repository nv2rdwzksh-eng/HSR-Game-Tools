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
  }
  if (available !== undefined && turn < available) {
    record.status = 'cooldown'
    record.availableFromTurn = available
    return record
  }
  if (operation.outcome === 'no-proc') return record
  const availableFromTurn = turn + operation.cooldownTurns + 1
  if (!Number.isSafeInteger(availableFromTurn)) fail('invalid-input')
  state.conditionalCooldowns.set(operation.sourceParticipantId, availableFromTurn)
  record.status = 'proc'
  record.availableFromTurn = availableFromTurn
  if (state.current === null) {
    Object.assign(record, { restored: null, overflow: null, stored: null, wasted: null })
    return record
  }
  const restored = Math.min(operation.amount, state.max - state.current)
  state.current += restored
  Object.assign(record, {
    after: state.current,
    restored,
    overflow: operation.amount - restored,
    wasted: operation.amount - restored,
  })
  return record
}
