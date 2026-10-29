import type { EffectOperation, SimulationState } from '../engine/types'
import type { MessageDescriptor } from '../../../locales/types'
import { namingTargets, targetDescription } from './naming'

export interface MetadataField {
  kind: 'effect' | 'duration' | 'countdown' | 'speed' | 'identity' | 'camp' | 'category' | 'actions'
  message: string | MessageDescriptor
}
export interface OperationMetadata {
  targetIds?: string[]
  target?: string | MessageDescriptor
  fields: MetadataField[]
}
/** Authoritative configuration details; never infer effects from an editable title. */
export function operationMetadata(
  operation: EffectOperation,
  name: (id: string) => string,
  state?: SimulationState,
): OperationMetadata {
  const fields: MetadataField[] = []
  const add = (kind: MetadataField['kind'], key: string, params?: MessageDescriptor['params']) =>
    fields.push({ kind, message: { key, params } })
  if (operation.type === 'restoreSkillPoints') {
    add('effect', 'planner.sp.eventLabel', { amount: operation.amount, source: operation.source })
    if (operation.storeOverflow) add('effect', 'planner.sp.storeOverflow')
    return { fields }
  }
  if (operation.type === 'spawnParticipant') {
    const p = operation.participant
    fields.push({ kind: 'identity', message: p.name })
    if (p.kind === 'actor') {
      add('camp', `ui.${p.camp}`)
      if (p.category) add('category', `ui.category.${p.category}`)
      add('speed', 'planner.metadata.baseSpeed', { speed: p.baseSpeed })
      add('speed', 'planner.metadata.panelSpeed', { speed: p.panelSpeed })
      add(
        'actions',
        p.actionLimit == null
          ? 'planner.metadata.unlimitedActions'
          : 'planner.metadata.actionLimit',
        p.actionLimit == null ? undefined : { count: p.actionLimit },
      )
    } else {
      if (p.baseSpeed !== undefined)
        add('speed', 'planner.metadata.baseSpeed', { speed: p.baseSpeed })
      add('speed', 'planner.metadata.speed', { speed: p.speed })
      add('duration', 'planner.metadata.once')
    }
    return { fields }
  }
  const targetIds = namingTargets(operation, state)
  const target = targetDescription(operation.target, name, targetIds)
  if (operation.type === 'advance' || operation.type === 'delay')
    add('effect', `planner.metadata.${operation.type}`, { percent: operation.percent })
  else if (operation.type === 'immediatelyAct') add('effect', 'planner.metadata.immediatelyAct')
  else if (operation.type === 'depart' || operation.type === 'returnToField')
    add('effect', `planner.metadata.${operation.type}`)
  else {
    add('effect', `planner.metadata.${operation.mode}`, {
      amount: { value: operation.amount, signed: true },
    })
    const d = operation.duration
    if (d.kind === 'countdown') {
      add('countdown', 'planner.metadata.countdown', { name: d.name })
      add('speed', 'planner.metadata.speed', { speed: d.speed })
    } else
      add(
        'duration',
        d.turns === null ? 'planner.metadata.unlimitedDuration' : 'planner.metadata.duration',
        d.turns === null ? undefined : { count: d.turns },
      )
  }
  return { targetIds, target, fields }
}
