import { describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { fiveStarHistory } from '../../../src/tools/warp-simulator/model/history-statistics'
import {
  useWarpSimulator,
  type HistoryEntry,
} from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import { useWarpOverlay } from '../../../src/tools/warp-simulator/composables/useWarpOverlay'
import { createSessionState } from '../../../src/tools/warp-simulator/engine/state'
import {
  BANNER_KINDS,
  PROBABILITY_MODEL,
} from '../../../src/tools/warp-simulator/engine/probability'
import type { WarpBannerKind } from '../../../src/tools/warp-simulator/data/schema'
import { multiBannerFixture, scripted } from '../../fixtures/warp-simulator/fixture'

function entry(
  id: number,
  pulls: number,
  kind: WarpBannerKind = 'event-avatar',
  isUp: boolean | null = true,
): HistoryEntry {
  return {
    id,
    batchId: id,
    event: {
      model: PROBABILITY_MODEL,
      bannerId: `gacha:${id}`,
      pityGroup: `pity:${kind}`,
      itemId: 'avatar:9',
      rarity: 5,
      branch: 'direct',
      isUp,
      pityBefore: { ...createSessionState().groups[`pity:${kind}`], pullsSinceLast5: pulls - 1 },
    },
  }
}

describe('five-star retained-history projection', () => {
  it.each(BANNER_KINDS)('uses the engine classification and event counts for %s', (kind) => {
    const max = kind.endsWith('light-cone') ? 80 : 90
    const history = [entry(3, max, kind), entry(2, max / 2, kind), entry(1, 1, kind)]
    const result = fiveStarHistory(history, `pity:${kind}`, kind)
    expect(result.max).toBe(max)
    expect(result.records.map((r) => r.pulls)).toEqual([max, max / 2, 1])
    expect(result.records.map((r) => r.ratio)).toEqual([1, 0.5, 1 / max])
    expect(result.records[0]!.hue).toBe(0)
    expect(Math.abs(result.records[1]!.hue - 60)).toBeLessThan(1)
    expect(result.records[2]!.hue).toBe(120)
    expect(history[0]!.event.pityBefore.pullsSinceLast5).toBe(max - 1)
  })

  it('keeps repeated items and historical UP facts across banners, and isolates groups and rarities', () => {
    const history = [
      entry(5, 50),
      entry(4, 20, 'event-avatar', false),
      entry(3, 1, 'ordinary', null),
      entry(2, 80, 'event-light-cone'),
      { ...entry(1, 10), event: { ...entry(1, 10).event, rarity: 4 as const } },
    ]
    const result = fiveStarHistory(history, 'pity:event-avatar', 'event-avatar')
    expect(result.records.map((r) => r.entry.id)).toEqual([5, 4])
    expect(result.records.map((r) => r.entry.event.isUp)).toEqual([true, false])
    expect(new Set(result.records.map((r) => r.entry.event.itemId)).size).toBe(1)
    expect(
      fiveStarHistory(history, 'pity:ordinary', 'ordinary').records[0]!.entry.event.isUp,
    ).toBeNull()
    expect(fiveStarHistory([], 'pity:ordinary', 'ordinary').records).toEqual([])
    expect(fiveStarHistory(history.slice(-1), 'pity:event-avatar', 'event-avatar').records).toEqual(
      [],
    )
    expect(fiveStarHistory(history, undefined, undefined).records).toEqual([])
  })

  it('keeps completed records on a group reset and projects only the retained 1000 events', async () => {
    const simulator = useWarpSimulator({
      snapshot: multiBannerFixture(),
      rng: scripted([0, 0]),
      storage: () => undefined,
    })
    simulator.selectKind('ordinary')
    await simulator.draw(1)
    const before = fiveStarHistory(simulator.session.value.history, 'pity:ordinary', 'ordinary')
    expect(before.records).toHaveLength(1)
    simulator.requestReset('group')
    simulator.confirmReset()
    expect(fiveStarHistory(simulator.session.value.history, 'pity:ordinary', 'ordinary')).toEqual(
      before,
    )
    const retained = Array.from({ length: 1001 }, (_, index) => entry(1001 - index, 90)).slice(
      0,
      1000,
    )
    const result = fiveStarHistory(retained, 'pity:event-avatar', 'event-avatar')
    expect(result.records).toHaveLength(1000)
    expect(result.records.at(-1)!.entry.id).toBe(2)
    // A retained event's pity is authoritative even if earlier draws have been discarded.
    expect(result.records.at(-1)!.pulls).toBe(90)
  })
})

describe('serialized Warp overlay navigation', () => {
  it('waits for the correct panel leave, rejects duplicate navigation and restores its trigger', () => {
    const overlay = useWarpOverlay(),
      open = vi.fn()
    overlay.openPanel('history')
    expect(overlay.openDialog(open, 'warp-statistics-4', 'details')).toBe(true)
    expect(overlay.panel.value).toBeUndefined()
    expect(overlay.locked.value).toBe(true)
    expect(overlay.openDialog(open, 'warp-history-2', 'details')).toBe(false)
    expect(overlay.openPanel('controls')).toBe(false)
    overlay.afterPanelHide('controls')
    expect(open).not.toHaveBeenCalled()
    overlay.afterPanelHide('history')
    expect(open).toHaveBeenCalledOnce()
    overlay.afterPanelHide('history')
    overlay.afterDialogHide('selection')
    expect(overlay.locked.value).toBe(true)
    overlay.afterDialogHide('details')
    expect(overlay.panel.value).toBe('history')
    expect(overlay.takeFocus()).toBe('warp-statistics-4')
    expect(overlay.takeFocus()).toBeUndefined()
    overlay.afterDialogHide('details')
    expect(overlay.panel.value).toBe('history')
    overlay.closePanel()
    expect(overlay.afterPanelHide('history')).toBe('warp-history-trigger')
    expect(overlay.openPanel('history')).toBe(true)
  })

  it('queues panel replacement and clears pending actions on disposal', () => {
    const scope = effectScope(),
      overlay = scope.run(useWarpOverlay)!,
      open = vi.fn()
    overlay.openPanel('controls')
    overlay.openPanel('history')
    expect(overlay.panel.value).toBeUndefined()
    overlay.afterPanelHide('controls')
    expect(overlay.panel.value).toBe('history')
    overlay.openDialog(open, 'warp-history-1', 'details')
    scope.stop()
    overlay.afterPanelHide('history')
    expect(open).not.toHaveBeenCalled()
    expect(overlay.openPanel('history')).toBe(false)
  })
})
