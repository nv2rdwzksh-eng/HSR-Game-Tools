import { onScopeDispose, watch } from 'vue'

// CSS presentation size, independent of source pixels and device pixel ratio.
export const IDENTITY_PATH_MAX_SIZE = 160
export const IDENTITY_PATH_FRACTION = 0.57

// V3's default playback rate is 2: these are the actual on-screen milliseconds.
export const IDENTITY_EMBLEM = { delay: 25, duration: 287.5 } as const
export const IDENTITY_STARS = [
  { id: 1, left: 17.5, width: 14.5, delay: 260, duration: 175 },
  { id: 2, left: 30.1, width: 14.5, delay: 375, duration: 175 },
  { id: 3, left: 50, width: 34, delay: 505, duration: 237.5 },
  { id: 4, left: 69.9, width: 14.5, delay: 375, duration: 175 },
  { id: 5, left: 82.5, width: 14.5, delay: 260, duration: 175 },
] as const

/** Only aggregates image readiness; useWarpReveal owns every stage and timer. */
export function useWarpIdentityReady(
  identity: () => readonly [batchId: number, entryId: number],
  ready: (batchId: number, entryId: number) => void,
) {
  const parts = new Set<string | number>()
  let emitted = false
  let disposed = false
  watch(
    identity,
    () => {
      parts.clear()
      emitted = false
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
  })
  return (part: 'path' | number, batchId: number, entryId: number) => {
    const current = identity()
    if (
      disposed ||
      emitted ||
      current[0] !== batchId ||
      current[1] !== entryId ||
      (part !== 'path' && !IDENTITY_STARS.some((star) => star.id === part))
    )
      return
    parts.add(part)
    if (parts.size === 6) {
      emitted = true
      ready(batchId, entryId)
    }
  }
}
