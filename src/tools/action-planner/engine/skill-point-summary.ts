import type { SimulationResult, SkillPointsState, SkillPointsSummary } from './types'

/** Counts committed execution only. Unknown actions make complete totals unknowable. */
export function summarizeSkillPoints(
  result: SimulationResult,
  state: SkillPointsState,
): SkillPointsSummary {
  let totalCost: number | null = 0
  let totalRecovery: number | null = 0
  const first = [...result.records, ...(result.blockedAction ? [result.blockedAction] : [])].find(
    (record) => record.kind !== 'cycleBoundary' && record.skillPoints?.status === 'insufficient',
  )
  const events = [...(result.startSkillPointEvents ?? [])]
  for (const record of result.records) {
    events.push(...(record.skillPointEvents ?? []))
    if (record.refill && totalRecovery !== null) totalRecovery += record.refill.amount
    if (record.kind === 'cycleBoundary' || !record.skillPoints) continue
    const skill = record.skillPoints
    totalCost = totalCost === null || skill.paid === null ? null : totalCost + (skill.paid ?? 0)
    totalRecovery =
      totalRecovery === null || skill.recovery === null
        ? null
        : totalRecovery + (skill.recovery ?? 0)
  }
  for (const event of events) {
    if (event.committed === false) continue
    totalRecovery =
      totalRecovery === null || event.restored === null ? null : totalRecovery + event.restored
  }
  return {
    ...(first && first.anchor.kind !== 'cycleBoundary'
      ? { firstInsufficient: { ...first.anchor } }
      : {}),
    totalCost,
    totalRecovery,
    endingBalance: state.current,
    storedBalance: state.stored,
    status: result.blockedAction
      ? 'insufficient'
      : state.current === null
        ? 'unknown'
        : state.unverified
          ? 'unverified'
          : 'known',
  }
}
