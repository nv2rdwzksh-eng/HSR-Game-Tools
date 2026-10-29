import { buildModel } from './model'
import { highsSolver, solveOneModel, type Solver } from './solver-core'
import type { OptimizationRequest, OptimizationResult, Snapshot } from './types'
import { validateRequest } from './validation'

export { createHighsSolver, highsSolver } from './solver-core'
export type { Solver, SolverOutcome } from './solver-core'

/** One model, one verified lineup, and one total monotonic time budget. */
export async function solveCurrencyWars(
  snapshot: Snapshot,
  input: OptimizationRequest,
  solver: Solver = highsSolver,
  now: () => number = () => performance.now(),
): Promise<OptimizationResult> {
  const start = now()
  const elapsed = () => (now() - start) / 1000
  const request = { ...input }
  try {
    validateRequest(snapshot, request)
    request.tasks = input.tasks.map((task) => ({ ...task }))
    if (!request.tasks.length) return { request, status: 'empty', elapsedSeconds: elapsed() }
    const built = buildModel(snapshot, request)
    const remaining = Math.max(0, request.timeLimitSeconds - elapsed())
    if (!remaining) return { request, status: 'no-result', elapsedSeconds: elapsed() }
    const result = await solveOneModel(snapshot, request, built, solver, remaining)
    return { ...result, elapsedSeconds: elapsed() }
  } catch (error) {
    return {
      request,
      status: 'error',
      elapsedSeconds: elapsed(),
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
