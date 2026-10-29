import type { WarpBannerKind } from '../data/schema'
import type { ModelIdentity } from './types'

export const PROBABILITY_MODEL: ModelIdentity = Object.freeze({ id: 'hsr-warp', version: 'v0.3' })
export const BANNER_KINDS = Object.freeze([
  'event-avatar',
  'event-light-cone',
  'fate-avatar',
  'fate-light-cone',
  'ordinary',
] as const)
export function isLightCone(kind: WarpBannerKind): boolean {
  if (!BANNER_KINDS.includes(kind)) throw new RangeError('Unknown banner kind')
  return kind === 'event-light-cone' || kind === 'fate-light-cone'
}
function requirePullNumber(n: number): void {
  if (!Number.isSafeInteger(n) || n < 1)
    throw new RangeError('Pull number must be a positive integer')
}
export function character5Rate(n: number): number {
  requirePullNumber(n)
  return n <= 73 ? 0.006 : Math.min(1, 0.006 + 0.06 * (n - 73))
}
export function lightCone5Rate(n: number): number {
  requirePullNumber(n)
  return n <= 65 ? 0.008 : Math.min(1, 0.008 + 0.07 * (n - 65))
}
export function character4Rate(n: number): number {
  requirePullNumber(n)
  return n <= 8 ? 0.051 : n === 9 ? 0.52 : 1
}
export function lightCone4Rate(n: number): number {
  requirePullNumber(n)
  return n <= 7 ? 0.066 : n === 8 ? 0.397 : n === 9 ? 0.728 : 1
}
/** n5/n4 are one-based current pull numbers; fourStar is an unconditional probability. */
export function rarityProbabilities(kind: WarpBannerKind, n5: number, n4: number) {
  const cone = isLightCone(kind)
  const p5 = cone ? lightCone5Rate(n5) : character5Rate(n5)
  const p4 = cone ? lightCone4Rate(n4) : character4Rate(n4)
  return { fiveStar: p5, fourStar: (1 - p5) * p4, threeStar: (1 - p5) * (1 - p4) }
}
