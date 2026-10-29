import { computed, isReactive, nextTick, ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import {
  HISTORY_LIMIT,
  HISTORY_PAGE_SIZE,
  useWarpSimulator,
} from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import {
  warpManifest,
  warpSnapshot,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import { createSessionState } from '../../../src/tools/warp-simulator/engine/state'
import { createPresentation, pityRows } from '../../../src/tools/warp-simulator/model/presentation'
import {
  fixture,
  kinds,
  scripted,
  seeded,
  selectedAvatarIds,
} from '../../fixtures/warp-simulator/fixture'
import type { ToolLocale } from '../../../src/locales/types'

type Simulator = ReturnType<typeof useWarpSimulator>
function choose(simulator: Simulator, ids = selectedAvatarIds) {
  expect(simulator.openSelection()).toBe(true)
  simulator.setSelectionDraft(ids)
  expect(simulator.selectionValid.value).toBe(true)
  expect(simulator.confirmSelection()).toBe(true)
}
describe('page-owned Warp session', () => {
  it('loads maintained Banners despite pending configuration, without selecting or consuming RNG', async () => {
    const rng = seeded(1),
      simulator = useWarpSimulator({ rng, storage: () => undefined })
    expect(warpManifest.configurationStatus).toBe(
      warpManifest.counts.pending || !warpSnapshot.banners.length ? 'incomplete' : 'complete',
    )
    expect(simulator.banners.map((v) => v.banner.id)).toEqual(warpSnapshot.banners.map((v) => v.id))
    expect(simulator.banners).toHaveLength(warpManifest.counts.readyBanners)
    expect(simulator.activeBanner.value?.requiresSelection).toBe(true)
    expect(simulator.selectedAvatarIds.value).toEqual([])
    expect(simulator.canPull.value).toBe(false)
    expect(await simulator.draw(10)).toBe(false)
    expect(rng.consumed).toBe(0)
    // A test-only witness; the page itself must never choose a default seven.
    choose(simulator, simulator.activeBanner.value!.eligibleAvatarIds.slice(0, 7))
    expect(simulator.canPull.value).toBe(true)
    expect(await simulator.draw(1)).toBe(true)
    expect(simulator.latestResults.value).toHaveLength(1)
  })
  it('uses an actual Math.random adapter by default', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99)
    try {
      const simulator = useWarpSimulator({ snapshot: fixture() })
      simulator.selectBanner('gacha:104')
      expect(await simulator.draw(1)).toBe(true)
      expect(random).toHaveBeenCalledTimes(3)
      expect(simulator.latestResults.value[0].event.rarity).toBe(3)
    } finally {
      random.mockRestore()
    }
  })
  it('offers only resolvable Banners and handles zero configured Banners', async () => {
    const snapshot = fixture()
    snapshot.banners[1].up4 = []
    snapshot.banners[3].sharedPool = 'missing'
    const simulator = useWarpSimulator({ snapshot })
    expect(simulator.banners.map((v) => v.banner.id)).toEqual([
      'gacha:100',
      'gacha:102',
      'gacha:104',
    ])
    expect(simulator.configurationDiagnostics).toHaveLength(2)
    const empty = useWarpSimulator({ snapshot: { ...fixture(), banners: [] } })
    expect(empty.activeBanner.value).toBeUndefined()
    expect(empty.pity.value).toBeUndefined()
    expect(empty.openSelection()).toBe(false)
    expect(empty.requestReset('group')).toBe(false)
    expect(await empty.draw(1)).toBe(false)
  })
  it.each(
    [
      [],
      selectedAvatarIds.slice(1),
      [...selectedAvatarIds, 'avatar:8'],
      ['avatar:1', ...selectedAvatarIds.slice(0, 6)],
      ['avatar:999', ...selectedAvatarIds.slice(1)],
      ['light-cone:1', ...selectedAvatarIds.slice(1)],
    ].map((ids) => ({ ids })),
  )('does not commit invalid selection $ids', ({ ids }) => {
    const simulator = useWarpSimulator({ snapshot: fixture() })
    const before = simulator.session.value
    simulator.openSelection()
    simulator.setSelectionDraft(ids)
    expect(simulator.selectionValid.value).toBe(false)
    expect(simulator.confirmSelection()).toBe(false)
    expect(simulator.selectedAvatarIds.value).toEqual([])
    expect(simulator.session.value).toBe(before)
  })
  it('accepts legal UP overlap, cancels drafts, and changes only future draws', async () => {
    const simulator = useWarpSimulator({ snapshot: fixture(), rng: scripted([0, 0.99, 0]) })
    choose(simulator)
    await simulator.draw(1)
    const state = simulator.session.value,
      pool = simulator.resolvedPool.value
    simulator.openSelection()
    simulator.setSelectionDraft(['avatar:9', ...selectedAvatarIds.slice(1)])
    expect(simulator.canPull.value).toBe(false)
    expect(simulator.openSelection()).toBe(false)
    simulator.cancelSelection()
    expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
    expect(simulator.resolvedPool.value).toBe(pool)
    choose(simulator, ['avatar:9', ...selectedAvatarIds.slice(1)])
    expect(simulator.session.value).toBe(state)
    const resolved = simulator.resolvedPool.value
    expect(resolved?.ok && resolved.value.fiveStar.filter((v) => v.id === 'avatar:9')).toHaveLength(
      2,
    )
  })
  it('returns one/ten actual events, newest-first history and chronological latest results', async () => {
    const rng = seeded(24302),
      simulator = useWarpSimulator({ snapshot: fixture(), rng })
    choose(simulator)
    expect(await simulator.draw(1)).toBe(true)
    expect(simulator.latestResults.value.map((v) => v.id)).toEqual([1])
    expect(await simulator.draw(10)).toBe(true)
    expect(simulator.latestResults.value.map((v) => v.id)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(simulator.session.value.history.map((v) => v.id)).toEqual([
      11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1,
    ])
    expect(new Set(simulator.latestResults.value.map((v) => v.batchId)).size).toBe(1)
    expect(isReactive(simulator.session.value.engine)).toBe(false)
    expect(Object.isFrozen(simulator.session.value)).toBe(true)
    expect(Object.isFrozen(simulator.session.value.history)).toBe(true)
    expect(simulator.announcement.value).toMatchObject({ key: 'warp.completed', count: 10 })
  })
  it('blocks reentry and other mutations through the current Vue update', async () => {
    const rng = seeded(3),
      simulator = useWarpSimulator({ snapshot: fixture(), rng })
    choose(simulator)
    const pending = simulator.draw(10),
      consumed = rng.consumed
    expect(simulator.busy.value).toBe(true)
    expect(simulator.canPull.value).toBe(false)
    const duplicate = simulator.draw(1)
    expect(simulator.selectBanner('gacha:104')).toBe(false)
    expect(simulator.openSelection()).toBe(false)
    expect(simulator.requestReset('all')).toBe(false)
    expect(simulator.confirmReset()).toBe(false)
    expect(rng.consumed).toBe(consumed)
    expect(await duplicate).toBe(false)
    expect(await pending).toBe(true)
    expect(simulator.busy.value).toBe(false)
    expect(simulator.session.value.history).toHaveLength(10)
  })
  it('inherits both guarantees and shares confirmed choices across same-group Banners', async () => {
    const snapshot = fixture()
    snapshot.banners.push({
      ...snapshot.banners[0],
      id: 'gacha:200',
      gachaId: '200',
      up5: 'avatar:8',
    })
    const simulator = useWarpSimulator({
      snapshot,
      rng: scripted([0, 0.99, 0.2, 0.99, 0, 0.99, 0.99, 0]),
    })
    choose(simulator)
    await simulator.draw(1)
    await simulator.draw(1)
    const pity = simulator.pity.value
    expect(pity).toMatchObject({ guaranteed5: true, guaranteed4: true })
    simulator.selectBanner('gacha:200')
    expect(simulator.pity.value).toBe(pity)
    expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
    choose(simulator, ['avatar:8', ...selectedAvatarIds.slice(1)])
    await simulator.draw(1)
    expect(simulator.latestResults.value[0].event).toMatchObject({
      bannerId: 'gacha:200',
      itemId: 'avatar:8',
      branch: 'guaranteed',
    })
    expect(simulator.pity.value).toMatchObject({ guaranteed5: false, guaranteed4: true })
    simulator.selectBanner('gacha:100')
    expect(simulator.selectedAvatarIds.value).toEqual(['avatar:8', ...selectedAvatarIds.slice(1)])
  })
  it('keeps all five groups independent and projects N/A guarantees', async () => {
    const simulator = useWarpSimulator({ snapshot: fixture(), rng: { next: () => 0.99 } })
    for (const [index, kind] of kinds.entries()) {
      simulator.selectBanner(`gacha:${100 + index}`)
      if (kind.endsWith('avatar')) choose(simulator)
      await simulator.draw(1)
      expect(simulator.pity.value).toMatchObject({ pullsSinceLast5: 1, pullsSinceLast4: 1 })
      const rows = pityRows(
        simulator.pity.value!,
        !!simulator.activeBanner.value!.banner.up5,
        !!simulator.activeBanner.value!.banner.up4?.length,
      )
      expect(rows[1].status).toBe(kind === 'ordinary' ? 'unavailable' : 'normal')
      expect(rows[3].status).toBe(kind.startsWith('event-') ? 'normal' : 'unavailable')
    }
    expect(
      Object.values(simulator.session.value.engine.groups).every((p) => p.pullsSinceLast5 === 1),
    ).toBe(true)
  })
  it('shows pending four-star pity rather than a fabricated exact count after five-star displacement', async () => {
    const values = [...Array.from({ length: 9 }, () => [0.99, 0.99, 0]).flat(), 0, 0, 0, 0]
    const simulator = useWarpSimulator({ snapshot: fixture(), rng: scripted(values) })
    choose(simulator)
    for (let i = 0; i < 11; i++) expect(await simulator.draw(1)).toBe(true)
    expect(simulator.pity.value!.pullsSinceLast4).toBe(9)
    expect(pityRows(simulator.pity.value!, true, true)[2]).toEqual({
      key: 'fourCount',
      count: 9,
      pending: true,
    })
    expect(simulator.session.value.history).toHaveLength(11)
  })
  it('keeps historical UP facts, state and RNG unchanged on language, source or display changes', async () => {
    const snapshot = fixture()
    snapshot.items.find((v) => v.id === 'avatar:9')!.names = {
      'zh-CN': '合成甲',
      en: 'Synthetic A',
    }
    snapshot.banners.push({
      ...snapshot.banners[0],
      id: 'gacha:200',
      gachaId: '200',
      up5: 'avatar:8',
    })
    const rng = scripted([0, 0.99, 0]),
      simulator = useWarpSimulator({ snapshot, rng })
    const presentation = createPresentation(snapshot),
      locale = ref<ToolLocale>('zh-CN')
    choose(simulator)
    await simulator.draw(1)
    const state = simulator.session.value,
      entry = state.history[0]
    const name = computed(() => presentation.item(entry.event.itemId, locale.value).name)
    expect(entry.event.isUp).toBe(true)
    expect(name.value).toBe('合成甲')
    simulator.selectBanner('gacha:200')
    locale.value = 'en'
    await nextTick()
    expect(name.value).toBe('Synthetic A')
    for (let i = 0; i < 5; i++) {
      expect(simulator.latestResults.value[0].event.isUp).toBe(true)
      expect(simulator.visibleHistory.value[0]).toBe(entry)
      presentation.search(selectedAvatarIds, 'avatar')
      simulator.setHistoryPage(0)
    }
    expect(simulator.session.value).toBe(state)
    expect(simulator.latestResults.value[0]).toBe(entry)
    expect(entry.event).toMatchObject({
      bannerId: 'gacha:100',
      isUp: true,
      model: { id: 'hsr-warp', version: 'v0.3' },
    })
    expect(rng.consumed).toBe(3)
  })
  it('implements explicit reset scopes, cancellation, retained choices and stable event IDs', async () => {
    const simulator = useWarpSimulator({ snapshot: fixture(), rng: { next: () => 0.99 } })
    choose(simulator)
    await simulator.draw(1)
    simulator.selectBanner('gacha:101')
    await simulator.draw(1)
    const state = simulator.session.value,
      latest = simulator.latestResults.value
    simulator.requestReset('group')
    simulator.cancelReset()
    expect(simulator.session.value).toBe(state)
    simulator.requestReset('group')
    expect(simulator.selectBanner('gacha:100')).toBe(false)
    expect(simulator.requestReset('all')).toBe(false)
    simulator.confirmReset()
    expect(simulator.pity.value).toEqual(createSessionState().groups['pity:event-light-cone'])
    expect(simulator.session.value.engine.groups['pity:event-avatar'].pullsSinceLast5).toBe(1)
    expect(simulator.session.value.history).toBe(state.history)
    expect(simulator.latestResults.value).toEqual(latest)
    simulator.requestReset('all')
    simulator.confirmReset()
    expect(simulator.session.value.engine).toEqual(createSessionState())
    expect(simulator.session.value.history).toEqual([])
    expect(simulator.latestResults.value).toEqual([])
    expect(simulator.selectedBannerId.value).toBe('gacha:101')
    simulator.selectBanner('gacha:100')
    expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
    await simulator.draw(1)
    expect(simulator.latestResults.value[0].id).toBe(3)
  })
  it('keeps the entire committed reference on RNG failure, including a late ten-pull failure', async () => {
    let fail = false
    const rng = {
      next() {
        if (fail) return NaN
        return 0.99
      },
    }
    const simulator = useWarpSimulator({ snapshot: fixture(), rng })
    simulator.selectBanner('gacha:104')
    await simulator.draw(1)
    let before = simulator.session.value
    fail = true
    expect(await simulator.draw(1)).toBe(false)
    expect(simulator.session.value).toBe(before)
    expect(simulator.diagnostic.value?.code).toBe('invalid-rng')
    const late = useWarpSimulator({
      snapshot: fixture(),
      rng: scripted([0.99, 0.99, 0, ...Array(27).fill(0.99), NaN]),
    })
    late.selectBanner('gacha:104')
    await late.draw(1)
    before = late.session.value
    expect(await late.draw(10)).toBe(false)
    expect(late.session.value).toBe(before)
    expect(late.latestResults.value).toHaveLength(1)
    expect(late.busy.value).toBe(false)
  })
  it('bounds history, paginates it, and never resets pity when discarding old entries', async () => {
    const simulator = useWarpSimulator({ snapshot: fixture(), rng: { next: () => 0.99 } })
    simulator.selectBanner('gacha:104')
    for (let i = 0; i < 100; i++) await simulator.draw(10)
    simulator.setHistoryPage(39)
    expect(simulator.visibleHistory.value).toHaveLength(HISTORY_PAGE_SIZE)
    expect(simulator.visibleHistory.value.at(-1)?.id).toBe(1)
    simulator.setHistoryPage(40)
    expect(simulator.historyPage.value).toBe(39)
    await simulator.draw(1)
    await simulator.draw(1)
    expect(simulator.historyPage.value).toBe(0)
    expect(simulator.session.value.history).toHaveLength(HISTORY_LIMIT)
    expect(simulator.session.value.history[0].id).toBe(1002)
    expect(simulator.session.value.history.at(-1)?.id).toBe(3)
    expect(simulator.pity.value!.pullsSinceLast5).toBe(12)
  })
  it('starts a fresh page instance with independent state and rejects unsupported actions', async () => {
    const first = useWarpSimulator({ snapshot: fixture(), rng: { next: () => 0.99 } })
    choose(first)
    await first.draw(1)
    const second = useWarpSimulator({ snapshot: fixture() })
    expect(second.session.value.engine).toEqual(createSessionState())
    expect(second.selectedAvatarIds.value).toEqual([])
    expect(second.session.value.history).toEqual([])
    expect(second.session.value).not.toBe(first.session.value)
    expect(first.selectBanner('unknown')).toBe(false)
    expect(first.requestReset('invalid' as never)).toBe(false)
    expect(await first.draw(2 as never)).toBe(false)
    expect(first.setSelectionDraft(selectedAvatarIds)).toBe(false)
  })
})
