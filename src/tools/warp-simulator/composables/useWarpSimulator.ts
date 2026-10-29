import { computed, nextTick, ref, shallowReadonly, shallowRef } from 'vue'
import { warpSnapshot } from '../data/adapters/warp-data'
import type { WarpBannerKind, WarpSnapshot } from '../data/schema'
import { pullOnce, pullTen } from '../engine/gacha'
import { resolvePool } from '../engine/resolver'
import { createSessionState } from '../engine/state'
import type { PullEvent, Rng, SessionState, WarpDiagnostic } from '../engine/types'
import { availableBanners } from '../model/catalog'
import {
  createAffinityPersistence,
  type AffinityStorageSource,
  type AffinityStorageNotice,
} from '../model/affinity-persistence'

export const HISTORY_LIMIT = 1000
export const HISTORY_PAGE_SIZE = 25
export interface HistoryEntry {
  readonly id: number
  readonly batchId: number
  readonly event: PullEvent
}
export interface WarpPageSession {
  readonly engine: SessionState
  readonly history: readonly HistoryEntry[]
  readonly latestBatchId?: number
}
export function useWarpSimulator(
  options: { snapshot?: WarpSnapshot; rng?: Rng; storage?: AffinityStorageSource } = {},
) {
  const snapshot = options.snapshot ?? warpSnapshot
  const rng = options.rng ?? { next: () => Math.random() }
  const catalog = availableBanners(snapshot)
  const selectedBannerId = ref(catalog.groups[0]?.banners[0]?.banner.id)
  const rememberedBanners = new Map<WarpBannerKind, string>()
  const persistence = createAffinityPersistence(
    (ids) =>
      catalog.banners.some(
        ({ banner, requiresSelection }) =>
          requiresSelection && resolvePool(snapshot, banner.id, { selectedAvatarIds: ids }).ok,
      ),
    options.storage,
  )
  const restored = persistence.restore()
  const sharedSelection = shallowRef(restored.selectedAvatarIds)
  const storageNotice = shallowRef<AffinityStorageNotice | undefined>(restored.notice)
  const session = shallowRef<WarpPageSession>(
    Object.freeze({ engine: createSessionState(), history: Object.freeze([]) }),
  )
  const busy = ref(false),
    diagnostic = shallowRef<WarpDiagnostic>()
  const historyPage = ref(0)
  const selectionOpen = ref(false),
    selectionDraft = ref<string[]>([])
  const resetScope = ref<'group' | 'all'>()
  const announcement = shallowRef<{ key: string; count?: number; batchId?: number }>()
  let sequence = 0,
    batch = 0
  const activeBanner = computed(() =>
    catalog.banners.find((entry) => entry.banner.id === selectedBannerId.value),
  )
  const activeKind = computed(() => activeBanner.value?.banner.kind)
  const kindBanners = computed(
    () => catalog.groups.find((group) => group.kind === activeKind.value)?.banners ?? [],
  )
  const selectedAvatarIds = computed(() => sharedSelection.value)
  const resolve = (ids: readonly string[]) =>
    resolvePool(
      snapshot,
      selectedBannerId.value ?? '',
      activeBanner.value?.requiresSelection ? { selectedAvatarIds: ids } : {},
    )
  const resolvedPool = computed(() =>
    activeBanner.value ? resolve(selectedAvatarIds.value) : undefined,
  )
  const selectionIssue = computed(() => {
    if (!activeBanner.value?.requiresSelection || resolvedPool.value?.ok) return undefined
    return selectedAvatarIds.value.length === 7 ? 'incompatible' : 'required'
  })
  const draftResolution = computed(() =>
    activeBanner.value?.requiresSelection ? resolve(selectionDraft.value) : undefined,
  )
  const selectionValid = computed(() => draftResolution.value?.ok === true)
  const canPull = computed(
    () =>
      !busy.value && !selectionOpen.value && !resetScope.value && resolvedPool.value?.ok === true,
  )
  const pity = computed(() =>
    activeBanner.value ? session.value.engine.groups[activeBanner.value.pityGroup] : undefined,
  )
  const latestResults = computed(() =>
    session.value.history
      .filter((entry) => entry.batchId === session.value.latestBatchId)
      .reverse(),
  )
  const visibleHistory = computed(() =>
    session.value.history.slice(
      historyPage.value * HISTORY_PAGE_SIZE,
      (historyPage.value + 1) * HISTORY_PAGE_SIZE,
    ),
  )

  function selectBanner(id: string) {
    if (
      busy.value ||
      selectionOpen.value ||
      resetScope.value ||
      !catalog.banners.some((v) => v.banner.id === id)
    )
      return false
    selectedBannerId.value = id
    rememberedBanners.set(activeBanner.value!.banner.kind, id)
    diagnostic.value = undefined
    return true
  }
  function selectKind(kind: WarpBannerKind) {
    const group = catalog.groups.find((entry) => entry.kind === kind)
    if (!group) return false
    const remembered = rememberedBanners.get(kind)
    return selectBanner(
      group.banners.find((entry) => entry.banner.id === remembered)?.banner.id ??
        group.banners[0]!.banner.id,
    )
  }
  function openSelection() {
    if (
      busy.value ||
      selectionOpen.value ||
      resetScope.value ||
      !activeBanner.value?.requiresSelection
    )
      return false
    selectionDraft.value = [...selectedAvatarIds.value]
    selectionOpen.value = true
    return true
  }
  function setSelectionDraft(ids: readonly string[]) {
    if (busy.value || !selectionOpen.value) return false
    selectionDraft.value = [...ids]
    return true
  }
  function cancelSelection() {
    if (busy.value) return false
    selectionOpen.value = false
    selectionDraft.value = []
    return true
  }
  function confirmSelection() {
    if (busy.value || !selectionOpen.value || !selectionValid.value || !selectedBannerId.value)
      return false
    sharedSelection.value = Object.freeze([...selectionDraft.value])
    storageNotice.value = persistence.save(sharedSelection.value)
    diagnostic.value = undefined
    cancelSelection()
    return true
  }
  async function draw(count: 1 | 10) {
    if ((count !== 1 && count !== 10) || !canPull.value) return false
    const pool = resolvedPool.value
    if (!pool?.ok) return false
    busy.value = true
    try {
      const result =
        count === 1
          ? pullOnce(pool.value, session.value.engine, rng)
          : pullTen(pool.value, session.value.engine, rng)
      if (!result.ok) {
        diagnostic.value = result.diagnostic
        return false
      }
      const events = 'event' in result.value ? [result.value.event] : result.value.events
      const batchId = ++batch
      const entries = events.map((event) => Object.freeze({ id: ++sequence, batchId, event }))
      session.value = Object.freeze({
        engine: result.value.nextState,
        history: Object.freeze(
          [...entries.reverse(), ...session.value.history].slice(0, HISTORY_LIMIT),
        ),
        latestBatchId: batchId,
      })
      historyPage.value = 0
      diagnostic.value = undefined
      announcement.value = { key: 'warp.completed', count: events.length, batchId }
      return true
    } finally {
      await nextTick()
      busy.value = false
    }
  }
  function requestReset(scope: 'group' | 'all') {
    if (
      (scope !== 'group' && scope !== 'all') ||
      busy.value ||
      selectionOpen.value ||
      resetScope.value ||
      (scope === 'group' && !activeBanner.value)
    )
      return false
    resetScope.value = scope
    return true
  }
  function cancelReset() {
    if (!busy.value) resetScope.value = undefined
  }
  function confirmReset() {
    if (busy.value || !resetScope.value) return false
    const fresh = createSessionState()
    if (resetScope.value === 'all') {
      session.value = Object.freeze({ engine: fresh, history: Object.freeze([]) })
      historyPage.value = 0
    } else {
      const group = activeBanner.value!.pityGroup
      session.value = Object.freeze({
        ...session.value,
        engine: Object.freeze({
          model: fresh.model,
          groups: Object.freeze({ ...session.value.engine.groups, [group]: fresh.groups[group] }),
        }),
      })
    }
    announcement.value = {
      key: resetScope.value === 'all' ? 'warp.reset.allDone' : 'warp.reset.groupDone',
    }
    diagnostic.value = undefined
    resetScope.value = undefined
    return true
  }
  function setHistoryPage(page: number) {
    if (
      Number.isSafeInteger(page) &&
      page >= 0 &&
      page <= Math.floor(Math.max(0, session.value.history.length - 1) / HISTORY_PAGE_SIZE)
    )
      historyPage.value = page
  }
  return {
    banners: catalog.banners,
    bannerGroups: catalog.groups,
    activeKind,
    kindBanners,
    configurationDiagnostics: catalog.diagnostics,
    session: shallowReadonly(session),
    selectedBannerId: shallowReadonly(selectedBannerId),
    activeBanner,
    selectedAvatarIds,
    selectionIssue,
    storageNotice: shallowReadonly(storageNotice),
    selectionDraft: shallowReadonly(selectionDraft),
    selectionOpen: shallowReadonly(selectionOpen),
    selectionValid,
    draftResolution,
    resolvedPool,
    pity,
    latestResults,
    visibleHistory,
    historyPage: shallowReadonly(historyPage),
    busy: shallowReadonly(busy),
    diagnostic: shallowReadonly(diagnostic),
    resetScope: shallowReadonly(resetScope),
    announcement: shallowReadonly(announcement),
    canPull,
    selectBanner,
    selectKind,
    openSelection,
    setSelectionDraft,
    cancelSelection,
    confirmSelection,
    draw,
    requestReset,
    cancelReset,
    confirmReset,
    setHistoryPage,
  }
}
