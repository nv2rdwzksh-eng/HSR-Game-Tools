import type { WarpBannerKind, WarpItemKind, WarpSnapshot } from '../data/schema'
import { BANNER_KINDS, PROBABILITY_MODEL } from './probability'
import type { PityGroup, ResolvedItem, ResolvedPool, ResolveOptions, WarpResult } from './types'
import { attempt, isIdentity, isObject, requireInput } from './validation'

function assertItem(item: ResolvedItem, path: string, rarity?: number, kind?: WarpItemKind): void {
  requireInput(isObject(item), 'invalid-pool', path)
  requireInput(
    (item.kind === 'avatar' || item.kind === 'light-cone') &&
      typeof item.id === 'string' &&
      new RegExp(`^${item.kind}:[1-9][0-9]*$`).test(item.id),
    'invalid-pool',
    `${path}/id`,
  )
  requireInput(
    [3, 4, 5].includes(item.rarity) &&
      (rarity === undefined || item.rarity === rarity) &&
      (kind === undefined || item.kind === kind),
    'invalid-pool',
    path,
    { reason: 'item-type-or-rarity' },
  )
}
function assertMembers(
  items: readonly ResolvedItem[],
  path: string,
  rarity: number,
  kind?: WarpItemKind,
  unique = true,
): void {
  requireInput(Array.isArray(items) && items.length > 0, 'invalid-pool', path, {
    reason: 'empty-candidates',
  })
  const ids = new Set<string>()
  for (const [i, item] of items.entries()) {
    assertItem(item, `${path}/${i}`, rarity, kind)
    requireInput(!unique || !ids.has(item.id), 'invalid-pool', `${path}/${i}`, {
      reason: 'duplicate-id',
      id: item.id,
    })
    ids.add(item.id)
  }
}

/** Validates even structurally constructed pools before any RNG is consumed. */
export function assertResolvedPool(pool: ResolvedPool): void {
  requireInput(isObject(pool), 'invalid-pool', '/pool')
  requireInput(
    isObject(pool.model) &&
      pool.model.id === PROBABILITY_MODEL.id &&
      pool.model.version === PROBABILITY_MODEL.version,
    'invalid-pool',
    '/pool/model',
  )
  requireInput(BANNER_KINDS.includes(pool.kind), 'invalid-pool', '/pool/kind')
  requireInput(
    typeof pool.gachaId === 'string' &&
      /^[1-9][0-9]*$/.test(pool.gachaId) &&
      pool.bannerId === `gacha:${pool.gachaId}`,
    'invalid-pool',
    '/pool/bannerId',
  )
  requireInput(pool.pityGroup === `pity:${pool.kind}`, 'invalid-pool', '/pool/pityGroup')
  requireInput(isIdentity(pool.sharedPoolId), 'invalid-pool', '/pool/sharedPoolId')
  assertMembers(pool.threeStar, '/pool/threeStar', 3, 'light-cone')
  assertMembers(pool.fourStar, '/pool/fourStar', 4)
  requireInput(Array.isArray(pool.up4), 'invalid-pool', '/pool/up4')
  if (pool.kind === 'ordinary') {
    requireInput(pool.up5 === undefined && pool.up4.length === 0, 'invalid-pool', '/pool', {
      reason: 'ordinary-up',
    })
    assertMembers(pool.fiveStar, '/pool/fiveStar', 5)
    requireInput(
      new Set(pool.fiveStar.map((item) => item.kind)).size === 2,
      'invalid-pool',
      '/pool/fiveStar',
      { reason: 'mixed-pool-required' },
    )
  } else {
    const kind = pool.kind.endsWith('avatar') ? 'avatar' : 'light-cone'
    requireInput(pool.up5 !== undefined, 'invalid-pool', '/pool/up5')
    assertItem(pool.up5, '/pool/up5', 5, kind)
    assertMembers(pool.fiveStar, '/pool/fiveStar', 5, kind, false)
    requireInput(
      pool.fiveStar.length === 8 && pool.fiveStar[0].id === pool.up5.id,
      'invalid-pool',
      '/pool/fiveStar',
      { reason: 'eight-slots-required' },
    )
    assertMembers(pool.fiveStar.slice(1), '/pool/fiveStar/selection', 5, kind)
    requireInput(
      kind !== 'light-cone' || !pool.fiveStar.slice(1).some((v) => v.id === pool.up5!.id),
      'invalid-pool',
      '/pool/fiveStar',
      { reason: 'fixed-cones-overlap-up' },
    )
    if (pool.kind.startsWith('event-')) {
      assertMembers(pool.up4, '/pool/up4', 4, kind)
      requireInput(pool.up4.length === 3, 'invalid-pool', '/pool/up4', { expected: 3 })
    } else {
      requireInput(pool.up4.length === 0, 'invalid-pool', '/pool/up4', {
        reason: 'fate-has-no-four-star-up',
      })
    }
  }
  const identities = new Map<string, number>()
  for (const item of [...pool.threeStar, ...pool.fourStar, ...pool.fiveStar, ...pool.up4]) {
    requireInput(
      !identities.has(item.id) || identities.get(item.id) === item.rarity,
      'invalid-pool',
      '/pool',
      { reason: 'conflicting-item', id: item.id },
    )
    identities.set(item.id, item.rarity)
  }
}

export function resolvePool(
  snapshot: WarpSnapshot,
  bannerId: string,
  options: ResolveOptions = {},
): WarpResult<ResolvedPool> {
  return attempt(() => {
    requireInput(
      isObject(snapshot) &&
        snapshot.schemaVersion === 1 &&
        Array.isArray(snapshot.items) &&
        Array.isArray(snapshot.banners) &&
        Array.isArray(snapshot.sharedPools),
      'invalid-snapshot',
      '/snapshot',
    )
    requireInput(isObject(options), 'invalid-selection', '/options')
    const items = new Map<string, ResolvedItem>()
    for (const [i, item] of snapshot.items.entries()) {
      const path = `/snapshot/items/${i}`
      assertItem(item, path)
      requireInput(!items.has(item.id), 'invalid-snapshot', path, {
        reason: 'duplicate-id',
        id: item.id,
      })
      items.set(item.id, Object.freeze({ id: item.id, kind: item.kind, rarity: item.rarity }))
    }
    const bannerIds = new Set<string>()
    for (const [i, banner] of snapshot.banners.entries()) {
      requireInput(
        isObject(banner) && isIdentity(banner.id) && !bannerIds.has(banner.id),
        'invalid-snapshot',
        `/snapshot/banners/${i}`,
      )
      bannerIds.add(banner.id)
    }
    const poolIds = new Set<string>()
    for (const [i, pool] of snapshot.sharedPools.entries()) {
      requireInput(
        isObject(pool) && isIdentity(pool.id) && !poolIds.has(pool.id),
        'invalid-snapshot',
        `/snapshot/sharedPools/${i}`,
      )
      poolIds.add(pool.id)
    }
    const banner = snapshot.banners.find((b) => b.id === bannerId)
    requireInput(banner !== undefined, 'unknown-banner', '/bannerId', { id: String(bannerId) })
    requireInput(BANNER_KINDS.includes(banner.kind), 'invalid-pool', '/banner/kind')
    const shared = snapshot.sharedPools.find((p) => p.id === banner.sharedPool)
    requireInput(shared !== undefined, 'unknown-pool', '/banner/sharedPool')
    const expectedType =
      banner.kind === 'ordinary'
        ? 'mixed'
        : banner.kind.endsWith('avatar')
          ? 'avatar'
          : 'light-cone'
    requireInput(shared.fiveStarType === expectedType, 'invalid-pool', '/sharedPool/fiveStarType')
    const itemFor = (id: string, path: string): ResolvedItem => {
      requireInput(typeof id === 'string' && items.has(id), 'unknown-item', path, {
        id: String(id),
      })
      return items.get(id)!
    }
    const members = (ids: readonly string[], path: string, rarity: number, kind?: WarpItemKind) => {
      requireInput(Array.isArray(ids), 'invalid-pool', path)
      const found = ids.map((id, i) => itemFor(id, `${path}/${i}`))
      assertMembers(found, path, rarity, kind)
      return found
    }
    const threeStar = members(shared.threeStar, '/sharedPool/threeStar', 3, 'light-cone')
    const fourStar = members(shared.fourStar, '/sharedPool/fourStar', 4)
    const eligible = members(
      shared.fiveStar,
      '/sharedPool/fiveStar',
      5,
      expectedType === 'mixed' ? undefined : expectedType,
    )
    let fiveStar = eligible
    let up5: ResolvedItem | undefined
    if (banner.kind !== 'ordinary') {
      up5 = itemFor(banner.up5!, '/banner/up5')
      if (expectedType === 'avatar') {
        requireInput(eligible.length >= 7, 'invalid-pool', '/sharedPool/fiveStar', {
          minimum: 7,
          actual: eligible.length,
        })
        const selected = options.selectedAvatarIds
        requireInput(
          Array.isArray(selected) && selected.length === 7 && new Set(selected).size === 7,
          'invalid-selection',
          '/options/selectedAvatarIds',
          { expected: 7 },
        )
        const allowed = new Set(eligible.map((v) => v.id))
        const chosen = selected.map((id, i) => {
          requireInput(allowed.has(id), 'invalid-selection', `/options/selectedAvatarIds/${i}`, {
            id: String(id),
          })
          return itemFor(id, `/options/selectedAvatarIds/${i}`)
        })
        fiveStar = [up5, ...chosen]
      } else {
        requireInput(
          options.selectedAvatarIds === undefined,
          'invalid-selection',
          '/options/selectedAvatarIds',
        )
        fiveStar = [up5, ...eligible]
      }
    } else {
      requireInput(
        banner.up5 === undefined && banner.up4 === undefined,
        'invalid-pool',
        '/banner',
        { reason: 'ordinary-up' },
      )
      requireInput(
        options.selectedAvatarIds === undefined,
        'invalid-selection',
        '/options/selectedAvatarIds',
      )
    }
    if (!banner.kind.startsWith('event-'))
      requireInput(banner.up4 === undefined, 'invalid-pool', '/banner/up4')
    const up4 = banner.kind.startsWith('event-')
      ? members(banner.up4!, '/banner/up4', 4, expectedType as WarpItemKind)
      : []
    const pool: ResolvedPool = Object.freeze({
      model: PROBABILITY_MODEL,
      bannerId: banner.id,
      gachaId: banner.gachaId,
      kind: banner.kind as WarpBannerKind,
      pityGroup: banner.pityGroup as PityGroup,
      sharedPoolId: shared.id,
      threeStar: Object.freeze(threeStar),
      fourStar: Object.freeze(fourStar),
      fiveStar: Object.freeze(fiveStar),
      up5,
      up4: Object.freeze(up4),
    })
    assertResolvedPool(pool)
    return pool
  })
}
