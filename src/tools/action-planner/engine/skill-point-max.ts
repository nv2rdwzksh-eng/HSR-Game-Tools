import { fail } from './queue'
import type { SimulationState, SkillPointMaxChange, SkillPointMaxModifier } from './types'

export function effectiveSkillPointMax(
  base: number,
  modifiers: readonly SkillPointMaxModifier[],
  present: (id: string) => boolean,
): number {
  return modifiers.reduce(
    (max, modifier) =>
      !modifier.sourceParticipantId || present(modifier.sourceParticipantId)
        ? max + modifier.amount
        : max,
    base,
  )
}

/** Recomputed inside the same candidate transaction as presence/removal. Storage is untouched. */
export function recomputeSkillPointMax(
  state: SimulationState,
  reason: SkillPointMaxChange['reason'],
  operationId?: string,
  participantId?: string,
): SkillPointMaxChange | undefined {
  const sp = state.skillPoints
  if (!sp) return
  const afterMax = effectiveSkillPointMax(sp.baseMax, sp.maxModifiers, (id) =>
    state.participants.some(
      (p) => p.id === id && p.kind === 'actor' && p.camp === 'ally' && !p.departed,
    ),
  )
  if (!Number.isSafeInteger(afterMax) || afterMax < 0) fail('invalid-sp-max')
  if (reason === 'initial' && sp.current !== null && sp.current > afterMax) fail('invalid-sp-max')
  const beforeMax = sp.max
  if (beforeMax === afterMax) return
  const before = sp.current
  sp.max = afterMax
  if (afterMax < beforeMax && sp.current !== null && sp.current > afterMax) sp.current = afterMax
  return {
    reason,
    operationId,
    participantId,
    beforeMax,
    afterMax,
    before,
    after: sp.current,
    loss: before === null || sp.current === null ? 0 : before - sp.current,
  }
}
