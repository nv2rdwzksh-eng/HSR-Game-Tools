/** Independent Warp data contract. Catalog membership never implies warp eligibility. */
export type WarpItemKind = 'avatar' | 'light-cone'
export interface WarpItem {
  id: string
  kind: WarpItemKind
  rarity: 3 | 4 | 5
  names: { 'zh-CN': string; en: string }
}
export type WarpBannerKind =
  'event-avatar' | 'event-light-cone' | 'fate-avatar' | 'fate-light-cone' | 'ordinary'
export interface WarpPool {
  id: string
  fiveStarType: WarpItemKind | 'mixed'
  threeStar: string[]
  fourStar: string[]
  fiveStar: string[]
}
export interface WarpBanner {
  id: string
  gachaId: string
  kind: WarpBannerKind
  pityGroup: string
  sharedPool: string
  up5?: string
  up4?: string[]
}
export interface WarpSnapshot {
  schemaVersion: 1
  items: WarpItem[]
  sharedPools: WarpPool[]
  banners: WarpBanner[]
}
