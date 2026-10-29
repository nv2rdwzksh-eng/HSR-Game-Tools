import type { OptimizationRequest, RoleForm } from './types'

/** Normal play uses the five-cost form; the source snapshot retains every form. */
export function isEligibleRole(role: RoleForm, request: OptimizationRequest): boolean {
  return (request.includeExperts || !role.expert) && !['12041', '12042'].includes(role.id)
}

/** Declarative game exception shared by two independently implemented calculations. */
export function navigatorGrantedTraits(target: RoleForm): readonly number[] {
  return target.id === '8007' || target.id === '8009' ? [2004, 2012] : []
}
