import { queueSnapshot } from '../engine/queue'
import type {
  NodeRecord,
  QueueEntry,
  QueueSnapshot,
  PendingCycleBoundary,
  SimulationResult,
} from '../engine/types'

export type WaitingEntry = QueueEntry | (PendingCycleBoundary & { actionChanges: [] })
function waitingEntries(snapshot: QueueSnapshot, current?: NodeRecord): WaitingEntry[] {
  if (!snapshot.nextCycleBoundary) return snapshot.queue
  const waiting: WaitingEntry[] = [...snapshot.queue]
  const boundary = snapshot.nextCycleBoundary
  if (
    boundary &&
    !(current?.kind === 'cycleBoundary' && current.anchor.ordinal === boundary.anchor.ordinal)
  )
    waiting.push({ ...boundary, actionChanges: [] })
  // Stable sorting retains the engine's participant order; the appended boundary loses ties.
  return waiting.sort((a, b) => a.remainingAV - b.remainingAV)
}

export type CurrentQueueView =
  | { kind: 'start'; elapsedAV: number; waiting: WaitingEntry[] }
  | { kind: 'acting'; elapsedAV: number; current: NodeRecord; waiting: WaitingEntry[] }

/** Read event-entry states without changing the engine's post-settlement snapshots. */
export function buildCurrentQueueView(
  result: SimulationResult,
  index: number,
): CurrentQueueView | undefined {
  if (!Number.isInteger(index) || index < 0) return undefined
  if (index === 0) {
    const initial = result.snapshots[0]
    return initial
      ? { kind: 'start', elapsedAV: initial.elapsedAV, waiting: waitingEntries(initial) }
      : undefined
  }
  const current = result.records[index - 1]
  return current
    ? {
        kind: 'acting',
        elapsedAV: current.elapsedAV,
        current,
        waiting: waitingEntries(queueSnapshot(current.beforeEffects), current),
      }
    : undefined
}

/** Current records and pending entries retain their own anchor and trace lifetimes. */
export function currentQueueCards(view?: CurrentQueueView) {
  const waiting = (view?.waiting ?? []).map((entry) => ({
    ...entry,
    total: entry.remainingAV,
    delta: 0,
    isCurrent: false,
  }))
  return view?.kind === 'acting'
    ? [{ ...view.current, total: 0, delta: 0, isCurrent: true }, ...waiting]
    : waiting
}
