import { describe, expect, it } from 'vitest'
import { pullOnce, pullTen } from '../../../src/tools/warp-simulator/engine/gacha'
import { resolvePool } from '../../../src/tools/warp-simulator/engine/resolver'
import { createSessionState } from '../../../src/tools/warp-simulator/engine/state'
import type {
  PityState,
  ResolvedPool,
  SessionState,
} from '../../../src/tools/warp-simulator/engine/types'
import {
  fixture,
  kinds,
  poolFor,
  scripted,
  seeded,
  selectedAvatarIds,
  unwrap,
  withPity,
} from '../../fixtures/warp-simulator/fixture'

describe('rarity priority and pending four-star guarantee', () => {
  it.each(kinds)('five-star wins simultaneous hard pity (%s)', (kind) => {
    const pool = poolFor(kind),
      cone = kind.endsWith('light-cone')
    const state = withPity({ pullsSinceLast5: cone ? 79 : 89, pullsSinceLast4: 9 }, pool.pityGroup)
    const result = unwrap(pullOnce(pool, state, scripted([1 - Number.EPSILON, 0])))
    expect(result.event.rarity).toBe(5)
    expect(result.nextState.groups[pool.pityGroup]).toMatchObject({
      pullsSinceLast5: 0,
      pullsSinceLast4: 9,
    })
    expect(result.event.pityBefore).toEqual(state.groups[pool.pityGroup])
  })
  it('retains four-star pity and UP guarantee through consecutive five-stars, then redeems both', () => {
    const pool = poolFor()
    let state = withPity({ pullsSinceLast4: 8, guaranteed4: true })
    for (let i = 0; i < 4; i++) {
      state = unwrap(pullOnce(pool, state, scripted([0, 0]))).nextState
      expect(state.groups[pool.pityGroup]).toMatchObject({ pullsSinceLast4: 9, guaranteed4: true })
    }
    const outcome = unwrap(pullOnce(pool, state, scripted([0.99, 1 - Number.EPSILON, 0.4])))
    expect(outcome.event).toMatchObject({
      rarity: 4,
      branch: 'guaranteed',
      isUp: true,
      itemId: 'avatar:22',
    })
    expect(outcome.nextState.groups[pool.pityGroup]).toMatchObject({
      pullsSinceLast5: 1,
      pullsSinceLast4: 0,
      guaranteed4: false,
    })
  })
  it('increments independent counters on three-star and four-star outcomes', () => {
    const pool = poolFor(),
      state = withPity({ pullsSinceLast5: 12, pullsSinceLast4: 3, guaranteed5: true })
    const three = unwrap(pullOnce(pool, state, scripted([0.99, 0.99, 0])))
    expect(three.event).toMatchObject({ rarity: 3, branch: 'uniform', isUp: null })
    expect(three.nextState.groups[pool.pityGroup]).toEqual({
      pullsSinceLast5: 13,
      pullsSinceLast4: 4,
      guaranteed5: true,
      guaranteed4: false,
    })
    const four = unwrap(pullOnce(pool, three.nextState, scripted([0.99, 0, 0, 0])))
    expect(four.nextState.groups[pool.pityGroup]).toEqual({
      pullsSinceLast5: 14,
      pullsSinceLast4: 0,
      guaranteed5: true,
      guaranteed4: false,
    })
  })
})

describe('canonical ID UP and uniform item selection', () => {
  it.each(['event-avatar', 'event-light-cone', 'fate-avatar', 'fate-light-cone'] as const)(
    'activates, redeems and clears five-star UP guarantee (%s)',
    (kind) => {
      const pool = poolFor(kind),
        state = createSessionState()
      const miss = unwrap(pullOnce(pool, state, scripted([0, 0.99, 0.2])))
      expect(miss.event).toMatchObject({ rarity: 5, branch: 'fallback', isUp: false })
      expect(miss.nextState.groups[pool.pityGroup].guaranteed5).toBe(true)
      const rng = scripted([0])
      const hit = unwrap(pullOnce(pool, miss.nextState, rng))
      expect(hit.event).toMatchObject({ itemId: pool.up5!.id, branch: 'guaranteed', isUp: true })
      expect(hit.nextState.groups[pool.pityGroup].guaranteed5).toBe(false)
      expect(rng.consumed).toBe(1)
      const fallbackHit = unwrap(pullOnce(pool, state, scripted([0, 0.99, 0])))
      expect(fallbackHit.event).toMatchObject({
        itemId: pool.up5!.id,
        branch: 'fallback',
        isUp: true,
      })
      expect(fallbackHit.nextState.groups[pool.pityGroup].guaranteed5).toBe(false)
    },
  )
  it.each(['event-avatar', 'event-light-cone'] as const)(
    'activates, redeems and clears four-star UP guarantee (%s)',
    (kind) => {
      const pool = poolFor(kind),
        state = withPity({ guaranteed5: true }, pool.pityGroup)
      const miss = unwrap(pullOnce(pool, state, scripted([0.99, 0, 0.99, 0.99])))
      expect(miss.event).toMatchObject({ rarity: 4, branch: 'fallback', isUp: false })
      expect(miss.nextState.groups[pool.pityGroup]).toMatchObject({
        guaranteed4: true,
        guaranteed5: true,
      })
      const hit = unwrap(pullOnce(pool, miss.nextState, scripted([0.99, 0, 1 - Number.EPSILON])))
      expect(hit.event).toMatchObject({ itemId: pool.up4[2].id, branch: 'guaranteed', isUp: true })
      expect(hit.nextState.groups[pool.pityGroup]).toMatchObject({
        guaranteed4: false,
        guaranteed5: true,
      })
      const fallbackIndex = pool.fourStar.findIndex((v) => v.id === pool.up4[0].id)
      const fallbackHit = unwrap(
        pullOnce(
          pool,
          state,
          scripted([0.99, 0, 0.99, (fallbackIndex + 0.5) / pool.fourStar.length]),
        ),
      )
      expect(fallbackHit.event).toMatchObject({ branch: 'fallback', isUp: true })
      expect(fallbackHit.nextState.groups[pool.pityGroup].guaranteed4).toBe(false)
    },
  )
  it('retains two UP slots when the chosen seven contain UP', () => {
    const pool = unwrap(
      resolvePool(fixture(), 'gacha:100', {
        selectedAvatarIds: ['avatar:9', ...selectedAvatarIds.slice(1)],
      }),
    )
    const results = Array.from(
      { length: 8 },
      (_, slot) =>
        unwrap(pullOnce(pool, createSessionState(), scripted([0, 0.99, (slot + 0.5) / 8]))).event,
    )
    expect(results.filter((v) => v.isUp).map((v) => v.itemId)).toEqual(['avatar:9', 'avatar:9'])
    expect(results.map((v) => v.itemId)).toEqual(pool.fiveStar.map((v) => v.id))
  })
  it('recognizes equal IDs in different objects, irrespective of names or reference', () => {
    const original = poolFor()
    const pool: ResolvedPool = {
      ...original,
      up5: { ...original.up5! },
      up4: original.up4.map((v) => ({ ...v })),
    }
    expect(pool.up5).not.toBe(pool.fiveStar[0])
    expect(unwrap(pullOnce(pool, createSessionState(), scripted([0, 0.99, 0]))).event.isUp).toBe(
      true,
    )
    expect(
      unwrap(pullOnce(pool, createSessionState(), scripted([0.99, 0, 0.99, 0]))).event.isUp,
    ).toBe(true)
  })
  it('samples an uneven mixed pool by item, without a kind-first decision', () => {
    const data = fixture()
    data.sharedPools[2].fourStar = ['avatar:21', 'avatar:22', 'avatar:23', 'light-cone:21']
    const pool = unwrap(resolvePool(data, 'gacha:104'))
    for (let i = 0; i < 3; i++) {
      const result = unwrap(pullOnce(pool, createSessionState(), scripted([0, (i + 0.5) / 3])))
      expect(result.event.itemId).toBe(pool.fiveStar[i].id)
      expect(result.event.isUp).toBeNull()
      expect(result.nextState.groups[pool.pityGroup].guaranteed5).toBe(false)
    }
    for (let i = 0; i < 4; i++) {
      const rng = scripted([0.99, 0, (i + 0.5) / 4])
      const result = unwrap(pullOnce(pool, createSessionState(), rng))
      expect(result.event.itemId).toBe(pool.fourStar[i].id)
      expect(result.nextState.groups[pool.pityGroup].guaranteed4).toBe(false)
      expect(rng.consumed).toBe(3)
    }
  })
  it.each(['ordinary', 'fate-avatar', 'fate-light-cone'] as const)(
    'has no four-star UP (%s)',
    (kind) => {
      const pool = poolFor(kind)
      const outcome = unwrap(pullOnce(pool, createSessionState(), scripted([0.99, 0, 0.99])))
      expect(outcome.event).toMatchObject({ rarity: 4, branch: 'uniform', isUp: null })
      expect(outcome.nextState.groups[pool.pityGroup].guaranteed4).toBe(false)
    },
  )
})

describe('session inheritance and atomicity', () => {
  it('inherits pity and both guarantees across Banners and selections in the same group', () => {
    const data = fixture()
    data.banners.push({ ...data.banners[0], id: 'gacha:200', gachaId: '200', up5: 'avatar:8' })
    const first = poolFor()
    const second = unwrap(
      resolvePool(data, 'gacha:200', {
        selectedAvatarIds: ['avatar:8', ...selectedAvatarIds.slice(1)],
      }),
    )
    const state = withPity({
      pullsSinceLast5: 89,
      pullsSinceLast4: 9,
      guaranteed5: true,
      guaranteed4: true,
    })
    const result = unwrap(pullOnce(second, state, scripted([0.99])))
    expect(first.pityGroup).toBe(second.pityGroup)
    expect(result.event).toMatchObject({
      bannerId: 'gacha:200',
      itemId: 'avatar:8',
      branch: 'guaranteed',
    })
    expect(result.nextState.groups[second.pityGroup]).toEqual({
      pullsSinceLast5: 0,
      pullsSinceLast4: 9,
      guaranteed5: false,
      guaranteed4: true,
    })
  })
  it.each(kinds)('updates only its own inheritance group (%s)', (kind) => {
    const pool = poolFor(kind),
      state = withPity({
        pullsSinceLast5: 12,
        pullsSinceLast4: 8,
        guaranteed5: true,
        guaranteed4: true,
      })
    const before = structuredClone(state)
    const result = unwrap(pullOnce(pool, state, scripted([0.99, 0.99, 0, 0])))
    for (const other of kinds)
      if (other !== kind)
        expect(result.nextState.groups[`pity:${other}`]).toEqual(state.groups[`pity:${other}`])
    expect(state).toEqual(before)
    expect(result.event.model).toEqual({ id: 'hsr-warp', version: 'v0.3' })
  })
  it.each([NaN, Infinity, -Infinity, -0.1, 1, 1.1, undefined, '0'])(
    'rejects invalid RNG value %s at every consumed position',
    (invalid) => {
      const pool = poolFor(),
        state = createSessionState()
      for (const prefix of [[], [0.99], [0.99, 0.99], [0], [0, 0.99], [0.99, 0, 0.99]]) {
        const rng = scripted([...prefix, invalid as number])
        expect(pullOnce(pool, state, rng)).toMatchObject({
          ok: false,
          diagnostic: { code: 'invalid-rng' },
        })
        expect(state).toEqual(createSessionState())
      }
    },
  )
  it('returns explicit diagnostics for missing and throwing RNG', () => {
    const pool = poolFor(),
      state = createSessionState()
    for (const rng of [null, {}, { next: 1 }])
      expect(pullOnce(pool, state, rng as never)).toMatchObject({
        ok: false,
        diagnostic: { code: 'invalid-rng' },
      })
    expect(
      pullOnce(pool, state, {
        next() {
          throw new Error('injected')
        },
      }),
    ).toMatchObject({ ok: false, diagnostic: { code: 'rng-threw' } })
  })
  it.each([
    { pullsSinceLast5: -1 },
    { pullsSinceLast5: 0.5 },
    { pullsSinceLast5: 90 },
    { pullsSinceLast5: NaN },
    { pullsSinceLast4: -1 },
    { pullsSinceLast4: 10 },
    { pullsSinceLast4: Infinity },
    { guaranteed5: 1 },
    { guaranteed4: null },
  ])('rejects illegal state %j before RNG', (patch) => {
    const state = withPity(patch as Partial<PityState>),
      before = structuredClone(state),
      rng = scripted([0])
    expect(pullOnce(poolFor(), state, rng)).toMatchObject({
      ok: false,
      diagnostic: { code: 'invalid-state' },
    })
    expect(state).toEqual(before)
    expect(rng.consumed).toBe(0)
  })
  it('validates every group, model, structure and inapplicable guarantees', () => {
    const states: unknown[] = [
      null,
      {},
      { ...createSessionState(), model: { id: 'hsr-warp', version: 'v0.2' } },
      { ...createSessionState(), groups: {} },
      withPity({ pullsSinceLast5: 80 }, 'pity:fate-light-cone'),
      withPity({ guaranteed5: true }, 'pity:ordinary'),
      ...(['ordinary', 'fate-avatar', 'fate-light-cone'] as const).map((kind) =>
        withPity({ guaranteed4: true }, `pity:${kind}`),
      ),
    ]
    for (const state of states) {
      const rng = scripted([0])
      expect(pullTen(poolFor(), state as SessionState, rng)).toMatchObject({
        ok: false,
        diagnostic: { code: 'invalid-state' },
      })
      expect(rng.consumed).toBe(0)
    }
  })
  it('rejects forged invalid resolved pools before RNG even when the current outcome would not need the candidates', () => {
    const pool = poolFor(),
      state = withPity({ guaranteed5: true }),
      rng = scripted([0])
    const pools: unknown[] = [
      null,
      {},
      { ...pool, threeStar: [] },
      { ...pool, fourStar: [null] },
      { ...pool, fiveStar: pool.fiveStar.slice(1) },
      { ...pool, pityGroup: 'pity:ordinary' },
      { ...pool, up4: [pool.up4[0]] },
      { ...pool, model: { id: 'hsr-warp', version: 'v0.2' } },
    ]
    for (const invalid of pools) {
      expect(pullOnce(invalid as ResolvedPool, state, rng).ok).toBe(false)
      expect(pullTen(invalid as ResolvedPool, state, rng).ok).toBe(false)
    }
    expect(rng.consumed).toBe(0)
    expect(state.groups[pool.pityGroup].guaranteed5).toBe(true)
  })
  it.each(kinds)('ten pulls exactly equal ten singles including RNG consumption (%s)', (kind) => {
    const pool = poolFor(kind)
    const state = withPity(
      { pullsSinceLast5: kind.endsWith('light-cone') ? 78 : 88, pullsSinceLast4: 8 },
      pool.pityGroup,
    )
    const tenRng = seeded(24302),
      singleRng = seeded(24302)
    const batch = unwrap(pullTen(pool, state, tenRng)),
      events = []
    let current = state
    for (let i = 0; i < 10; i++) {
      const result = unwrap(pullOnce(pool, current, singleRng))
      current = result.nextState
      events.push(result.event)
    }
    expect(batch).toEqual({ nextState: current, events })
    expect(tenRng.consumed).toBe(singleRng.consumed)
  })
  it('discards an otherwise successful prefix on a late ten-pull failure', () => {
    const state = createSessionState(),
      before = structuredClone(state)
    const rng = scripted([...Array(9 * 3).fill(0.99), NaN])
    expect(pullTen(poolFor('ordinary'), state, rng)).toMatchObject({
      ok: false,
      diagnostic: { code: 'invalid-rng' },
    })
    expect(rng.consumed).toBe(28)
    expect(state).toEqual(before)
  })
  it('does not alias caller state, item objects or event context in returned state', () => {
    const state = structuredClone(createSessionState()) as any
    const outcome = unwrap(pullOnce(poolFor(), state, scripted([0.99, 0.99, 0])))
    state.groups['pity:ordinary'].pullsSinceLast5 = 40
    state.groups['pity:event-avatar'].pullsSinceLast4 = 8
    expect(outcome.nextState.groups['pity:ordinary'].pullsSinceLast5).toBe(0)
    expect(outcome.event.pityBefore.pullsSinceLast4).toBe(0)
    expect(Object.isFrozen(outcome.nextState.groups)).toBe(true)
    expect(Object.isFrozen(outcome.event)).toBe(true)
    const a = createSessionState(),
      b = createSessionState()
    expect(a.groups).not.toBe(b.groups)
  })
})
