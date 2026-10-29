import { describe, expect, it } from 'vitest'
import { pullOnce } from '../../../src/tools/warp-simulator/engine/gacha'
import {
  character4Rate,
  character5Rate,
  lightCone4Rate,
  lightCone5Rate,
  rarityProbabilities,
} from '../../../src/tools/warp-simulator/engine/probability'
import { resolvePool } from '../../../src/tools/warp-simulator/engine/resolver'
import { createSessionState } from '../../../src/tools/warp-simulator/engine/state'
import {
  fixture,
  kinds,
  poolFor,
  scripted,
  selectedAvatarIds,
  unwrap,
  withPity,
} from '../../fixtures/warp-simulator/fixture'
import { oracleHazards, theoreticalRates } from '../../fixtures/warp-simulator/oracle'

describe('independent mathematical oracle', () => {
  it.each(kinds)('cross-checks every legal counter pair for %s', (kind) => {
    const cone = kind.endsWith('light-cone')
    for (let n5 = 1; n5 <= (cone ? 80 : 90); n5++)
      for (let n4 = 1; n4 <= 10; n4++) {
        const expected = oracleHazards(cone, n5, n4),
          actual = rarityProbabilities(kind, n5, n4)
        expect((cone ? lightCone5Rate : character5Rate)(n5)).toBeCloseTo(expected.five, 14)
        expect((cone ? lightCone4Rate : character4Rate)(n4)).toBeCloseTo(expected.four, 14)
        expect(actual.fourStar).toBeCloseTo((1 - expected.five) * expected.four, 14)
        expect(actual.threeStar).toBeCloseTo((1 - expected.five) * (1 - expected.four), 14)
        expect(actual.fiveStar + actual.fourStar + actual.threeStar).toBeCloseTo(1, 14)
      }
  })
  it.each([false, true])(
    'computes renewal and joint-state long-run rates independently (cone=%s)',
    (cone) => {
      const result = theoreticalRates(cone)
      expect(result.fiveStar).toBeCloseTo(result.renewalFiveStar, 11)
      expect(result.fiveStar).toBeCloseTo(cone ? 0.01872271805827243 : 0.01605205178552176, 11)
      expect(result.fourStar).toBeCloseTo(cone ? 0.14499985462882498 : 0.129558431880062, 11)
      expect(result.mass).toBeCloseTo(1, 10)
      expect(result.residual).toBeLessThanOrEqual(1e-13)
    },
  )
  it.each(['event-avatar', 'fate-avatar', 'event-light-cone', 'fate-light-cone'] as const)(
    'enumerates every five-star branch and slot (%s)',
    (kind) => {
      for (const overlap of kind.endsWith('avatar') ? [false, true] : [false]) {
        const selected = overlap ? ['avatar:9', ...selectedAvatarIds.slice(1)] : selectedAvatarIds
        const pool = unwrap(
          resolvePool(
            fixture(),
            `gacha:${100 + kinds.indexOf(kind)}`,
            kind.endsWith('avatar') ? { selectedAvatarIds: selected } : {},
          ),
        )
        const direct = kind.endsWith('avatar') ? 0.5 : 0.75
        const masses = new Map<string, number>()
        const add = (id: string, mass: number) => masses.set(id, (masses.get(id) ?? 0) + mass)
        const directHit = unwrap(pullOnce(pool, createSessionState(), scripted([0, direct / 2])))
        expect(directHit.event.branch).toBe('direct')
        add(directHit.event.itemId, direct)
        for (let i = 0; i < 8; i++) {
          const hit = unwrap(
            pullOnce(pool, createSessionState(), scripted([0, direct, (i + 0.5) / 8])),
          )
          expect(hit.event.branch).toBe('fallback')
          expect(hit.event.itemId).toBe(pool.fiveStar[i].id)
          expect(hit.nextState.groups[pool.pityGroup].guaranteed5).toBe(!hit.event.isUp)
          add(hit.event.itemId, (1 - direct) / 8)
        }
        expect([...masses.values()].reduce((a, b) => a + b, 0)).toBe(1)
        expect(masses.get(pool.up5!.id)).toBe(
          overlap ? 0.625 : kind.endsWith('avatar') ? 0.5625 : 0.78125,
        )
        for (const [id, mass] of masses)
          if (id !== pool.up5!.id) expect(mass).toBe((1 - direct) / 8)
      }
    },
  )
  it.each(['event-avatar', 'event-light-cone'] as const)(
    'enumerates four-star item distribution and guaranteed thirds (%s)',
    (kind) => {
      const pool = poolFor(kind),
        direct = kind.endsWith('avatar') ? 0.5 : 0.75
      const masses = new Map<string, number>()
      const add = (id: string, mass: number) => masses.set(id, (masses.get(id) ?? 0) + mass)
      for (let i = 0; i < 3; i++) {
        const hit = unwrap(
          pullOnce(pool, createSessionState(), scripted([0.99, 0, 0, (i + 0.5) / 3])),
        )
        expect(hit.event.itemId).toBe(pool.up4[i].id)
        add(hit.event.itemId, direct / 3)
        const guaranteed = unwrap(
          pullOnce(
            pool,
            withPity({ guaranteed4: true }, pool.pityGroup),
            scripted([0.99, 0, (i + 0.5) / 3]),
          ),
        )
        expect(guaranteed.event).toMatchObject({
          branch: 'guaranteed',
          itemId: pool.up4[i].id,
          isUp: true,
        })
      }
      for (let i = 0; i < pool.fourStar.length; i++) {
        const hit = unwrap(
          pullOnce(
            pool,
            createSessionState(),
            scripted([0.99, 0, direct, (i + 0.5) / pool.fourStar.length]),
          ),
        )
        expect(hit.event.itemId).toBe(pool.fourStar[i].id)
        add(hit.event.itemId, (1 - direct) / pool.fourStar.length)
      }
      for (const item of pool.fourStar) {
        const expected =
          (1 - direct) / pool.fourStar.length +
          (pool.up4.some((v) => v.id === item.id) ? direct / 3 : 0)
        expect(masses.get(item.id)).toBeCloseTo(expected, 14)
      }
      const upMass = pool.up4.reduce((sum, item) => sum + masses.get(item.id)!, 0)
      expect(upMass).toBeCloseTo(direct + ((1 - direct) * 3) / pool.fourStar.length, 14)
    },
  )
})
