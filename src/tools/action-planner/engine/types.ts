export type Camp = 'ally' | 'enemy'

interface ParticipantDefinitionBase {
  name: string
  iconUrl?: string
  initialAG?: number
}
export interface ActorDefinition extends ParticipantDefinitionBase {
  kind: 'actor'
  category?: 'character' | 'enemy' | 'summon' | 'memosprite' | 'custom'
  camp: Camp
  baseSpeed: number
  panelSpeed: number
  actionLimit?: number | null
}
export interface ScheduledEventDefinition extends ParticipantDefinitionBase {
  kind: 'scheduledEvent'
  baseSpeed?: number
  speed: number
}
export type ParticipantDefinition = ActorDefinition | ScheduledEventDefinition
export interface ActorConfig extends ActorDefinition {
  id: string
  position: number
}
export type ParticipantAnchor =
  | { kind: 'action'; participantId: string; turn: number }
  | { kind: 'trigger'; participantId: string }
export type CycleMode = 'none' | 'moc' | 'aa'
export type CycleAnchor = { kind: 'cycleBoundary'; ordinal: number }
export type NodeAnchor = ParticipantAnchor | CycleAnchor
export type EventAnchor = { kind: 'start' } | NodeAnchor
export type Target =
  { kind: 'participants'; participantIds: string[] } | { kind: 'allies' } | { kind: 'enemies' }
export type EffectPhase = 'preAction' | 'postAction'
/** Runtime explanation for one committed gauge operation; never part of a plan. */
export interface ActionChangeTrace {
  operationId: string
  sourceAnchor: EventAnchor
  phase?: EffectPhase
  targetAnchor: ParticipantAnchor
  elapsedAV: number
  type: 'advance' | 'delay' | 'immediatelyAct'
  beforeAG: number
  afterAG: number
  effectiveSpeed: number
  deltaAV: number
  zeroAVInsertion: boolean
}
export type SpeedDuration =
  { kind: 'turns'; turns: number | null } | { kind: 'countdown'; name: string; speed: number }
export type EffectOperation = { id: string; phase?: EffectPhase } & (
  | { type: 'advance'; target: Target; percent: number }
  | { type: 'delay'; target: Target; percent: number }
  | { type: 'immediatelyAct'; target: Target }
  | { type: 'depart'; target: Target }
  | { type: 'returnToField'; target: Target }
  | {
      type: 'addSpeedModifier'
      target: Target
      mode: 'flat' | 'percent'
      amount: number
      duration: SpeedDuration
    }
  | { type: 'restoreSkillPoints'; amount: number; source: string; storeOverflow?: boolean }
  | { type: 'spawnParticipant'; participant: ParticipantDefinition }
)
export type TargetedOperation = Exclude<
  EffectOperation,
  { type: 'spawnParticipant' | 'restoreSkillPoints' }
>
export interface PlanEvent {
  anchor: EventAnchor
  operations: EffectOperation[]
  skill?: ActionSkill
}
export type ActionSkill =
  { kind: 'basic' | 'skill' } | { kind: 'custom'; cost: number; recovery: number }
export interface SkillPointsConfig {
  storedMax?: number
  onInsufficient?: 'stop' | 'mark'
  enabled?: boolean
  initial?: number
  max?: number
}
export interface SkillPointEventRecord {
  stored: number | null
  wasted: number | null
  storedAfter: number | null
  committed?: boolean
  operationId: string
  source: string
  amount: number
  before: number | null
  after: number | null
  restored: number | null
  overflow: number | null
}
export interface SkillPointsState {
  stored: number | null
  storedMax: number
  onInsufficient?: 'stop' | 'mark'
  unverified?: boolean
  current: number | null
  max: number
}
export interface SkillPointsRecord {
  status: 'known' | 'unknown' | 'insufficient' | 'unverified'
  paid?: number | null
  plannedRecovery?: number
  shortfall?: number
  before: number | null
  after: number | null
  cost?: number
  recovery?: number | null
  overflow?: number | null
}
export interface AhaConfig {
  id: string
  baseSpeed: number
  contributorIds: string[]
}
export interface SimulationPlan {
  skillPoints?: SkillPointsConfig
  aha: AhaConfig
  cycleMode: CycleMode
  actors: ActorConfig[]
  events: PlanEvent[]
  maxNodes: number
  maxAV: number
}
export interface SpeedModifierInstance {
  id: string
  operationId: string
  mode: 'flat' | 'percent'
  amount: number
  lifetime:
    { kind: 'turns'; remainingTurns: number | null } | { kind: 'countdown'; participantId: string }
}
interface QueueState {
  id: string
  departed: boolean
  remainingAG: number
  order: number
  zeroBatch: number
  zeroOrder: number
  pendingActionChanges: ActionChangeTrace[]
}
export interface ActorState extends ActorDefinition, QueueState {
  turns: number
  modifiers: SpeedModifierInstance[]
}
export interface ScheduledEventState extends ScheduledEventDefinition, QueueState {
  modifiers: SpeedModifierInstance[]
}
export interface AhaState extends QueueState {
  kind: 'aha'
  name: string
  iconUrl?: string
  camp: 'neutral'
  baseSpeed: number
  contributorIds: string[]
  turns: number
  modifiers: SpeedModifierInstance[]
}
export type NaturalParticipantState = ActorState | AhaState
export type ParticipantState = NaturalParticipantState | ScheduledEventState
export function isNaturalParticipant(p: ParticipantState): p is NaturalParticipantState {
  return p.kind === 'actor' || p.kind === 'aha'
}
export interface ParticipantInfo {
  id: string
  kind: ParticipantState['kind']
  name: string
  iconUrl?: string
  camp?: Camp | 'neutral'
}
export interface SimulationState {
  skillPoints?: SkillPointsState
  cycle?: { mode: Exclude<CycleMode, 'none'>; nextOrdinal: number; maxAV: number }
  participants: ParticipantState[]
  elapsedAV: number
  completedNodes: number
  completedActions: number
  batch: number
  nextOrder: number
  issuedParticipantIds: Set<string>
  activeParticipantId?: string
}
export type DiagnosticCode =
  | 'sp-marked'
  | 'sp-insufficient'
  | 'sp-unknown'
  | 'sp-overflow'
  | 'invalid-input'
  | 'invalid-target'
  | 'duplicate-participant'
  | 'invalid-speed'
  | 'non-finite'
  | 'missing-target'
  | 'active-target'
  | 'unreached-anchor'
  | 'no-participants'
export interface Diagnostic {
  code: DiagnosticCode
  severity: 'error' | 'warning' | 'info'
  anchor?: EventAnchor
  operationId?: string
  participantId?: string
}
export interface QueueEntry extends ParticipantInfo {
  anchor: ParticipantAnchor
  remainingAG: number
  remainingAV: number
  effectiveSpeed: number
  modifiers: SpeedModifierInstance[]
  actionChanges: ActionChangeTrace[]
}
export interface QueueSnapshot {
  nextCycleBoundary?: PendingCycleBoundary
  elapsedAV: number
  completedNodes: number
  completedActions: number
  queue: QueueEntry[]
}
export interface PendingCycleBoundary {
  kind: 'cycleBoundary'
  anchor: CycleAnchor
  elapsedAV: number
  remainingAV: number
}
export type SkillPointValidation = 'known' | 'unknown' | 'insufficient' | 'unverified'
export interface SkillPointsSummary {
  storedBalance: number | null
  firstInsufficient?: ParticipantAnchor
  totalCost: number | null
  totalRecovery: number | null
  endingBalance: number | null
  status: SkillPointValidation
}
export interface SkillPointRefillRecord {
  amount: number
  before: number
  after: number
  storedBefore: number
  storedAfter: number
}
export interface SkillPointStorageRecord {
  overflow: number | null
  stored: number | null
  wasted: number | null
  storedAfter: number | null
}
interface RecordBase {
  refill?: SkillPointRefillRecord
  skillPointStorage?: SkillPointStorageRecord
  spValidation?: SkillPointValidation
  skillPointEvents?: SkillPointEventRecord[]
  elapsedAV: number
  deltaAV: number
  beforeEffects: SimulationState
  actionChanges: ActionChangeTrace[]
}
export interface ParticipantNodeRecord extends ParticipantInfo, RecordBase {
  skillPoints?: SkillPointsRecord
  anchor: ParticipantAnchor
  effectiveSpeed: number
}
export interface CycleNodeRecord extends RecordBase {
  kind: 'cycleBoundary'
  anchor: CycleAnchor
}
export type NodeRecord = ParticipantNodeRecord | CycleNodeRecord
export interface SimulationResult {
  skillPointsSummary?: SkillPointsSummary
  startSkillPointEvents?: SkillPointEventRecord[]
  blockedAction?: ParticipantNodeRecord
  records: NodeRecord[]
  snapshots: QueueSnapshot[]
  startState?: SimulationState
  participants: ParticipantInfo[]
  diagnostics: Diagnostic[]
  stopReason: 'nodes' | 'av' | 'error' | 'empty'
}
