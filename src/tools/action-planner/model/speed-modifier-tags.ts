import { countdownParticipantId } from '../engine/queue'
import { effectiveSpeed } from '../engine/queue'
import type {
  EventAnchor,
  NodeRecord,
  PendingCycleBoundary,
  QueueEntry,
  SimulationPlan,
  SimulationState,
  SpeedModifierInstance,
} from '../engine/types'
import type { MessageDescriptor, MessageTranslator, ToolLocale } from '../../../locales/types'
import { renderMessage } from './presentation'

interface CountdownSource {
  participantId: string
  name: string
  speed: number
}
export type CountdownSources = ReadonlyMap<string, CountdownSource>
export interface SpeedModifierTagView {
  id: string
  operationId: string
  mode: SpeedModifierInstance['mode']
  amount: number
  direction: 'increase' | 'decrease' | 'neutral'
  lifetime:
    | { kind: 'turns'; remainingTurns: number | null }
    | { kind: 'countdown'; participantId: string; name?: string; speed?: number }
}

/** Build once per plan; this index explains existing modifiers, never their existence. */
export function countdownSources(plan: SimulationPlan): CountdownSources {
  const sources = new Map<string, CountdownSource>()
  for (const event of plan.events)
    for (const operation of event.operations)
      if (operation.type === 'addSpeedModifier' && operation.duration.kind === 'countdown')
        sources.set(operation.id, {
          participantId: countdownParticipantId(operation.id),
          name: operation.duration.name,
          speed: operation.duration.speed,
        })
  return sources
}

export function speedModifierTags(
  modifiers: readonly SpeedModifierInstance[],
  sources: CountdownSources,
  state?: SimulationState,
): SpeedModifierTagView[] {
  const timers = new Map(
    state?.participants
      .filter((participant) => participant.kind === 'scheduledEvent')
      .map((participant) => [participant.id, participant]) ?? [],
  )
  return modifiers.map((modifier) => {
    let lifetime: SpeedModifierTagView['lifetime'] = { ...modifier.lifetime }
    if (modifier.lifetime.kind === 'countdown') {
      const id = modifier.lifetime.participantId
      const timer = timers.get(id)
      const source = sources.get(modifier.operationId)
      const countdown = timer ?? (source?.participantId === id ? source : undefined)
      lifetime = {
        ...modifier.lifetime,
        ...(countdown
          ? {
              name: countdown.name,
              speed: timer && state ? effectiveSpeed(timer, state) : countdown.speed,
            }
          : {}),
      }
    }
    return {
      id: modifier.id,
      operationId: modifier.operationId,
      mode: modifier.mode,
      amount: modifier.amount,
      direction: modifier.amount > 0 ? 'increase' : modifier.amount < 0 ? 'decrease' : 'neutral',
      lifetime,
    }
  })
}

/** Inspector and action records share the exact same entry-state interpretation. */
export function actionSpeedModifierTags(
  anchor: EventAnchor,
  state: SimulationState | undefined,
  sources: CountdownSources,
): SpeedModifierTagView[] {
  if ((anchor.kind !== 'action' && anchor.kind !== 'trigger') || !state) return []
  const participant = state.participants.find((p) => p.id === anchor.participantId)
  return participant ? speedModifierTags(participant.modifiers, sources, state) : []
}

export function navigatorSpeedModifierTags(
  node: NodeRecord | QueueEntry | PendingCycleBoundary,
  sources: CountdownSources,
  state?: SimulationState,
): SpeedModifierTagView[] {
  if ('beforeEffects' in node)
    return actionSpeedModifierTags(node.anchor, node.beforeEffects, sources)
  return 'modifiers' in node ? speedModifierTags(node.modifiers, sources, state) : []
}

export function speedModifierMessages(tag: SpeedModifierTagView) {
  const label: MessageDescriptor = {
    key: `planner.speedTag.${tag.mode}`,
    params: { amount: { value: tag.amount, signed: true } },
  }
  const lifetime = tag.lifetime
  const tooltip: MessageDescriptor =
    lifetime.kind === 'turns'
      ? lifetime.remainingTurns === null
        ? { key: 'planner.speedTag.unlimited' }
        : { key: 'planner.speedTag.remainingTurns', params: { count: lifetime.remainingTurns } }
      : lifetime.name !== undefined && lifetime.speed !== undefined
        ? {
            key: 'planner.speedTag.countdown',
            params: { name: lifetime.name, speed: lifetime.speed },
          }
        : { key: 'planner.speedTag.countdownUnknown' }
  return {
    label,
    tooltip,
    description: {
      key: 'planner.speedTag.description',
      params: { effect: label, duration: tooltip },
    } satisfies MessageDescriptor,
  }
}

/** One formatter for tag text, hover help and keyboard/screen-reader summaries. */
export function renderSpeedModifierTag(
  tag: SpeedModifierTagView,
  locale: ToolLocale,
  t: MessageTranslator,
) {
  const messages = speedModifierMessages(tag)
  return {
    id: tag.id,
    direction: tag.direction,
    label: renderMessage(messages.label, locale, t),
    tooltip: renderMessage(messages.tooltip, locale, t),
    description: renderMessage(messages.description, locale, t),
  }
}
