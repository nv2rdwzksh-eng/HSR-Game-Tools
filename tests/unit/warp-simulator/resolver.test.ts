import { describe, expect, it } from 'vitest'
import { resolvePool } from '../../../src/tools/warp-simulator/engine/resolver'
import type { WarpSnapshot } from '../../../src/tools/warp-simulator/data/schema'
import {
  fixture,
  kinds,
  poolFor,
  selectedAvatarIds,
  unwrap,
} from '../../fixtures/warp-simulator/fixture'
import snapshot from '../../../src/tools/warp-simulator/data/runtime/snapshot.json'

describe('strict normalized pool resolution', () => {
  it.each(kinds)('resolves %s with explicit eligibility', (kind) => {
    const pool = poolFor(kind)
    expect(pool.kind).toBe(kind)
    expect(pool.pityGroup).toBe(`pity:${kind}`)
    expect(pool.fiveStar).toHaveLength(kind === 'ordinary' ? 3 : 8)
    expect(pool.up4).toHaveLength(kind.startsWith('event-') ? 3 : 0)
    expect(Object.isFrozen(pool)).toBe(true)
    expect(Object.isFrozen(pool.fiveStar)).toBe(true)
    expect(Object.isFrozen(pool.fiveStar[0])).toBe(true)
  })
  it('uses only the chosen seven out of a larger eligibility set and preserves UP overlap', () => {
    const data = fixture(),
      before = structuredClone(data)
    const selected = ['avatar:9', ...selectedAvatarIds.slice(1)]
    const pool = unwrap(resolvePool(data, 'gacha:100', { selectedAvatarIds: selected }))
    expect(pool.fiveStar.map((v) => v.id)).toEqual(['avatar:9', ...selected])
    expect(pool.fiveStar.filter((v) => v.id === 'avatar:9')).toHaveLength(2)
    expect(pool.fiveStar.some((v) => v.id === 'avatar:8')).toBe(false)
    expect(data).toEqual(before)
    data.items[8].id = 'avatar:999'
    selected[0] = 'avatar:999'
    expect(pool.fiveStar[0].id).toBe('avatar:9')
  })
  it.each([
    undefined,
    [],
    selectedAvatarIds.slice(1),
    [...selectedAvatarIds, 'avatar:8'],
    ['avatar:1', ...selectedAvatarIds.slice(0, 6)],
    ['avatar:999', ...selectedAvatarIds.slice(1)],
    ['light-cone:1', ...selectedAvatarIds.slice(1)],
  ])('rejects missing, duplicate or illegal selection %s', (selectedAvatarIds) => {
    const result = resolvePool(fixture(), 'gacha:100', { selectedAvatarIds })
    expect(result).toMatchObject({ ok: false, diagnostic: { code: 'invalid-selection' } })
  })
  it.each([
    [
      'unknown item',
      (s: WarpSnapshot) => {
        s.sharedPools[0].threeStar = ['light-cone:999']
      },
    ],
    [
      'empty candidates',
      (s: WarpSnapshot) => {
        s.sharedPools[0].fourStar = []
      },
    ],
    [
      'duplicate candidate',
      (s: WarpSnapshot) => {
        s.sharedPools[0].fiveStar.push('avatar:1')
      },
    ],
    [
      'wrong rarity',
      (s: WarpSnapshot) => {
        s.sharedPools[0].threeStar = ['light-cone:21']
      },
    ],
    [
      'wrong kind',
      (s: WarpSnapshot) => {
        s.sharedPools[0].fiveStar[0] = 'light-cone:1'
      },
    ],
    [
      'pool declaration',
      (s: WarpSnapshot) => {
        s.sharedPools[0].fiveStarType = 'mixed'
      },
    ],
    [
      'missing UP',
      (s: WarpSnapshot) => {
        delete s.banners[0].up5
      },
    ],
    [
      'UP type',
      (s: WarpSnapshot) => {
        s.banners[0].up5 = 'light-cone:1'
      },
    ],
    [
      'UP rarity',
      (s: WarpSnapshot) => {
        s.banners[0].up5 = 'avatar:21'
      },
    ],
    [
      'four-star count',
      (s: WarpSnapshot) => {
        s.banners[0].up4!.pop()
      },
    ],
    [
      'four-star duplicate',
      (s: WarpSnapshot) => {
        s.banners[0].up4 = ['avatar:21', 'avatar:21', 'avatar:23']
      },
    ],
    [
      'four-star kind',
      (s: WarpSnapshot) => {
        s.banners[0].up4![0] = 'light-cone:21'
      },
    ],
    [
      'group mismatch',
      (s: WarpSnapshot) => {
        s.banners[0].pityGroup = 'gacha:100'
      },
    ],
    [
      'Banner identity',
      (s: WarpSnapshot) => {
        s.banners[0].gachaId = '999'
      },
    ],
    [
      'unknown pool',
      (s: WarpSnapshot) => {
        s.banners[0].sharedPool = 'unknown'
      },
    ],
    [
      'duplicate item',
      (s: WarpSnapshot) => {
        s.items.push(structuredClone(s.items[0]))
      },
    ],
    [
      'duplicate Banner',
      (s: WarpSnapshot) => {
        s.banners.push(structuredClone(s.banners[0]))
      },
    ],
    [
      'duplicate pool',
      (s: WarpSnapshot) => {
        s.sharedPools.push(structuredClone(s.sharedPools[0]))
      },
    ],
  ] as const)('rejects %s without changing snapshot', (_, change) => {
    const data = fixture()
    change(data)
    const before = structuredClone(data)
    expect(resolvePool(data, 'gacha:100', { selectedAvatarIds }).ok).toBe(false)
    expect(data).toEqual(before)
  })
  it('rejects malformed runtime inputs with diagnostics', () => {
    for (const value of [null, {}, { schemaVersion: 2 }, { ...fixture(), items: [null] }])
      expect(resolvePool(value as never, 'gacha:100').ok).toBe(false)
    expect(resolvePool(fixture(), 'unknown')).toMatchObject({
      ok: false,
      diagnostic: { code: 'unknown-banner' },
    })
  })
  it.each(['event-avatar', 'fate-avatar'] as const)(
    'diagnoses too few eligible selections for %s',
    (kind) => {
      const data = fixture()
      data.sharedPools[0].fiveStar = selectedAvatarIds.slice(0, 6)
      expect(
        resolvePool(data, `gacha:${100 + kinds.indexOf(kind)}`, { selectedAvatarIds }),
      ).toMatchObject({
        ok: false,
        diagnostic: {
          code: 'invalid-pool',
          path: '/sharedPool/fiveStar',
          params: { minimum: 7, actual: 6 },
        },
      })
    },
  )
  it('rejects sparse catalog and candidate arrays explicitly', () => {
    const data = fixture()
    delete data.items[0]
    expect(resolvePool(data, 'gacha:100', { selectedAvatarIds }).ok).toBe(false)
    const candidates = fixture()
    delete candidates.sharedPools[0].fourStar[0]
    expect(resolvePool(candidates, 'gacha:100', { selectedAvatarIds }).ok).toBe(false)
  })
  it.each(['event-light-cone', 'fate-light-cone'] as const)(
    'requires seven distinct fixed cones for %s',
    (kind) => {
      for (const ids of [
        ['light-cone:1'],
        ['light-cone:8', ...Array.from({ length: 6 }, (_, i) => `light-cone:${i + 1}`)],
      ]) {
        const data = fixture()
        data.sharedPools[1].fiveStar = ids
        expect(resolvePool(data, `gacha:${100 + kinds.indexOf(kind)}`).ok).toBe(false)
      }
    },
  )
  it.each(['fate-avatar', 'fate-light-cone', 'ordinary'] as const)(
    'rejects four-star UP on %s',
    (kind) => {
      const data = fixture(),
        banner = data.banners[kinds.indexOf(kind)]
      banner.up4 = ['avatar:21', 'avatar:22', 'avatar:23']
      expect(
        resolvePool(data, banner.id, kind.endsWith('avatar') ? { selectedAvatarIds } : {}).ok,
      ).toBe(false)
    },
  )
  it('rejects Ordinary UP, incomplete mixed pool and irrelevant selections', () => {
    const data = fixture()
    data.banners[4].up5 = 'avatar:9'
    expect(resolvePool(data, 'gacha:104').ok).toBe(false)
    delete data.banners[4].up5
    data.sharedPools[2].fiveStar = ['avatar:1']
    expect(resolvePool(data, 'gacha:104').ok).toBe(false)
    for (const id of ['gacha:101', 'gacha:103', 'gacha:104'])
      expect(resolvePool(fixture(), id, { selectedAvatarIds }).ok).toBe(false)
  })
  it('resolves every maintained Banner with explicit avatar choices, preserving real data', () => {
    const data = snapshot as WarpSnapshot,
      before = structuredClone(data)
    for (const banner of data.banners) {
      const shared = data.sharedPools.find((pool) => pool.id === banner.sharedPool)!
      const requiresSelection = banner.kind.endsWith('avatar')
      if (requiresSelection)
        expect(resolvePool(data, banner.id)).toMatchObject({
          ok: false,
          diagnostic: { code: 'invalid-selection' },
        })
      // A test-only witness, separate from the full maintained eligibility list.
      const chosen = shared.fiveStar.slice(0, 7)
      const pool = unwrap(
        resolvePool(data, banner.id, requiresSelection ? { selectedAvatarIds: chosen } : {}),
      )
      expect(pool.up5?.id).toBe(banner.up5)
      expect(pool.threeStar.map((item) => item.id)).toEqual(shared.threeStar)
      expect(pool.fourStar.map((item) => item.id)).toEqual(shared.fourStar)
      expect(pool.up4.map((item) => item.id)).toEqual(banner.up4 ?? [])
      expect(pool.fiveStar.map((item) => item.id)).toEqual(
        banner.kind === 'ordinary'
          ? shared.fiveStar
          : [banner.up5, ...(requiresSelection ? chosen : shared.fiveStar)],
      )
    }
    expect(data).toEqual(before)
  })
})
