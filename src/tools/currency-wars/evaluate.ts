import { completionWeight } from './objective'
import type { Evaluation, Lineup, MemberEvaluation, OptimizationRequest, Snapshot } from './types'
import { validateRequest } from './validation'
import { isEligibleRole, navigatorGrantedTraits } from './rules'

/** Independent evaluation: no solver columns, constraints or model helpers are used here. */
export function evaluateLineup(
  snapshot: Snapshot,
  request: OptimizationRequest,
  lineup: Lineup,
): Evaluation {
  validateRequest(snapshot, request)
  const errors: string[] = []
  const warnings: string[] = []
  const roles = new Map(snapshot.roles.map((r) => [r.id, r]))
  const emblems = new Map(snapshot.emblems.map((e) => [e.id, e]))
  const traitTypes = new Map(snapshot.traits.map((t) => [t.id, t.type]))
  const identityIds = new Set<number>()
  const memberIds = new Set<string>()
  const evaluated = new Map<string, MemberEvaluation>()
  let emblemCount = 0
  if (lineup.members.length > request.slots) errors.push('Too many roles')
  for (const member of lineup.members) {
    const role = roles.get(member.formId)
    if (!role) {
      errors.push('Unknown role form: ' + member.formId)
      continue
    }
    if (identityIds.has(role.identityId)) errors.push('Duplicate role identity: ' + role.identityId)
    if (memberIds.has(role.id)) errors.push('Duplicate role form: ' + role.id)
    identityIds.add(role.identityId)
    memberIds.add(role.id)
    if (!isEligibleRole(role, request)) errors.push('Role is excluded: ' + role.id)
    if (member.emblemIds.length > 3) errors.push('Too many emblems on role: ' + role.id)
    emblemCount += member.emblemIds.length
    const seenEmblems = new Set<number>()
    const finalTraits = new Set(role.innateTraits)
    const emblemTraits: number[] = []
    for (const emblemId of member.emblemIds) {
      if (seenEmblems.has(emblemId)) errors.push('Duplicate emblem on role: ' + role.id)
      seenEmblems.add(emblemId)
      const emblem = emblems.get(emblemId)
      if (!emblem) {
        errors.push('Unknown emblem: ' + emblemId)
        continue
      }
      if (finalTraits.has(emblem.traitId)) errors.push('Emblem trait conflict on role: ' + role.id)
      if (
        role.mechanic === 'bronya' &&
        role.bronyaSide === 'tie' &&
        snapshot.rules.bronyaTraitIds.includes(emblem.traitId)
      )
        errors.push('Emblem conflicts with a possible tied Bronya form')
      finalTraits.add(emblem.traitId)
      emblemTraits.push(emblem.traitId)
    }
    if (member.navigatorTarget !== undefined && role.mechanic !== 'navigator')
      errors.push('Only the navigator may choose a target')
    evaluated.set(role.id, {
      formId: role.id,
      innateTraits: [...role.innateTraits],
      emblemTraits,
      extraTraits: [],
      finalTraits: [...finalTraits],
    })
  }
  if (emblemCount > request.emblemBudget) errors.push('Global emblem budget exceeded')

  for (const member of lineup.members) {
    if (member.navigatorTarget === undefined || roles.get(member.formId)?.mechanic !== 'navigator')
      continue
    const self = evaluated.get(member.formId)
    const target = evaluated.get(member.navigatorTarget)
    const targetRole = roles.get(member.navigatorTarget)
    if (!self || !target || !targetRole || member.navigatorTarget === member.formId) {
      errors.push('Navigator target must be another selected role')
      continue
    }
    if (targetRole.mechanic === 'bronya') {
      errors.push('Bronya navigator target is unsupported in V1')
      continue
    }
    if (!target.finalTraits.includes(snapshot.rules.trainTraitId)) {
      errors.push('Navigator target lacks the train camp trait')
      continue
    }
    // Emblems qualify targets but do not expand the copied innate Classes or explicit grants.
    const inherited = new Set([
      ...targetRole.innateTraits.filter((id) => traitTypes.get(id) === 'class'),
      ...navigatorGrantedTraits(targetRole),
    ])
    for (const traitId of inherited) {
      if (self.finalTraits.includes(traitId))
        errors.push('Navigator inherited trait conflict: ' + traitId)
      else {
        self.extraTraits.push(traitId)
        self.finalTraits.push(traitId)
      }
    }
  }

  for (const member of lineup.members) {
    const role = roles.get(member.formId)
    if (role?.mechanic !== 'bronya') continue
    const [first, second] = snapshot.rules.bronyaTraitIds
    const others = [...evaluated.values()].filter((m) => m.formId !== member.formId)
    const a = others.filter((m) => m.finalTraits.includes(first)).length
    const b = others.filter((m) => m.finalTraits.includes(second)).length
    const expected = a === b ? 'tie' : a > b ? first : second
    if (role.bronyaSide !== expected) errors.push('Bronya form disagrees with other-role counts')
    if (expected === 'tie') warnings.push('bronya-tie-conservative-lower-bound')
  }

  const members = [...evaluated.values()]
  const traits = snapshot.traits.map((trait) => {
    const contributors = members
      .filter((m) => m.finalTraits.includes(trait.id))
      .map((m) => m.formId)
    const active = trait.thresholds.filter((n) => n <= contributors.length)
    return {
      traitId: trait.id,
      count: contributors.length,
      activeThreshold: active.at(-1) ?? null,
      contributors,
    }
  })
  const counts = new Map(traits.map((t) => [t.traitId, t.count]))
  const tasks = request.tasks.map((task) => ({
    ...task,
    actualCount: counts.get(task.traitId) ?? 0,
    completed: (counts.get(task.traitId) ?? 0) >= task.requiredCount,
  }))
  const completedCount = tasks.filter((t) => t.completed).length
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    members,
    traits,
    tasks,
    emblemCount,
    completedCount,
    objective:
      completionWeight(request) * completedCount -
      (request.objective === 'min-roles' ? lineup.members.length : emblemCount),
  }
}
