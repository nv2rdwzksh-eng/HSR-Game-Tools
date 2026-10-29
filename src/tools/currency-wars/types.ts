export type TraitType = 'camp' | 'class' | 'unique'

export interface Trait {
  id: number
  name: string
  type: TraitType
  thresholds: number[]
}

export interface RoleForm {
  id: string
  roleId: number
  avatarId: number
  identityId: number
  name: string
  innateTraits: number[]
  expert: boolean
  position?: 'front' | 'back'
  mechanic?: 'navigator' | 'bronya'
  bronyaSide?: number | 'tie'
}

export interface Emblem {
  id: number
  name: string
  traitId: number
}

export interface Snapshot {
  schemaVersion: 1
  traits: Trait[]
  roles: RoleForm[]
  emblems: Emblem[]
  rules: {
    trainTraitId: number
    bronyaTraitIds: [number, number]
    bronyaTie: 'neither'
    allowBronyaNavigatorTarget: false
  }
}

export interface Task {
  id: string
  traitId: number
  requiredCount: number
}

export type OptimizationObjective = 'min-roles' | 'min-emblems'

export interface OptimizationRequest {
  objective: OptimizationObjective
  slots: number
  emblemBudget: number
  includeExperts: boolean
  timeLimitSeconds: number
  tasks: Task[]
}

export interface LineupMember {
  formId: string
  emblemIds: number[]
  navigatorTarget?: string
}

export interface Lineup {
  members: LineupMember[]
}

export interface MemberEvaluation {
  formId: string
  innateTraits: number[]
  emblemTraits: number[]
  extraTraits: number[]
  finalTraits: number[]
}

export interface TraitEvaluation {
  traitId: number
  count: number
  activeThreshold: number | null
  contributors: string[]
}

export interface TaskEvaluation extends Task {
  actualCount: number
  completed: boolean
}

export interface Evaluation {
  valid: boolean
  errors: string[]
  warnings: string[]
  members: MemberEvaluation[]
  traits: TraitEvaluation[]
  tasks: TaskEvaluation[]
  emblemCount: number
  completedCount: number
  objective: number
}

export type OptimizationStatus =
  'optimal' | 'feasible' | 'no-result' | 'infeasible' | 'error' | 'empty'

export interface OptimizationResult {
  request: OptimizationRequest
  status: OptimizationStatus
  solverStatus?: string
  elapsedSeconds: number
  message?: string
  lineup?: Lineup
  evaluation?: Evaluation
  objectiveBound?: number
  gap?: number
}
