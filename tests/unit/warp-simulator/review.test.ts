import { effectScope } from 'vue'
import { describe, expect, it } from 'vitest'
import { useWarpReview } from '../../../src/tools/warp-simulator/composables/useWarpReview'
import { useWarpSimulator } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import { fixture, selectedAvatarIds, seeded } from '../../fixtures/warp-simulator/fixture'

describe('Read-only latest batch review', () => {
  it.each([1, 10] as const)(
    'reviews %i records after a banner change without consuming RNG or mutating the session',
    async (count) => {
      const scope = effectScope(),
        rng = seeded(2026)
      try {
        const { simulator, review } = scope.run(() => ({
          simulator: useWarpSimulator({ snapshot: fixture(), rng, storage: () => undefined }),
          review: useWarpReview(),
        }))!
        expect(review.open([])).toBe(false)
        simulator.openSelection()
        simulator.setSelectionDraft(selectedAvatarIds)
        simulator.confirmSelection()
        await simulator.draw(count)
        const batch = simulator.latestResults.value
        simulator.selectKind('event-light-cone')
        const session = simulator.session.value,
          bytes = JSON.stringify(session),
          consumed = rng.consumed
        expect(review.open(batch, true)).toBe(false)
        expect(review.open(batch)).toBe(true)
        expect(review.open(batch)).toBe(false)
        expect(review.entries.value).toEqual(batch)
        expect(review.entries.value).not.toBe(batch)
        expect(Object.isFrozen(review.entries.value)).toBe(true)
        expect(review.entries.value.every((e) => e.event.bannerId === 'gacha:100')).toBe(true)
        const firstRevision = review.revision.value
        expect(review.afterHide(batch[0]!.batchId, firstRevision)).toBe(false)
        review.close()
        expect(review.open(batch)).toBe(false)
        expect(review.afterHide(-1, firstRevision)).toBe(false)
        expect(review.afterHide(batch[0]!.batchId, firstRevision)).toBe(true)
        expect(review.locked.value).toBe(false)
        expect(review.open(batch)).toBe(true)
        review.close()
        expect(review.afterHide(batch[0]!.batchId, firstRevision)).toBe(false)
        expect(review.afterHide(batch[0]!.batchId, review.revision.value)).toBe(true)
        expect(simulator.session.value).toBe(session)
        expect(JSON.stringify(session)).toBe(bytes)
        expect(rng.consumed).toBe(consumed)
        simulator.requestReset('all')
        simulator.confirmReset()
        expect(review.open(simulator.latestResults.value)).toBe(false)
        await simulator.draw(1)
        const next = simulator.latestResults.value
        expect(review.open(next)).toBe(true)
        review.close()
        expect(review.afterHide(batch[0]!.batchId, firstRevision)).toBe(false)
        expect(review.entries.value).toEqual(next)
      } finally {
        scope.stop()
      }
    },
  )
})
