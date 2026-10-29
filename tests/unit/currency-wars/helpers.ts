import type {
  OptimizationRequest,
  RoleForm,
  Snapshot,
  Task,
  Trait,
} from '../../../src/tools/currency-wars/types'

export const emblem = (traitId: number) => 500000 + traitId
export const role = (
  id: number,
  innateTraits: number[],
  extra: Partial<RoleForm> = {},
): RoleForm => ({
  id: String(id),
  roleId: id,
  avatarId: id,
  identityId: id,
  name: '角色' + id,
  innateTraits,
  expert: false,
  ...extra,
})
export const task = (
  traitId: number,
  requiredCount: number,
  id = `t${traitId}-${requiredCount}`,
): Task => ({ id, traitId, requiredCount })
export function toy(roles: RoleForm[] = [], emblemTraits: number[] = []): Snapshot {
  const traits: Trait[] = [
    { id: 1001, name: '列车同行', type: 'camp', thresholds: [2, 4, 6] },
    { id: 1005, name: '贝洛伯格', type: 'camp', thresholds: [2, 4] },
    { id: 1007, name: '仙舟', type: 'camp', thresholds: [3, 5, 7] },
    { id: 1008, name: '狼狩', type: 'camp', thresholds: [3, 5, 6] },
    { id: 1009, name: '巡海游侠', type: 'camp', thresholds: [1, 2, 3] },
    { id: 1010, name: '盛会之星', type: 'camp', thresholds: [2, 3, 4] },
    ...[2004, 2006, 2007, 2008, 2010, 2012].map((id): Trait => ({
      id,
      name: '流派' + id,
      type: 'class',
      thresholds: [2, 4, 6],
    })),
    { id: 3001, name: '大守护者', type: 'unique', thresholds: [1] },
    { id: 3007, name: '领航员', type: 'unique', thresholds: [1] },
  ]
  return {
    schemaVersion: 1,
    traits,
    roles,
    emblems: emblemTraits.map((id) => ({ id: emblem(id), name: '星徽' + id, traitId: id })),
    rules: {
      trainTraitId: 1001,
      bronyaTraitIds: [1005, 2006],
      bronyaTie: 'neither',
      allowBronyaNavigatorTarget: false,
    },
  }
}
export const request = (
  tasks: Task[] = [],
  extra: Partial<OptimizationRequest> = {},
): OptimizationRequest => ({
  objective: 'min-roles',
  slots: 2,
  emblemBudget: 2,
  includeExperts: false,
  timeLimitSeconds: 5,
  tasks,
  ...extra,
})
export const navigator = role(1510, [1001, 3007], { mechanic: 'navigator' })
export const bronyaForms = [
  role(11011, [1005, 3001], { identityId: 1101, mechanic: 'bronya', bronyaSide: 1005 }),
  role(11012, [2006, 3001], { identityId: 1101, mechanic: 'bronya', bronyaSide: 2006 }),
  role(11011, [3001], { id: '11011:tie', identityId: 1101, mechanic: 'bronya', bronyaSide: 'tie' }),
]
