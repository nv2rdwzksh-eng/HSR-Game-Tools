import type {
  CycleMode,
  ParticipantAnchor,
  SimulationResult,
  SkillPointMaxChange,
  SkillPointsState,
} from '../engine/types'

export interface SkillPointLedgerRow {
  cycle: number | null
  openingBalance: number | null
  totalCost: number | null
  skillRecovery: number | null
  externalRecovery: number | null
  refill: number | null
  endingBalance: number | null
  storedBalance: number | null
  openingMax: number
  endingMax: number
  capChanges: SkillPointMaxChange[]
  capLoss: number | null
  firstInsufficient?: ParticipantAnchor
  unknown: boolean
  unverified: boolean
  stopped: boolean
}

/** Read-only accounting over committed records. Boundary operations belong to the new cycle. */
export function buildSkillPointLedger(
  result: SimulationResult,
  mode: CycleMode,
): SkillPointLedgerRow[] {
  const initial = result.startState?.skillPoints
  const summary = result.skillPointsSummary
  if (!initial || !summary) return []
  const createRow = (cycle: number | null, state: SkillPointsState): SkillPointLedgerRow => ({
    cycle,
    openingBalance: state.current,
    totalCost: 0,
    skillRecovery: 0,
    externalRecovery: 0,
    refill: 0,
    endingBalance: state.current,
    storedBalance: state.stored,
    openingMax: state.max,
    endingMax: state.max,
    capChanges: [],
    capLoss: 0,
    unknown: state.current === null,
    unverified: !!state.unverified,
    stopped: false,
  })
  const rows: SkillPointLedgerRow[] = []
  let row = createRow(mode === 'none' ? null : 0, initial)
  const addChanges = (changes: readonly SkillPointMaxChange[]) => {
    row.capChanges.push(...changes.map((change) => ({ ...change })))
    row.capLoss! += changes.reduce((total, change) => total + change.loss, 0)
  }
  const addRecovery = (receipts: NonNullable<SimulationResult['startSkillPointEvents']>) => {
    for (const receipt of receipts) {
      if (receipt.committed === false) continue
      if (receipt.restored === null) row.unknown = true
      else row.externalRecovery! += receipt.restored
    }
  }
  const finish = (balance: number | null, stored: number | null, max: number) => {
    row.endingBalance = balance
    row.storedBalance = stored
    row.endingMax = max
    row.unknown ||= balance === null
    if (row.unknown) {
      row.totalCost = row.skillRecovery = row.externalRecovery = row.refill = row.capLoss = null
    }
    rows.push(row)
  }
  addRecovery(result.startSkillPointEvents ?? [])
  addChanges(result.startMaxChanges ?? [])
  for (const record of result.records) {
    if (record.kind === 'cycleBoundary' && mode !== 'none') {
      const state = record.beforeEffects.skillPoints!
      finish(state.current, state.stored, state.max)
      row = createRow(record.anchor.ordinal, state)
    }
    row.unknown ||= record.spValidation === 'unknown'
    row.unverified ||=
      record.spValidation === 'unverified' || record.spValidation === 'insufficient'
    if (record.kind !== 'cycleBoundary' && record.skillPoints) {
      const skill = record.skillPoints
      if (skill.status === 'unknown' || skill.paid === null || skill.recovery === null)
        row.unknown = true
      else {
        row.totalCost! += skill.paid ?? 0
        row.skillRecovery! += skill.recovery ?? 0
      }
      if ((skill.status === 'insufficient' || (skill.shortfall ?? 0) > 0) && !row.firstInsufficient)
        row.firstInsufficient = { ...record.anchor }
    }
    addRecovery([...(record.skillPointEvents ?? []), ...(record.conditionalRestores ?? [])])
    row.refill! += record.refill?.amount ?? 0
    addChanges(record.maxChanges ?? [])
  }
  if (result.blockedAction) {
    row.firstInsufficient ??= { ...result.blockedAction.anchor }
    row.stopped = true
  }
  finish(summary.endingBalance, summary.storedBalance, summary.effectiveMax)
  return rows
}
