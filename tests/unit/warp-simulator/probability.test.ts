import { describe, expect, it } from 'vitest'
import {
  character4Rate,
  character5Rate,
  lightCone4Rate,
  lightCone5Rate,
  rarityProbabilities,
} from '../../../src/tools/warp-simulator/engine/probability'
import { pullOnce } from '../../../src/tools/warp-simulator/engine/gacha'
import { poolFor, scripted, unwrap, withPity } from '../../fixtures/warp-simulator/fixture'

describe('v0.3 probability boundaries', () => {
  it.each([
    [73, 0.006],
    [74, 0.066],
    [75, 0.126],
    [89, 0.966],
    [90, 1],
  ])('character five-star pull %i', (n, p) => {
    expect(character5Rate(n)).toBeCloseTo(p, 14)
  })
  it.each([
    [65, 0.008],
    [66, 0.078],
    [67, 0.148],
    [79, 0.988],
    [80, 1],
  ])('cone five-star pull %i', (n, p) => {
    expect(lightCone5Rate(n)).toBeCloseTo(p, 14)
  })
  it.each([
    [8, 0.051],
    [9, 0.52],
    [10, 1],
  ])('character four-star pull %i', (n, p) => {
    expect(character4Rate(n)).toBe(p)
  })
  it.each([
    [7, 0.066],
    [8, 0.397],
    [9, 0.728],
    [10, 1],
  ])('cone four-star pull %i', (n, p) => {
    expect(lightCone4Rate(n)).toBe(p)
  })
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid pull number %s',
    (n) => {
      for (const rate of [character4Rate, character5Rate, lightCone4Rate, lightCone5Rate])
        expect(() => rate(n)).toThrow(RangeError)
    },
  )
  it('reports unconditional outcomes from a conditional four-star hazard', () => {
    expect(rarityProbabilities('event-avatar', 1, 1)).toEqual({
      fiveStar: 0.006,
      fourStar: 0.994 * 0.051,
      threeStar: 0.994 * 0.949,
    })
    expect(() => rarityProbabilities('newbie' as never, 1, 1)).toThrow(RangeError)
  })
  it.each(['event-avatar', 'event-light-cone'] as const)(
    'samples below and at every hazard threshold (%s)',
    (kind) => {
      const pool = poolFor(kind),
        cone = kind.endsWith('light-cone')
      const five = cone
        ? [
            [65, 0.008],
            [66, 0.078],
            [67, 0.148],
            [79, 0.988],
            [80, 1],
          ]
        : [
            [73, 0.006],
            [74, 0.066],
            [75, 0.126],
            [89, 0.966],
            [90, 1],
          ]
      for (const [n, expected] of five) {
        const p = (cone ? lightCone5Rate : character5Rate)(n)
        expect(p).toBeCloseTo(expected, 14)
        const state = withPity({ pullsSinceLast5: n - 1 }, pool.pityGroup)
        expect(unwrap(pullOnce(pool, state, scripted([p - 1e-12, 0]))).event.rarity).toBe(5)
        if (p < 1)
          expect(unwrap(pullOnce(pool, state, scripted([p, 0.99, 0]))).event.rarity).toBe(3)
      }
      const four = cone
        ? [
            [7, 0.066],
            [8, 0.397],
            [9, 0.728],
            [10, 1],
          ]
        : [
            [8, 0.051],
            [9, 0.52],
            [10, 1],
          ]
      for (const [n, p] of four) {
        const state = withPity({ pullsSinceLast4: n - 1 }, pool.pityGroup)
        expect(unwrap(pullOnce(pool, state, scripted([0.99, p - 1e-12, 0, 0]))).event.rarity).toBe(
          4,
        )
        if (p < 1)
          expect(unwrap(pullOnce(pool, state, scripted([0.99, p, 0]))).event.rarity).toBe(3)
      }
    },
  )
})
