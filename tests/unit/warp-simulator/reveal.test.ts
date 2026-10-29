import { effectScope, nextTick, ref, watch } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useWarpReveal,
  REVEAL_TIMING,
} from '../../../src/tools/warp-simulator/composables/useWarpReveal'
import { useWarpSimulator } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import type { HistoryEntry } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import { resultDisplayScenarios } from '../../fixtures/warp-simulator/result-display'
import { fixture, selectedAvatarIds } from '../../fixtures/warp-simulator/fixture'

const fixtures = resultDisplayScenarios()
const entries = (id: string) => fixtures.find((scenario) => scenario.id === id)!.entries
const scopes: ReturnType<typeof effectScope>[] = []
function setup(reduced = false, assetsReady = true) {
  const motion = ref(reduced)
  const scope = effectScope()
  scopes.push(scope)
  const reveal = scope.run(() => {
    const reveal = useWarpReveal(motion)
    if (assetsReady)
      watch([reveal.current, reveal.phase, reveal.batchId], () => ready(reveal), { flush: 'sync' })
    return reveal
  })!
  return { motion, scope, reveal }
}
function ready(reveal: ReturnType<typeof useWarpReveal>) {
  const entry = reveal.current.value
  if (entry) {
    reveal.markIdentityReady(entry.batchId, entry.id)
    reveal.markArtworkReady(entry.batchId, entry.id)
  }
}
function begin(reveal: ReturnType<typeof useWarpReveal>, batch: readonly HistoryEntry[]) {
  expect(reveal.beginBatch(batch[0]!.batchId, batch)).toBe(true)
  ready(reveal)
}
function endCurrent(reveal: ReturnType<typeof useWarpReveal>) {
  reveal.escape()
  vi.advanceTimersByTime(REVEAL_TIMING.fade)
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop())
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})

describe('Committed batch reveal state machine', () => {
  it.each(['single-light-cone-3', 'single-avatar-4', 'single-light-cone-4'])(
    'reveals %s and waits for confirmation',
    (id) => {
      const { reveal } = setup()
      begin(reveal, entries(id))
      expect(reveal.visible.value).toBe(true)
      expect(reveal.phase.value).toBe('artwork')
      reveal.activate()
      expect(reveal.phase.value).toBe('artwork')
      vi.advanceTimersByTime(400)
      expect(reveal.phase.value).toBe('waiting')
      vi.advanceTimersByTime(60_000)
      expect(reveal.phase.value).toBe('waiting')
      reveal.activate()
      expect(reveal.phase.value).toBe('leaving')
      vi.advanceTimersByTime(400)
      expect(reveal.visible.value).toBe(false)
      expect(reveal.locked.value).toBe(true)
      expect(reveal.afterHide()).toBe(true)
      expect(reveal.locked.value).toBe(false)
    },
  )

  it('plays the combined five-star identity then artwork without auto-dismissal', () => {
    const { reveal } = setup()
    begin(reveal, entries('single-avatar-5'))
    expect(reveal.phase.value).toBe('identity')
    vi.advanceTimersByTime(1099)
    expect(reveal.phase.value).toBe('identity')
    vi.advanceTimersByTime(1)
    expect(reveal.phase.value).toBe('artwork')
    vi.advanceTimersByTime(400)
    expect(reveal.phase.value).toBe('waiting')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['all-three', 'four-mixed'])(
    'opens %s directly in a locked complete overview without a timer',
    (id) => {
      const { reveal } = setup()
      begin(reveal, entries(id))
      expect(reveal.visible.value).toBe(true)
      expect(reveal.locked.value).toBe(true)
      expect(reveal.phase.value).toBe('overview')
      expect(reveal.overviewEntries.value).toEqual(entries(id))
      expect(reveal.current.value).toBeUndefined()
      reveal.activate()
      expect(reveal.phase.value).toBe('overview')
      expect(vi.getTimerCount()).toBe(0)
      endCurrent(reveal)
      expect(reveal.afterHide()).toBe(true)
    },
  )

  it.each(['ten-one-five', 'five-mixed'])(
    'reveals %s in original order before showing the complete batch',
    (id) => {
      const { reveal } = setup()
      const previous = entries('all-three')
      begin(reveal, previous)
      endCurrent(reveal)
      reveal.afterHide()
      const batch = entries(id)
      begin(reveal, batch)
      const expected = batch.filter((entry) => entry.event.rarity === 5)
      const seen: number[] = []
      for (const current of expected) {
        expect(reveal.current.value).toBe(current)
        seen.push(reveal.current.value!.id)
        vi.advanceTimersByTime(1500)
        reveal.activate()
        reveal.activate()
        vi.advanceTimersByTime(400)
      }
      expect(seen).toEqual(expected.map((entry) => entry.id))
      expect(reveal.phase.value).toBe('overview')
      expect(reveal.visible.value).toBe(true)
      expect(reveal.overviewEntries.value).toEqual(batch)
      expect(reveal.current.value).toBeUndefined()
      expect(reveal.locked.value).toBe(true)
      endCurrent(reveal)
      expect(reveal.visible.value).toBe(false)
      reveal.afterHide()
    },
  )

  it.each([0, 700])('clicking a prelude at %ims skips only to the current artwork', (delay) => {
    const { reveal } = setup()
    begin(reveal, entries('five-mixed'))
    const first = reveal.current.value
    vi.advanceTimersByTime(delay)
    reveal.activate()
    reveal.activate()
    expect(reveal.phase.value).toBe('artwork')
    expect(reveal.current.value).toBe(first)
    vi.advanceTimersByTime(399)
    reveal.activate()
    expect(reveal.current.value).toBe(first)
    vi.advanceTimersByTime(1)
    expect(reveal.phase.value).toBe('waiting')
    vi.advanceTimersByTime(10_000)
    expect(reveal.current.value).toBe(first)
  })

  it.each([0, 1100, 1200, 1500])(
    'Escape ends the current item at %ims, not the whole queue',
    (delay) => {
      const { reveal } = setup()
      begin(reveal, entries('five-mixed'))
      const expected = entries('five-mixed').filter((entry) => entry.event.rarity === 5)
      vi.advanceTimersByTime(delay)
      reveal.escape()
      reveal.escape()
      vi.advanceTimersByTime(400)
      expect(reveal.current.value).toBe(expected[1])
      expect(reveal.phase.value).toBe('identity')
      expect(reveal.visible.value).toBe(true)
    },
  )

  it('uses no animation timers with reduced motion, including runtime changes and leaving', () => {
    const { reveal, motion } = setup(true)
    begin(reveal, entries('five-mixed'))
    expect(reveal.phase.value).toBe('waiting')
    expect(vi.getTimerCount()).toBe(0)
    reveal.activate()
    expect(reveal.phase.value).toBe('waiting')
    motion.value = false
    reveal.escape()
    expect(reveal.phase.value).toBe('leaving')
    motion.value = true
    expect(reveal.phase.value).toBe('waiting')
    expect(vi.getTimerCount()).toBe(0)
    motion.value = false
    endCurrent(reveal)
    expect(reveal.phase.value).toBe('identity')
    motion.value = true
    expect(reveal.phase.value).toBe('waiting')
  })

  it('ignores duplicate/older batches and stale hide hooks after a replacement', () => {
    const { reveal } = setup()
    begin(reveal, entries('five-mixed'))
    expect(reveal.beginBatch(entries('five-mixed')[0]!.batchId, entries('five-mixed'))).toBe(false)
    expect(reveal.beginBatch(entries('all-three')[0]!.batchId, entries('all-three'))).toBe(false)
    endCurrent(reveal)
    begin(reveal, entries('single-avatar-5'))
    expect(reveal.afterHide()).toBe(false)
    vi.advanceTimersByTime(1100)
    expect(reveal.phase.value).toBe('artwork')
    expect(reveal.current.value).toBe(entries('single-avatar-5')[0])
  })

  it('clears timers and pending state on reset/disposal and rejects work after disposal', () => {
    const { reveal, scope } = setup()
    begin(reveal, entries('five-mixed'))
    reveal.reset()
    vi.advanceTimersByTime(20_000)
    expect(reveal.phase.value).toBe('idle')
    expect(reveal.locked.value).toBe(false)
    begin(reveal, entries('single-avatar-5'))
    scope.stop()
    vi.advanceTimersByTime(20_000)
    expect(reveal.visible.value).toBe(false)
    expect(reveal.current.value).toBeUndefined()
    expect(reveal.beginBatch(999, entries('single-avatar-5'))).toBe(false)
  })

  it('runs only after the atomic draw commit and never changes RNG, history or pity', async () => {
    const scope = effectScope()
    scopes.push(scope)
    const rng = {
      consumed: 0,
      next() {
        this.consumed++
        return 0
      },
    }
    const { simulator, reveal } = scope.run(() => {
      const simulator = useWarpSimulator({ snapshot: fixture(), rng })
      const reveal = useWarpReveal(ref(false))
      watch(
        () => simulator.session.value.latestBatchId,
        (id) => {
          if (id !== undefined) {
            expect(simulator.session.value.history).toHaveLength(10)
            reveal.beginBatch(id, simulator.latestResults.value)
          }
        },
        { flush: 'sync' },
      )
      return { simulator, reveal }
    })!
    simulator.openSelection()
    simulator.setSelectionDraft(selectedAvatarIds)
    simulator.confirmSelection()
    expect(await simulator.draw(10)).toBe(true)
    const committed = simulator.session.value
    expect(reveal.current.value).toBeDefined()
    const before = JSON.stringify(committed)
    const consumed = rng.consumed
    while (reveal.visible.value) endCurrent(reveal)
    reveal.afterHide()
    reveal.activate()
    await nextTick()
    expect(simulator.session.value).toBe(committed)
    expect(JSON.stringify(committed)).toBe(before)
    expect(rng.consumed).toBe(consumed)
  })
  it('waits for aggregated identity readiness and then artwork before enabling confirmation', () => {
    const { reveal } = setup(false, false)
    const batch = entries('single-avatar-5')
    reveal.beginBatch(batch[0]!.batchId, batch)
    vi.advanceTimersByTime(60_000)
    expect(reveal.phase.value).toBe('identity')
    expect(vi.getTimerCount()).toBe(0)
    reveal.markIdentityReady(batch[0]!.batchId, batch[0]!.id)
    vi.advanceTimersByTime(1100)
    expect(reveal.phase.value).toBe('artwork')
    reveal.activate()
    vi.advanceTimersByTime(60_000)
    expect(reveal.phase.value).toBe('artwork')
    reveal.markArtworkReady(batch[0]!.batchId, batch[0]!.id)
    vi.advanceTimersByTime(399)
    expect(reveal.phase.value).toBe('artwork')
    vi.advanceTimersByTime(1)
    expect(reveal.phase.value).toBe('waiting')
  })
  it('rejects stale readiness and can skip/escape while resources are pending', () => {
    const { reveal, scope } = setup(false, false)
    const first = entries('five-mixed')
    reveal.beginBatch(first[0]!.batchId, first)
    reveal.activate()
    expect(reveal.phase.value).toBe('artwork')
    endCurrent(reveal)
    expect(reveal.phase.value).toBe('identity')
    expect(reveal.markArtworkReady(first[0]!.batchId, first[0]!.id)).toBe(false)
    expect(reveal.markIdentityReady(first[0]!.batchId, first[0]!.id)).toBe(false)
    const current = reveal.current.value!
    scope.stop()
    expect(reveal.markArtworkReady(current.batchId, current.id)).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('uses no animation delay when reduced-motion artwork finally loads', () => {
    const { reveal } = setup(true, false)
    const batch = entries('single-avatar-5')
    reveal.beginBatch(batch[0]!.batchId, batch)
    expect(reveal.phase.value).toBe('artwork')
    expect(vi.getTimerCount()).toBe(0)
    reveal.markArtworkReady(batch[0]!.batchId, batch[0]!.id)
    expect(reveal.phase.value).toBe('waiting')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('never skips the overview when every five-star artwork is escaped before loading', () => {
    const { reveal } = setup(false, false)
    const batch = entries('five-mixed')
    begin(reveal, batch)
    for (const entry of batch.filter((e) => e.event.rarity === 5)) {
      expect(reveal.current.value).toBe(entry)
      endCurrent(reveal)
    }
    expect(reveal.phase.value).toBe('overview')
    expect(reveal.overviewEntries.value).toEqual(batch)
    expect(reveal.locked.value).toBe(true)
    expect(reveal.afterHide(batch[0]!.batchId)).toBe(false)
    reveal.activate()
    expect(reveal.phase.value).toBe('overview')
  })
  it('retains an overview when reduced motion changes and rejects a stale hide even after the replacement closes', () => {
    const { reveal, motion } = setup()
    const old = entries('all-three')
    begin(reveal, old)
    motion.value = true
    expect(reveal.phase.value).toBe('overview')
    const next = entries('single-avatar-5')
    begin(reveal, next)
    reveal.escape()
    expect(reveal.visible.value).toBe(false)
    expect(reveal.afterHide(old[0]!.batchId)).toBe(false)
    expect(reveal.locked.value).toBe(true)
    expect(reveal.afterHide(next[0]!.batchId)).toBe(true)
  })
})
