import type { OptimizationRequest } from './types'

/** One extra completed task outweighs the full range of the secondary cost. */
export function completionWeight(request: OptimizationRequest): number {
  return (
    (request.objective === 'min-roles'
      ? request.slots
      : Math.min(request.emblemBudget, 3 * request.slots)) + 1
  )
}
