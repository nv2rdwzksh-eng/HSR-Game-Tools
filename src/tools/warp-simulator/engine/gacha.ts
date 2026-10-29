import {
  character4Rate,
  character5Rate,
  isLightCone,
  lightCone4Rate,
  lightCone5Rate,
  PROBABILITY_MODEL,
} from './probability'
import { assertResolvedPool } from './resolver'
import { assertSessionState, replacePity, transitionPity } from './state'
import type {
  PullEvent,
  PullOutcome,
  ResolvedItem,
  ResolvedPool,
  Rng,
  SessionState,
  TenPullOutcome,
  WarpResult,
} from './types'
import { attempt, requireInput } from './validation'

function nextRandom(rng: Rng): number {
  let value: number
  try {
    value = rng.next()
  } catch {
    requireInput(false, 'rng-threw', '/rng/next')
  }
  requireInput(
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1,
    'invalid-rng',
    '/rng/next',
  )
  return value
}
function validateInputs(pool: ResolvedPool, state: SessionState, rng: Rng): void {
  assertResolvedPool(pool)
  assertSessionState(state)
  requireInput(
    rng !== null && rng !== undefined && typeof rng.next === 'function',
    'invalid-rng',
    '/rng',
  )
}
/** Shared sampler. Public boundaries validate once; no intermediate state escapes. */
function draw(pool: ResolvedPool, state: SessionState, rng: Rng): PullOutcome {
  const pity = state.groups[pool.pityGroup]
  const cone = isLightCone(pool.kind)
  const p5 = (cone ? lightCone5Rate : character5Rate)(pity.pullsSinceLast5 + 1)
  const rarity =
    nextRandom(rng) < p5
      ? 5
      : nextRandom(rng) < (cone ? lightCone4Rate : character4Rate)(pity.pullsSinceLast4 + 1)
        ? 4
        : 3
  const candidates = rarity === 5 ? pool.fiveStar : rarity === 4 ? pool.fourStar : pool.threeStar
  const up = rarity === 5 && pool.up5 ? [pool.up5] : rarity === 4 ? pool.up4 : []
  const pick = (items: readonly ResolvedItem[]) => items[Math.floor(nextRandom(rng) * items.length)]
  let item: ResolvedItem
  let branch: PullEvent['branch']
  if (up.length === 0) {
    branch = 'uniform'
    item = pick(candidates)
  } else if (rarity === 5 ? pity.guaranteed5 : pity.guaranteed4) {
    branch = 'guaranteed'
    item = rarity === 5 ? up[0] : pick(up)
  } else if (nextRandom(rng) < (cone ? 0.75 : 0.5)) {
    branch = 'direct'
    item = rarity === 5 ? up[0] : pick(up)
  } else {
    branch = 'fallback'
    item = pick(candidates)
  }
  const isUp = up.length ? up.some((v) => v.id === item.id) : null
  const event: PullEvent = Object.freeze({
    model: PROBABILITY_MODEL,
    bannerId: pool.bannerId,
    pityGroup: pool.pityGroup,
    itemId: item.id,
    rarity,
    pityBefore: Object.freeze({ ...pity }),
    branch,
    isUp,
  })
  return {
    event,
    nextState: replacePity(state, pool.pityGroup, transitionPity(pity, rarity, isUp)),
  }
}
export function pullOnce(
  pool: ResolvedPool,
  state: SessionState,
  rng: Rng,
): WarpResult<PullOutcome> {
  return attempt(() => {
    validateInputs(pool, state, rng)
    return draw(pool, state, rng)
  })
}
export function pullTen(
  pool: ResolvedPool,
  state: SessionState,
  rng: Rng,
): WarpResult<TenPullOutcome> {
  return attempt(() => {
    validateInputs(pool, state, rng)
    const events: PullEvent[] = []
    let nextState = state
    for (let i = 0; i < 10; i++) {
      const outcome = draw(pool, nextState, rng)
      events.push(outcome.event)
      nextState = outcome.nextState
    }
    return { events: Object.freeze(events), nextState }
  })
}
