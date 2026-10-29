import type { OptimizationRequest, Snapshot, Task } from './types'

export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
export const positiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

export function assertSnapshot(value: unknown): asserts value is Snapshot {
  requireValue(record(value) && value.schemaVersion === 1, 'Invalid snapshot version')
  requireValue(Array.isArray(value.traits), 'Invalid traits')
  const traitTypes = new Map<number, unknown>()
  for (const trait of value.traits) {
    requireValue(record(trait) && positiveInteger(trait.id), 'Invalid trait ID')
    requireValue(!traitTypes.has(trait.id), 'Duplicate trait ID: ' + trait.id)
    requireValue(typeof trait.name === 'string' && trait.name.trim(), 'Missing trait name')
    requireValue(
      trait.type === 'camp' || trait.type === 'class' || trait.type === 'unique',
      'Unknown trait type',
    )
    requireValue(
      Array.isArray(trait.thresholds) &&
        trait.thresholds.every(positiveInteger) &&
        trait.thresholds.length > 0 &&
        trait.thresholds.every((n, i, a) => i === 0 || n > a[i - 1]),
      'Invalid activation thresholds',
    )
    traitTypes.set(trait.id, trait.type)
  }
  requireValue(record(value.rules), 'Missing rules')
  const rules = value.rules
  requireValue(
    positiveInteger(rules.trainTraitId) && traitTypes.get(rules.trainTraitId) === 'camp',
    'Train eligibility must reference a camp trait',
  )
  requireValue(
    Array.isArray(rules.bronyaTraitIds) &&
      rules.bronyaTraitIds.length === 2 &&
      rules.bronyaTraitIds.every((id) => positiveInteger(id) && traitTypes.has(id)) &&
      rules.bronyaTraitIds[0] !== rules.bronyaTraitIds[1] &&
      rules.bronyaTie === 'neither' &&
      rules.allowBronyaNavigatorTarget === false,
    'Unsupported Bronya rules',
  )
  requireValue(Array.isArray(value.roles), 'Invalid roles')
  const forms = new Set<string>()
  const identityMechanics = new Map<number, unknown>()
  for (const role of value.roles) {
    requireValue(record(role) && typeof role.id === 'string' && role.id.trim(), 'Invalid form ID')
    requireValue(!forms.has(role.id), 'Duplicate form: ' + role.id)
    forms.add(role.id)
    requireValue(
      positiveInteger(role.roleId) &&
        positiveInteger(role.avatarId) &&
        positiveInteger(role.identityId),
      'Invalid role identity',
    )
    requireValue(typeof role.name === 'string' && role.name.trim(), 'Missing role name')
    requireValue(typeof role.expert === 'boolean', 'Missing expert flag')
    requireValue(
      role.position === undefined || role.position === 'front' || role.position === 'back',
      'Unknown role position',
    )
    requireValue(
      role.mechanic === undefined || role.mechanic === 'navigator' || role.mechanic === 'bronya',
      'Unknown role mechanic',
    )
    requireValue(
      Array.isArray(role.innateTraits) &&
        role.innateTraits.every((id) => positiveInteger(id) && traitTypes.has(id)) &&
        new Set(role.innateTraits).size === role.innateTraits.length,
      'Invalid innate traits: ' + role.id,
    )
    if (identityMechanics.has(role.identityId))
      requireValue(
        identityMechanics.get(role.identityId) === role.mechanic,
        'Mixed identity mechanics',
      )
    identityMechanics.set(role.identityId, role.mechanic)
    if (role.mechanic === 'bronya') {
      const innateTraits = role.innateTraits
      requireValue(
        role.bronyaSide === 'tie' || rules.bronyaTraitIds.includes(role.bronyaSide),
        'Missing Bronya side',
      )
      requireValue(
        rules.bronyaTraitIds.every((id) => innateTraits.includes(id) === (role.bronyaSide === id)),
        'Invalid Bronya form traits',
      )
    } else requireValue(role.bronyaSide === undefined, 'Unexpected Bronya side')
  }
  requireValue(
    new Set(value.roles.filter((r) => r.mechanic === 'navigator').map((r) => r.identityId)).size <=
      1 &&
      new Set(value.roles.filter((r) => r.mechanic === 'bronya').map((r) => r.identityId)).size <=
        1,
    'Only one navigator and one Bronya identity are supported',
  )
  requireValue(Array.isArray(value.emblems), 'Invalid emblems')
  const emblems = new Set<number>()
  for (const emblem of value.emblems) {
    requireValue(record(emblem) && positiveInteger(emblem.id), 'Invalid emblem ID')
    requireValue(!emblems.has(emblem.id), 'Duplicate emblem ID')
    emblems.add(emblem.id)
    requireValue(typeof emblem.name === 'string' && emblem.name.trim(), 'Missing emblem name')
    requireValue(
      positiveInteger(emblem.traitId) &&
        traitTypes.has(emblem.traitId) &&
        traitTypes.get(emblem.traitId) !== 'unique',
      'Emblem references unknown or unique trait',
    )
  }
}

export function parseTasks(value: unknown, snapshot: Snapshot): Task[] {
  requireValue(Array.isArray(value), 'Tasks must be an array')
  const ids = new Set<string>()
  const traits = new Set(snapshot.traits.map((t) => t.id))
  return value.map((task: unknown) => {
    requireValue(record(task), 'Invalid task')
    requireValue(
      Object.keys(task).every((k) => ['id', 'traitId', 'requiredCount'].includes(k)),
      'Unknown task field',
    )
    requireValue(
      typeof task.id === 'string' && task.id.trim() === task.id && task.id,
      'Invalid task ID',
    )
    requireValue(!ids.has(task.id), 'Duplicate task ID: ' + task.id)
    ids.add(task.id)
    requireValue(positiveInteger(task.traitId) && traits.has(task.traitId), 'Unknown task trait ID')
    requireValue(
      positiveInteger(task.requiredCount),
      'Task requiredCount must be a positive integer',
    )
    return { id: task.id, traitId: task.traitId, requiredCount: task.requiredCount }
  })
}

export function validateRequest(
  snapshot: Snapshot,
  request: OptimizationRequest,
  publicMode = false,
) {
  assertSnapshot(snapshot)
  requireValue(
    request.objective === 'min-roles' || request.objective === 'min-emblems',
    'Invalid optimization objective',
  )
  requireValue(positiveInteger(request.slots), 'Slots must be a positive integer')
  requireValue(
    Number.isSafeInteger(request.emblemBudget) && request.emblemBudget >= 0,
    'Emblem budget must be a nonnegative safe integer',
  )
  requireValue(typeof request.includeExperts === 'boolean', 'Invalid expert option')
  requireValue(
    Number.isFinite(request.timeLimitSeconds) && request.timeLimitSeconds > 0,
    'Time limit must be positive and finite',
  )
  requireValue(Number.isSafeInteger(3 * request.slots + 1), 'Slots exceed safe model bounds')
  if (publicMode) {
    requireValue(request.slots <= 13, 'User slots must be between 1 and 13')
    requireValue(request.emblemBudget >= 12, 'User emblem budget must be at least 12')
  }
  parseTasks(request.tasks, snapshot)
  requireValue(
    Number.isSafeInteger((3 * request.slots + 1) * request.tasks.length),
    'Objective exceeds safe model bounds',
  )
}
