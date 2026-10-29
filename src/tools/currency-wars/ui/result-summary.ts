import type { SolvedAttempt } from './session'

/** Totals belong to the displayed attempt, never to the currently editable form. */
export function resultSummary(attempt: SolvedAttempt) {
  const evaluation = attempt.result.evaluation!
  return {
    completed: evaluation.completedCount,
    tasks: attempt.request.tasks.length,
  }
}
