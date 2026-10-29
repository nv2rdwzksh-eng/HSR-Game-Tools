import type {
  WarpBannerKind,
  WarpItem,
  WarpSnapshot,
} from '../../../src/tools/warp-simulator/data/schema'
import { resolvePool } from '../../../src/tools/warp-simulator/engine/resolver'
import { createSessionState } from '../../../src/tools/warp-simulator/engine/state'
import type {
  PityGroup,
  PityState,
  Rng,
  SessionState,
  WarpResult,
} from '../../../src/tools/warp-simulator/engine/types'

export const kinds: WarpBannerKind[] = [
  'event-avatar',
  'event-light-cone',
  'fate-avatar',
  'fate-light-cone',
  'ordinary',
]
export const selectedAvatarIds = Array.from({ length: 7 }, (_, i) => `avatar:${i + 1}`)
export function fixture(): WarpSnapshot {
  const item = (kind: WarpItem['kind'], rarity: WarpItem['rarity'], n: number): WarpItem => ({
    id: `${kind}:${n}`,
    kind,
    rarity,
    names: { 'zh-CN': '合成同名条目', en: 'Synthetic same name' },
  })
  const items = [
    ...Array.from({ length: 9 }, (_, i) => item('avatar', 5, i + 1)),
    ...Array.from({ length: 8 }, (_, i) => item('light-cone', 5, i + 1)),
    ...Array.from({ length: 4 }, (_, i) => item('avatar', 4, i + 21)),
    ...Array.from({ length: 4 }, (_, i) => item('light-cone', 4, i + 21)),
    item('light-cone', 3, 31),
    item('light-cone', 3, 32),
  ]
  const sharedPools = (['avatar', 'light-cone', 'mixed'] as const).map((type) => ({
    id: type,
    fiveStarType: type,
    threeStar: ['light-cone:31', 'light-cone:32'],
    fourStar: items.filter((v) => v.rarity === 4).map((v) => v.id),
    fiveStar:
      type === 'mixed'
        ? ['avatar:1', 'light-cone:1', 'light-cone:2']
        : type === 'avatar'
          ? items.filter((v) => v.kind === 'avatar' && v.rarity === 5).map((v) => v.id)
          : Array.from({ length: 7 }, (_, i) => `light-cone:${i + 1}`),
  }))
  return {
    schemaVersion: 1,
    items,
    sharedPools,
    banners: kinds.map((kind, i) => {
      const type = kind === 'ordinary' ? 'mixed' : kind.endsWith('avatar') ? 'avatar' : 'light-cone'
      return {
        id: `gacha:${100 + i}`,
        gachaId: String(100 + i),
        kind,
        pityGroup: `pity:${kind}`,
        sharedPool: type,
        ...(kind !== 'ordinary' ? { up5: type === 'avatar' ? 'avatar:9' : 'light-cone:8' } : {}),
        ...(kind.startsWith('event-') ? { up4: [21, 22, 23].map((n) => `${type}:${n}`) } : {}),
      }
    }),
  }
}
export function unwrap<T>(result: WarpResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.diagnostic))
  return result.value
}
/** Multiple Banners without changing maintained data or the original single-Banner fixtures. */
export function multiBannerFixture(): WarpSnapshot {
  const snapshot = fixture()
  snapshot.banners.push(
    { ...snapshot.banners[0]!, id: 'gacha:200', gachaId: '200', up5: 'avatar:8' },
    { ...snapshot.banners[1]!, id: 'gacha:201', gachaId: '201' },
  )
  return snapshot
}
export function poolFor(kind: WarpBannerKind = 'event-avatar') {
  return unwrap(
    resolvePool(
      fixture(),
      `gacha:${100 + kinds.indexOf(kind)}`,
      kind.endsWith('avatar') ? { selectedAvatarIds } : {},
    ),
  )
}
export function withPity(
  patch: Partial<PityState>,
  group: PityGroup = 'pity:event-avatar',
  state = createSessionState(),
): SessionState {
  return { ...state, groups: { ...state.groups, [group]: { ...state.groups[group], ...patch } } }
}
export function scripted(values: readonly number[]) {
  let consumed = 0
  return {
    next: () => values[consumed++],
    get consumed() {
      return consumed
    },
  }
}
/** Mulberry32, unsigned 32-bit seed. Test/experiment helper, no persisted RNG contract. */
export function seeded(seed: number): Rng & { readonly consumed: number } {
  let state = seed >>> 0,
    consumed = 0
  return {
    next() {
      consumed++
      state = (state + 0x6d2b79f5) >>> 0
      let t = Math.imul(state ^ (state >>> 15), 1 | state)
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    },
    get consumed() {
      return consumed
    },
  }
}
