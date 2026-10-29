import type { EffectOperation, EffectPhase } from './types'

export function phaseOperations(
  operations: readonly EffectOperation[],
  phase: EffectPhase,
): EffectOperation[] {
  return operations.filter((operation) => operation.phase === phase)
}
