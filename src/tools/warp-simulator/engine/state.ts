import { BANNER_KINDS, isLightCone, PROBABILITY_MODEL } from './probability'
import type { PityGroup, PityState, SessionState } from './types'
import { isObject, requireInput } from './validation'

export const PITY_GROUPS: readonly PityGroup[] = Object.freeze(
  BANNER_KINDS.map((k): PityGroup => `pity:${k}`),
)
export function createSessionState(): SessionState {
  return Object.freeze({
    model: PROBABILITY_MODEL,
    groups: Object.freeze(
      Object.fromEntries(
        PITY_GROUPS.map((group) => [
          group,
          Object.freeze({
            pullsSinceLast5: 0,
            pullsSinceLast4: 0,
            guaranteed5: false,
            guaranteed4: false,
          }),
        ]),
      ) as Record<PityGroup, PityState>,
    ),
  })
}
export function assertSessionState(state: SessionState): void {
  requireInput(isObject(state), 'invalid-state', '/state')
  requireInput(
    isObject(state.model) &&
      state.model.id === PROBABILITY_MODEL.id &&
      state.model.version === PROBABILITY_MODEL.version,
    'invalid-state',
    '/state/model',
  )
  requireInput(
    isObject(state.groups) && Object.keys(state.groups).length === PITY_GROUPS.length,
    'invalid-state',
    '/state/groups',
  )
  for (const kind of BANNER_KINDS) {
    const group: PityGroup = `pity:${kind}`
    const pity = state.groups[group]
    const path = `/state/groups/${group}`
    requireInput(isObject(pity), 'invalid-state', path)
    requireInput(
      Number.isSafeInteger(pity.pullsSinceLast5) &&
        pity.pullsSinceLast5 >= 0 &&
        pity.pullsSinceLast5 < (isLightCone(kind) ? 80 : 90),
      'invalid-state',
      `${path}/pullsSinceLast5`,
    )
    requireInput(
      Number.isSafeInteger(pity.pullsSinceLast4) &&
        pity.pullsSinceLast4 >= 0 &&
        pity.pullsSinceLast4 <= 9,
      'invalid-state',
      `${path}/pullsSinceLast4`,
    )
    requireInput(
      typeof pity.guaranteed5 === 'boolean' && (kind !== 'ordinary' || !pity.guaranteed5),
      'invalid-state',
      `${path}/guaranteed5`,
    )
    requireInput(
      typeof pity.guaranteed4 === 'boolean' && (kind.startsWith('event-') || !pity.guaranteed4),
      'invalid-state',
      `${path}/guaranteed4`,
    )
  }
}
/** Internal transition: caller has validated state and resolved a legal outcome. */
export function transitionPity(
  pity: PityState,
  rarity: 3 | 4 | 5,
  isUp: boolean | null,
): PityState {
  return Object.freeze({
    pullsSinceLast5: rarity === 5 ? 0 : pity.pullsSinceLast5 + 1,
    pullsSinceLast4: rarity === 4 ? 0 : Math.min(9, pity.pullsSinceLast4 + 1),
    guaranteed5: rarity === 5 ? isUp === false : pity.guaranteed5,
    guaranteed4: rarity === 4 ? isUp === false : pity.guaranteed4,
  })
}
/** Copy all groups so output never aliases mutable caller-owned state. */
export function replacePity(state: SessionState, group: PityGroup, pity: PityState): SessionState {
  return Object.freeze({
    model: PROBABILITY_MODEL,
    groups: Object.freeze(
      Object.fromEntries(
        PITY_GROUPS.map((key) => [
          key,
          Object.freeze({ ...(key === group ? pity : state.groups[key]) }),
        ]),
      ) as Record<PityGroup, PityState>,
    ),
  })
}
