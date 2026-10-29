<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { HButton, HModal } from 'astral-ui/components'
import 'astral-ui/scoped-theme.css'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { ItemPresentation } from '../model/presentation'
import WarpItemDetailsContent from './WarpItemDetailsContent.vue'
import WarpItemVisual from './WarpItemVisual.vue'
import WarpVisualIcon from './WarpVisualIcon.vue'

const props = defineProps<{
  entry?: HistoryEntry
  item?: ItemPresentation
  sourceLabel: string
  zIndex?: number
}>()
const emit = defineEmits<{ close: []; 'after-leave': [] }>()
const { t } = useI18n()
const open = ref(false)
// Retain outgoing content until HModal has completed its leave transition.
const selection = shallowRef<{ entry: HistoryEntry; item: ItemPresentation; sourceLabel: string }>()
watch(
  () => [props.entry, props.item, props.sourceLabel] as const,
  ([entry, item, sourceLabel]) => {
    if (entry && item) {
      selection.value = { entry, item, sourceLabel }
      open.value = true
    } else open.value = false
  },
  { immediate: true, flush: 'sync' },
)
function close() {
  if (!open.value) return
  open.value = false
  emit('close')
}
function afterLeave() {
  if (open.value) return
  selection.value = undefined
  emit('after-leave')
}
</script>

<template>
  <HModal
    :model-value="open"
    class="h-theme warp-item-dialog"
    :style="zIndex === undefined ? undefined : { zIndex }"
    :title="selection?.item.name ?? ''"
    :close-label="t('warp.details.close')"
    @update:model-value="
      (value) => {
        if (!value) close()
      }
    "
    @after-leave="afterLeave"
  >
    <template #illustration>
      <template v-if="selection">
        <div class="warp-details-avatar">
          <WarpItemVisual :item="selection.item" details />
        </div>
        <WarpVisualIcon
          class="warp-details-stars"
          :image="selection.item.cardStars"
          :reference-aspect-ratio="selection.item.cardStarsReferenceAspectRatio ?? 5"
          :label="t('warp.visual.rarity', { count: selection.entry.event.rarity })"
          stars
        />
        <span class="warp-details-kind">{{
          t(`warp.itemKind.${selection.item.kind ?? 'unknown'}`)
        }}</span>
      </template>
    </template>
    <WarpItemDetailsContent v-if="selection" v-bind="selection" />
    <template #footer>
      <HButton variant="secondary" icon="cross" icon-shape="round" @click="close">
        {{ t('warp.details.close') }}
      </HButton>
    </template>
  </HModal>
</template>

<style scoped>
.warp-details-avatar {
  width: 140px;
  max-width: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  overflow: hidden;
}
.warp-details-stars {
  --warp-stars-target-height: 20px;
  margin-top: 12px;
}
.warp-details-kind {
  color: var(--h-muted);
  margin-top: 6px;
  font-size: 12px;
}
</style>

<style>
/* Only the explicitly themed, teleported details backdrop. */
.warp-item-dialog {
  --color-muted: var(--h-muted);
}
.warp-item-dialog .h-modal__illustration {
  container-type: inline-size;
}
.warp-item-dialog .h-modal__title-row h2 {
  min-width: 0;
  overflow-wrap: anywhere;
}
.warp-item-dialog .h-close {
  flex-shrink: 0;
}
.warp-item-dialog .h-modal {
  max-height: min(86dvh, calc(100dvh - 32px));
}
@media (max-width: 600px) {
  .warp-item-dialog.h-modal-backdrop {
    padding: 16px;
  }
  .warp-item-dialog .h-modal__content--illustrated {
    grid-template-columns: minmax(0, 1fr);
  }
  .warp-item-dialog .h-modal__illustration {
    grid-column: 1;
    grid-row: 2;
    padding: 20px 24px 8px;
  }
  .warp-item-dialog .h-modal__content--illustrated .h-modal__body {
    grid-column: 1;
    grid-row: 3;
    padding: 16px 20px 24px;
  }
}
</style>
