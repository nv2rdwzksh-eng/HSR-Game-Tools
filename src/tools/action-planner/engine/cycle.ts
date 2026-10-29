import type { CycleMode, PendingCycleBoundary, SimulationState } from './types'

export const CYCLE_RULES = {
  moc: { firstCycleAV: 150, subsequentCycleAV: 100 },
  aa: { firstCycleAV: 300, subsequentCycleAV: 100 },
} as const

export function cycleBoundaryAV(mode: Exclude<CycleMode, 'none'>, ordinal: number): number {
  const rule = CYCLE_RULES[mode]
  return rule.firstCycleAV + rule.subsequentCycleAV * (ordinal - 1)
}

/** Only one pending boundary; an empty queue cannot advance to a future cycle. */
export function pendingCycleBoundary(state: SimulationState): PendingCycleBoundary | undefined {
  if (!state.cycle) return undefined
  const elapsedAV = cycleBoundaryAV(state.cycle.mode, state.cycle.nextOrdinal)
  if (elapsedAV > state.cycle.maxAV) return undefined
  const remainingAV = Math.max(0, elapsedAV - state.elapsedAV)
  if (!state.participants.length && remainingAV > 0) return undefined
  return {
    kind: 'cycleBoundary',
    anchor: { kind: 'cycleBoundary', ordinal: state.cycle.nextOrdinal },
    elapsedAV,
    remainingAV,
  }
}
