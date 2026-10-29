import { computed, readonly, ref, shallowRef } from 'vue'
import type { HistoryEntry } from './useWarpSimulator'

/** Read-only navigation over an existing batch, independent of the reveal state machine. */
export function useWarpReview() {
  const entries = shallowRef<readonly HistoryEntry[]>([])
  const visible = ref(false)
  const revision = ref(0)
  const batchId = computed(() => entries.value[0]?.batchId)
  const locked = computed(() => entries.value.length > 0)
  function open(batch: readonly HistoryEntry[], blocked = false) {
    if (
      blocked ||
      locked.value ||
      !batch.length ||
      batch.some((e) => e.batchId !== batch[0]!.batchId)
    )
      return false
    revision.value++
    entries.value = Object.freeze([...batch])
    visible.value = true
    return true
  }
  function close() {
    visible.value = false
  }
  function afterHide(id?: number, token?: number) {
    if (visible.value || !locked.value || id !== batchId.value || token !== revision.value)
      return false
    entries.value = []
    return true
  }
  return {
    revision: readonly(revision),
    entries: readonly(entries),
    visible: readonly(visible),
    batchId,
    locked,
    open,
    close,
    afterHide,
  }
}
