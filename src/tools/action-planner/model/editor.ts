import {
  applyOperations,
  createInitialState,
  stepSimulation,
  nextSimulationEvent,
  previewOperationState,
} from '../engine/engine'
import { anchorKey, SimulationError } from '../engine/queue'
import {
  operationTargets,
  targetIds,
  validTargetSelection,
  validSpeedDurationForTargets,
} from '../engine/targeting'
import { validateOperations } from '../engine/validation'
import type {
  EffectOperation,
  ActionSkill,
  EffectPhase,
  EventAnchor,
  SimulationPlan,
  SimulationResult,
  SimulationState,
  Target,
} from '../engine/types'
import {
  buildParticipantOperation,
  participantDraft,
  type ParticipantDraft,
} from './participant-config'
import {
  parseSpeedDuration,
  speedDurationDraft,
  type SpeedDurationDraft,
} from './speed-duration-config'

export interface PlannerMetadata {
  customNames: Record<string, string>
  characterIds: Record<string, string>
}
/** Imported IDs may match ordinary Object prototype members. */
export const metadataValue = (values: Record<string, string>, id: string): string | undefined =>
  Object.hasOwn(values, id) ? values[id] : undefined
export interface PlannerDocument {
  name: string
  plan: SimulationPlan
  metadata: PlannerMetadata
}
export interface OperationDraft {
  id?: string
  original?: EffectOperation
  type: EffectOperation['type']
  customName: string
  source: string
  chance: number | undefined
  cooldownTurns: number | undefined
  outcome: 'proc' | 'no-proc'
  conditionalSourceParticipantId: string
  storeOverflow: boolean
  phase: EffectPhase
  targetKind: Target['kind']
  selectedIds: string[]
  percent: number | undefined
  mode: 'flat' | 'percent'
  amount: number | undefined
  duration: SpeedDurationDraft
  participant: ParticipantDraft
}
export function operationDraft(operation?: EffectOperation, customName = ''): OperationDraft {
  return {
    id: operation?.id || undefined,
    original: operation?.id ? operation : undefined,
    customName,
    source:
      operation?.type === 'restoreSkillPoints' || operation?.type === 'conditionalRestore'
        ? operation.source
        : '',
    chance: operation?.type === 'conditionalRestore' ? operation.chance : 0.5,
    cooldownTurns: operation?.type === 'conditionalRestore' ? operation.cooldownTurns : 1,
    outcome: operation?.type === 'conditionalRestore' ? operation.outcome : 'no-proc',
    conditionalSourceParticipantId:
      operation?.type === 'conditionalRestore' ? operation.sourceParticipantId : '',
    storeOverflow:
      operation?.type === 'restoreSkillPoints' ? (operation.storeOverflow ?? false) : false,
    type: operation?.type ?? 'advance',
    phase: operation?.phase ?? (operation?.id ? 'preAction' : 'postAction'),
    targetKind:
      operation &&
      operation.type !== 'spawnParticipant' &&
      operation.type !== 'restoreSkillPoints' &&
      operation.type !== 'conditionalRestore'
        ? operation.target.kind
        : 'participants',
    selectedIds:
      operation &&
      operation.type !== 'spawnParticipant' &&
      operation.type !== 'restoreSkillPoints' &&
      operation.type !== 'conditionalRestore' &&
      operation.target.kind === 'participants'
        ? [...operation.target.participantIds]
        : [],
    percent: operation?.type === 'advance' || operation?.type === 'delay' ? operation.percent : 50,
    mode: operation?.type === 'addSpeedModifier' ? operation.mode : 'flat',
    amount:
      operation?.type === 'addSpeedModifier' ||
      operation?.type === 'restoreSkillPoints' ||
      operation?.type === 'conditionalRestore'
        ? operation.amount
        : 10,
    duration: speedDurationDraft(
      operation?.type === 'addSpeedModifier' ? operation.duration : undefined,
    ),
    participant: participantDraft(operation?.type === 'spawnParticipant' ? operation : undefined),
  }
}
export function operationsAt(plan: SimulationPlan, anchor: EventAnchor): EffectOperation[] {
  return plan.events.find((e) => anchorKey(e.anchor) === anchorKey(anchor))?.operations ?? []
}
/** Recover a failed node by replaying only committed successful steps through the engine. */
export function contextAt(
  plan: SimulationPlan,
  result: SimulationResult,
  anchor: EventAnchor,
): SimulationState | undefined {
  if (anchor.kind === 'start' && result.startState) return result.startState
  const record = result.records.find((r) => anchorKey(r.anchor) === anchorKey(anchor))
  if (record) return record.beforeEffects
  if (result.blockedAction && anchorKey(result.blockedAction.anchor) === anchorKey(anchor))
    return result.blockedAction.beforeEffects
  try {
    let state = createInitialState(plan)
    if (anchor.kind === 'start') return state
    state = applyOperations(state, operationsAt(plan, { kind: 'start' }), { kind: 'start' }).state
    for (const done of result.records)
      state = stepSimulation(
        state,
        operationsAt(plan, done.anchor),
        plan.events.find((e) => anchorKey(e.anchor) === anchorKey(done.anchor))?.skill,
      ).state
    const next = nextSimulationEvent(state)
    return next && anchorKey(next.anchor) === anchorKey(anchor)
      ? stepSimulation(state, []).record.beforeEffects
      : undefined
  } catch (error) {
    if (error instanceof SimulationError) return undefined
    throw error
  }
}
export function previewDraft(
  context: SimulationState | undefined,
  operations: EffectOperation[],
  anchor: EventAnchor,
  draft: OperationDraft,
  skill?: ActionSkill,
): SimulationState | undefined {
  return context
    ? previewOperationState(
        context,
        operations,
        anchor,
        draft.phase,
        draft.id,
        skill,
        draft.type === 'restoreSkillPoints',
      )
    : undefined
}
/** A provisional value is for naming only; it is never submitted without buildOperation. */
export function provisionalOperation(
  draft: OperationDraft,
  anchor: EventAnchor,
): EffectOperation | undefined {
  const common = {
    id: draft.id ?? 'draft',
    ...(anchor.kind === 'action' ? { phase: draft.phase } : {}),
  }
  const target: Target =
    draft.targetKind === 'participants'
      ? { kind: 'participants', participantIds: [...draft.selectedIds] }
      : { kind: draft.targetKind }
  switch (draft.type) {
    case 'conditionalRestore':
      return {
        ...common,
        type: 'conditionalRestore',
        amount: draft.amount ?? 0,
        chance: draft.chance ?? -1,
        cooldownTurns: draft.cooldownTurns ?? -1,
        outcome: draft.outcome,
        source: draft.source,
        sourceParticipantId:
          draft.conditionalSourceParticipantId ||
          (anchor.kind === 'action' ? anchor.participantId : ''),
      }
    case 'restoreSkillPoints':
      return {
        ...common,
        type: 'restoreSkillPoints',
        amount: draft.amount ?? 0,
        source: draft.source,
        ...(draft.storeOverflow ||
        (draft.original?.type === 'restoreSkillPoints' &&
          draft.original.storeOverflow !== undefined)
          ? { storeOverflow: draft.storeOverflow }
          : {}),
      }
    case 'spawnParticipant':
      return buildParticipantOperation(
        { ...draft.participant, phase: draft.phase },
        common.id,
        anchor,
        draft.original?.type === 'spawnParticipant' ? draft.original : undefined,
      ).operation
    case 'immediatelyAct':
    case 'depart':
    case 'returnToField':
      return { ...common, type: draft.type, target }
    case 'advance':
    case 'delay':
      return { ...common, type: draft.type, target, percent: draft.percent ?? 0 }
    case 'addSpeedModifier':
      return {
        ...common,
        type: draft.type,
        target,
        mode: draft.mode,
        amount: draft.amount ?? 0,
        duration: parseSpeedDuration(draft.duration).duration ?? { kind: 'turns', turns: null },
      }
  }
}
export function buildOperation(
  draft: OperationDraft,
  id: string,
  anchor: EventAnchor,
  preview: SimulationState | undefined,
  skill?: ActionSkill,
): { operation?: EffectOperation; invalid: string[] } {
  if (!preview) return { invalid: ['context'] }
  if (draft.original?.type === 'spawnParticipant' && draft.type !== 'spawnParticipant')
    return { invalid: ['form'] }
  if (draft.type === 'spawnParticipant')
    return buildParticipantOperation(
      { ...draft.participant, phase: draft.phase },
      id,
      anchor,
      draft.original?.type === 'spawnParticipant' ? draft.original : undefined,
    )
  const invalid: string[] = []
  const operation = provisionalOperation({ ...draft, id }, anchor)!
  if (operation.type === 'spawnParticipant') return { invalid: ['form'] }
  if (operation.type === 'conditionalRestore') {
    if (!Number.isSafeInteger(draft.amount) || (draft.amount ?? 0) <= 0) invalid.push('spAmount')
    if (
      draft.chance === undefined ||
      !Number.isFinite(draft.chance) ||
      draft.chance < 0 ||
      draft.chance > 1
    )
      invalid.push('chance')
    if (!Number.isSafeInteger(draft.cooldownTurns) || (draft.cooldownTurns ?? -1) < 0)
      invalid.push('cooldownTurns')
    if (!draft.source.trim() || draft.source.length > 256) invalid.push('spSource')
    if (
      validateOperations(
        [operation],
        anchor,
        skill,
        preview.participants.find((p) => p.id === operation.sourceParticipantId),
      ).length ||
      !preview.participants.some(
        (p) => p.id === operation.sourceParticipantId && p.kind === 'actor' && p.camp === 'ally',
      )
    )
      invalid.push('form')
    return invalid.length ? { invalid } : { operation, invalid: [] }
  }
  if (operation.type === 'restoreSkillPoints') {
    if (!Number.isSafeInteger(draft.amount) || (draft.amount ?? 0) <= 0) invalid.push('spAmount')
    if (!draft.source.trim() || draft.source.length > 256) invalid.push('spSource')
    if (
      validateOperations([operation], anchor).length ||
      (anchor.kind !== 'start' &&
        (anchor.kind !== 'action' ||
          !preview.participants.some(
            (p) => p.id === anchor.participantId && p.kind === 'actor' && p.camp === 'ally',
          )))
    )
      invalid.push('form')
    return invalid.length ? { invalid } : { operation, invalid: [] }
  }
  const participants = operationTargets(preview, operation.type)
  const ids = targetIds(operation.target, participants)
  const selected = participants.filter((p) => ids.includes(p.id))
  if (ids.length !== selected.length || !validTargetSelection(operation.type, selected))
    invalid.push('target')
  if (
    (draft.type === 'advance' || draft.type === 'delay') &&
    (draft.percent === undefined || !Number.isFinite(draft.percent) || draft.percent < 0)
  )
    invalid.push('percent')
  if (draft.type === 'addSpeedModifier') {
    if (draft.amount === undefined || !Number.isFinite(draft.amount)) invalid.push('amount')
    invalid.push(...parseSpeedDuration(draft.duration).invalid)
    if (
      operation.type === 'addSpeedModifier' &&
      !validSpeedDurationForTargets(operation.duration, selected)
    )
      invalid.push('duration')
  }
  if (
    !invalid.length &&
    operation.type === 'addSpeedModifier' &&
    selected.some((p) => p.kind === 'scheduledEvent')
  ) {
    try {
      applyOperations(preview, [operation], anchor)
    } catch (error) {
      if (!(error instanceof SimulationError)) throw error
      invalid.push('effectiveSpeed')
    }
  }
  if (!invalid.length && validateOperations([operation], anchor).length) invalid.push('form')
  return invalid.length ? { invalid } : { operation, invalid: [] }
}
