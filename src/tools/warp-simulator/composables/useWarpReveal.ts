import { computed, onScopeDispose, readonly, ref, shallowRef, watch, type Ref } from 'vue'
import type { HistoryEntry } from './useWarpSimulator'

export type RevealPhase = 'idle' | 'identity' | 'artwork' | 'waiting' | 'overview' | 'leaving'
export const REVEAL_TIMING = { fade: 400, hold: 300, identity: 1100 } as const

/** Presentation gate over committed records. Never owns or mutates an engine session. */
export function useWarpReveal(reducedMotion: Readonly<Ref<boolean>>) {
  const phase = ref<RevealPhase>('idle')
  const visible = ref(false)
  const artworkReady = ref(false)
  const identityReady = ref(false)
  const pending = shallowRef<{ id: number; entries: readonly HistoryEntry[] }>()
  const queue = shallowRef<readonly HistoryEntry[]>([])
  const cursor = ref(0)
  const current = computed(() => queue.value[cursor.value])
  const locked = computed(() => !!pending.value)
  let timer: ReturnType<typeof setTimeout> | undefined
  let revision = 0
  let lastBatchId = 0
  let disposed = false
  let leavingOverview = false

  function clearTimer() {
    revision++
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }
  function later(callback: () => void, delay: number) {
    const token = revision
    timer = setTimeout(() => {
      if (disposed || token !== revision) return
      timer = undefined
      callback()
    }, delay)
  }
  function enter(next: RevealPhase) {
    clearTimer()
    const token = revision
    phase.value = next
    // A synchronous ready event can re-enter this stage (e.g. a cached placeholder).
    if (token !== revision || phase.value !== next) return
    if (next === 'identity' && identityReady.value)
      later(() => enter('artwork'), REVEAL_TIMING.identity)
    else if (next === 'artwork' && artworkReady.value) {
      if (reducedMotion.value) phase.value = 'waiting'
      else later(() => enter('waiting'), REVEAL_TIMING.fade)
    }
  }
  function showCurrent() {
    artworkReady.value = false
    identityReady.value = false
    enter(!reducedMotion.value && current.value?.event.rarity === 5 ? 'identity' : 'artwork')
  }
  function finishLeaving() {
    clearTimer()
    if (cursor.value + 1 < queue.value.length) {
      cursor.value++
      showCurrent()
    } else if (pending.value?.entries.length === 10 && !leavingOverview) {
      cursor.value = queue.value.length
      enter('overview')
    } else visible.value = false
  }
  function advance() {
    if (!visible.value || phase.value === 'leaving') return
    leavingOverview = phase.value === 'overview'
    enter('leaving')
    if (reducedMotion.value) finishLeaving()
    else later(finishLeaving, REVEAL_TIMING.fade)
  }
  function activate() {
    if (!visible.value) return
    if (phase.value === 'identity') enter('artwork')
    else if (phase.value === 'waiting') advance()
  }
  function markArtworkReady(batchId: number, entryId: number) {
    if (
      disposed ||
      !visible.value ||
      pending.value?.id !== batchId ||
      current.value?.id !== entryId ||
      phase.value === 'leaving' ||
      artworkReady.value
    )
      return false
    artworkReady.value = true
    if (phase.value === 'artwork') enter('artwork')
    return true
  }
  function markIdentityReady(batchId: number, entryId: number) {
    if (
      disposed ||
      !visible.value ||
      pending.value?.id !== batchId ||
      current.value?.id !== entryId ||
      phase.value === 'leaving' ||
      identityReady.value
    )
      return false
    identityReady.value = true
    if (phase.value === 'identity') enter('identity')
    return true
  }
  function reset() {
    identityReady.value = false
    artworkReady.value = false
    clearTimer()
    visible.value = false
    pending.value = undefined
    queue.value = []
    cursor.value = 0
    phase.value = 'idle'
    leavingOverview = false
  }
  function beginBatch(batchId: number, entries: readonly HistoryEntry[]) {
    if (
      disposed ||
      batchId <= lastBatchId ||
      !entries.length ||
      entries.some((entry) => entry.batchId !== batchId)
    )
      return false
    clearTimer()
    lastBatchId = batchId
    const batchEntries = Object.freeze([...entries])
    queue.value =
      batchEntries.length === 1
        ? batchEntries
        : batchEntries.filter((entry) => entry.event.rarity === 5)
    cursor.value = 0
    leavingOverview = false
    pending.value = { id: batchId, entries: batchEntries }
    visible.value = true
    if (!queue.value.length) enter('overview')
    else showCurrent()
    return true
  }
  function afterHide(batchId = pending.value?.id) {
    // A stale Dialog leave hook must not release a replacement batch.
    if (
      visible.value ||
      phase.value !== 'leaving' ||
      !pending.value ||
      pending.value.id !== batchId
    )
      return false
    clearTimer()
    pending.value = undefined
    queue.value = []
    phase.value = 'idle'
    return true
  }
  watch(
    reducedMotion,
    (enabled) => {
      if (!enabled || !visible.value) return
      if (phase.value === 'leaving') finishLeaving()
      else if (phase.value !== 'overview') enter('artwork')
    },
    { flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
    reset()
  })

  return {
    phase: readonly(phase),
    visible: readonly(visible),
    locked,
    current,
    batchId: computed(() => pending.value?.id),
    overviewEntries: computed(() => pending.value?.entries ?? []),
    identityReady: readonly(identityReady),
    markIdentityReady,
    artworkReady: readonly(artworkReady),
    markArtworkReady,
    beginBatch,
    activate,
    escape: advance,
    afterHide,
    reset,
  }
}
