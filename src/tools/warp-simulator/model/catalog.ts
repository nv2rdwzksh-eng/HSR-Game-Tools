import type { WarpBanner, WarpBannerKind, WarpSnapshot } from '../data/schema'
import { resolvePool } from '../engine/resolver'
import type { PityGroup, WarpDiagnostic } from '../engine/types'

export interface AvailableBanner {
  readonly banner: Readonly<WarpBanner>
  readonly pityGroup: PityGroup
  readonly eligibleAvatarIds: readonly string[]
  readonly requiresSelection: boolean
}
export const BANNER_KIND_ORDER: readonly WarpBannerKind[] = Object.freeze([
  'event-avatar',
  'event-light-cone',
  'ordinary',
  'fate-avatar',
  'fate-light-cone',
])
export function availableBanners(snapshot: WarpSnapshot) {
  const banners: AvailableBanner[] = []
  const diagnostics: { bannerId: string; diagnostic: WarpDiagnostic }[] = []
  for (const banner of snapshot.banners) {
    const requiresSelection = banner.kind === 'event-avatar' || banner.kind === 'fate-avatar'
    const eligible = requiresSelection
      ? (snapshot.sharedPools.find((pool) => pool.id === banner.sharedPool)?.fiveStar ?? [])
      : []
    // This witness validates configuration only. It is never saved or used for a draw.
    const result = resolvePool(
      snapshot,
      banner.id,
      requiresSelection ? { selectedAvatarIds: eligible.slice(0, 7) } : {},
    )
    if (result.ok)
      banners.push(
        Object.freeze({
          banner,
          pityGroup: result.value.pityGroup,
          requiresSelection,
          eligibleAvatarIds: Object.freeze([...eligible]),
        }),
      )
    else diagnostics.push({ bannerId: banner.id, diagnostic: result.diagnostic })
  }
  const groups = BANNER_KIND_ORDER.map((kind) =>
    Object.freeze({
      kind,
      banners: Object.freeze(banners.filter((entry) => entry.banner.kind === kind)),
    }),
  ).filter((group) => group.banners.length > 0)
  return {
    banners: Object.freeze(banners),
    groups: Object.freeze(groups),
    diagnostics: Object.freeze(diagnostics),
  }
}
