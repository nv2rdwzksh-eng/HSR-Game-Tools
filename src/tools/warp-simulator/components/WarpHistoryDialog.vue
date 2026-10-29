<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { HModal, HPanel, HTabs, HTabPanels } from 'astral-ui/components'
import 'astral-ui/scoped-theme.css'
import { HISTORY_LIMIT, type HistoryEntry } from '../composables/useWarpSimulator'
import type { WarpBannerKind } from '../data/schema'
import type { PityGroup } from '../engine/types'
import type { createPresentation } from '../model/presentation'
import WarpHistory from './WarpHistory.vue'
import WarpHistoryStatistics from './WarpHistoryStatistics.vue'

const props = defineProps<{
  visible: boolean
  history: readonly HistoryEntry[]
  entries: readonly HistoryEntry[]
  page: number
  group?: PityGroup
  kind?: WarpBannerKind
  presentation: ReturnType<typeof createPresentation>
}>()
const emit = defineEmits<{
  close: []
  page: [page: number]
  details: [entry: HistoryEntry, triggerId: string]
  'after-leave': []
  'after-show': []
}>()
const { t } = useI18n()
type HistoryTab = 'statistics' | 'records'
const activeTab = ref<HistoryTab>('statistics')
const order = ['records', 'statistics']
const tabs = computed(() => order.map((value) => ({ value, label: t(`warp.history.${value}`) })))
const viewport = ref<HTMLElement>()
const scroll = { records: 0, statistics: 0 }
let revision = 0
let frame: number | undefined
let restoring = false
function cancelRestore() {
  revision++
  if (frame !== undefined) cancelAnimationFrame(frame)
  frame = undefined
  restoring = false
}
function saveScroll() {
  // Content replacement may clamp scrollTop before restoration; do not save that intermediate value.
  if (viewport.value && !restoring) scroll[activeTab.value] = viewport.value.scrollTop
}
async function restore(shown: boolean) {
  cancelRestore()
  restoring = true
  const current = revision
  // HModal sets its initial focus after two ticks. Restore navigation afterwards.
  await nextTick()
  await nextTick()
  await nextTick()
  if (current !== revision || !props.visible) return
  frame = requestAnimationFrame(() => {
    frame = undefined
    if (current !== revision || !props.visible) return
    if (viewport.value) viewport.value.scrollTop = scroll[activeTab.value]
    restoring = false
    if (shown) emit('after-show')
  })
}
function selectTab(value: string) {
  if (value !== 'records' && value !== 'statistics') return
  saveScroll()
  activeTab.value = value
  void restore(false)
}
function setPage(page: number) {
  scroll.records = 0
  if (viewport.value) viewport.value.scrollTop = 0
  emit('page', page)
}
function details(entry: HistoryEntry, triggerId: string) {
  saveScroll()
  emit('details', entry, triggerId)
}
watch(
  () => props.visible,
  (visible) => {
    if (visible) void restore(true)
    else {
      saveScroll()
      cancelRestore()
    }
  },
  { immediate: true, flush: 'sync' },
)
watch(
  () => props.group,
  () => {
    scroll.statistics = 0
    if (props.visible && activeTab.value === 'statistics') void restore(false)
  },
)
onBeforeUnmount(cancelRestore)
</script>

<template>
  <HModal
    id="warp-history-dialog"
    class="h-theme warp-history-dialog"
    :model-value="visible"
    :title="t('warp.history.title')"
    :close-label="t('warp.panels.closeHistory')"
    @update:model-value="
      (value) => {
        if (!value) emit('close')
      }
    "
    @after-leave="emit('after-leave')"
  >
    <HPanel class="warp-history-panel">
      <HTabs
        :model-value="activeTab"
        :items="tabs"
        :label="t('warp.history.title')"
        id-prefix="warp-history-view"
        variant="pill"
        @update:model-value="selectTab"
      />
      <p class="warp-history-limit">{{ t('warp.history.limit', { count: HISTORY_LIMIT }) }}</p>
      <div ref="viewport" class="warp-history-viewport" @scroll="saveScroll">
        <HTabPanels
          :value="activeTab"
          :order="order"
          :animated="false"
          :animate-height="false"
          id-prefix="warp-history-view"
        >
          <template #default="{ value }">
            <WarpHistory
              v-if="value === 'records'"
              :entries="entries"
              :total="history.length"
              :page="page"
              :presentation="presentation"
              @page="setPage"
              @details="(entry) => details(entry, `warp-history-${entry.id}`)"
            />
            <WarpHistoryStatistics
              v-else
              :history="history"
              :group="group"
              :kind="kind"
              :presentation="presentation"
              @details="details"
            />
          </template>
        </HTabPanels>
      </div>
    </HPanel>
  </HModal>
</template>

<style>
/* Teleported modal: all overrides are limited to this feature's light surface. */
.warp-history-dialog {
  --color-muted: var(--h-muted);
}
.warp-history-dialog .h-modal-shell {
  width: 960px;
}
.warp-history-dialog .h-modal {
  height: min(86dvh, calc(100dvh - 48px));
}
.warp-history-dialog .h-modal__content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}
.warp-history-dialog .h-modal__header {
  flex-shrink: 0;
}
.warp-history-dialog .h-modal__body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.warp-history-dialog .warp-history-panel {
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  box-shadow: none;
  border: 0;
  background: transparent;
}
.warp-history-dialog .h-panel__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
}
.warp-history-dialog .h-tabs {
  align-self: center;
  flex-shrink: 0;
  max-width: 100%;
}
.warp-history-dialog .warp-history-limit {
  flex-shrink: 0;
  margin: 10px 0 12px;
  color: var(--h-muted);
  font-size: 12px;
  line-height: 1.6;
}
.warp-history-dialog .warp-history-viewport {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow: auto;
  overscroll-behavior: contain;
  padding: 4px 6px 6px;
}
.warp-history-dialog .h-close {
  flex-shrink: 0;
}
@media (max-width: 600px) {
  .warp-history-dialog.h-modal-backdrop {
    padding: 16px;
  }
  .warp-history-dialog .h-modal {
    height: min(86dvh, calc(100dvh - 32px));
  }
  .warp-history-dialog .h-modal__header {
    padding: 16px 16px 0;
  }
  .warp-history-dialog .h-modal__body {
    padding: 12px 10px 16px;
  }
}
</style>
