import type { WarpBannerKind, WarpItem } from '../data/schema'

export type PityGroup = `pity:${WarpBannerKind}`
export interface ModelIdentity {
  readonly id: 'hsr-warp'
  readonly version: 'v0.3'
}
export type ResolvedItem = Readonly<Pick<WarpItem, 'id' | 'kind' | 'rarity'>>
export interface ResolvedPool {
  readonly model: ModelIdentity
  readonly bannerId: string
  readonly gachaId: string
  readonly kind: WarpBannerKind
  readonly pityGroup: PityGroup
  readonly sharedPoolId: string
  readonly threeStar: readonly ResolvedItem[]
  readonly fourStar: readonly ResolvedItem[]
  /** Event: [UP, ...seven fallback slots]. Ordinary: the complete five-star pool. */
  readonly fiveStar: readonly ResolvedItem[]
  readonly up5?: ResolvedItem
  readonly up4: readonly ResolvedItem[]
}
export interface ResolveOptions {
  readonly selectedAvatarIds?: readonly string[]
}
export interface PityState {
  readonly pullsSinceLast5: number
  /** Saturates at 9: the next non-five-star pull must be four-star. */
  readonly pullsSinceLast4: number
  readonly guaranteed5: boolean
  readonly guaranteed4: boolean
}
export interface SessionState {
  readonly model: ModelIdentity
  readonly groups: Readonly<Record<PityGroup, PityState>>
}
export interface Rng {
  next(): number
}
export type DiagnosticCode =
  | 'invalid-snapshot'
  | 'unknown-banner'
  | 'unknown-pool'
  | 'unknown-item'
  | 'invalid-pool'
  | 'invalid-selection'
  | 'invalid-state'
  | 'invalid-rng'
  | 'rng-threw'
export interface WarpDiagnostic {
  readonly code: DiagnosticCode
  readonly path: string
  readonly params: Readonly<Record<string, string | number | boolean>>
}
export type WarpResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostic: WarpDiagnostic }
export interface PullEvent {
  readonly model: ModelIdentity
  readonly bannerId: string
  readonly pityGroup: PityGroup
  readonly itemId: string
  readonly rarity: 3 | 4 | 5
  readonly pityBefore: PityState
  readonly branch: 'uniform' | 'guaranteed' | 'direct' | 'fallback'
  /** null when this rarity has no UP mechanism. */
  readonly isUp: boolean | null
}
export interface PullOutcome {
  readonly event: PullEvent
  readonly nextState: SessionState
}
export interface TenPullOutcome {
  readonly events: readonly PullEvent[]
  readonly nextState: SessionState
}
