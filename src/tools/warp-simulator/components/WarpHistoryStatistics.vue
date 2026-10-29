<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HBadge } from 'astral-ui/components'
import type { ToolLocale } from '../../../locales/types'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { WarpBannerKind } from '../data/schema'
import type { PityGroup } from '../engine/types'
import { fiveStarHistory } from '../model/history-statistics'
import type { createPresentation } from '../model/presentation'
import WarpItemVisual from './WarpItemVisual.vue'

const props = defineProps<{
  history: readonly HistoryEntry[]
  group?: PityGroup
  kind?: WarpBannerKind
  presentation: ReturnType<typeof createPresentation>
}>()
const emit = defineEmits<{ details: [entry: HistoryEntry, triggerId: string] }>()
const { t, locale } = useI18n()
const rows = computed(() =>
  fiveStarHistory(props.history, props.group, props.kind).records.map((record) => ({
    ...record,
    item: props.presentation.item(record.entry.event.itemId, locale.value as ToolLocale),
  })),
)
</script>

<template>
  <section class="warp-statistics" :aria-label="t('warp.history.statistics')">
    <p class="warp-statistics-group">{{ kind ? t(`warp.kind.${kind}`) : t('warp.noBanners') }}</p>
    <p v-if="!rows.length" class="warp-statistics-empty">{{ t('warp.history.noFiveStars') }}</p>
    <ol v-else class="warp-statistics-list">
      <li
        v-for="{ entry, item, pulls, ratio, hue } in rows"
        :key="entry.id"
        class="warp-statistics-row"
      >
        <button
          :id="`warp-statistics-${entry.id}`"
          v-tooltip="item.name"
          type="button"
          class="warp-statistics-portrait"
          :aria-label="t('warp.details.open', { summary: item.name })"
          aria-haspopup="dialog"
          @click="emit('details', entry, `warp-statistics-${entry.id}`)"
        >
          <span aria-hidden="true"><WarpItemVisual :item="item" details /></span>
        </button>
        <span class="warp-statistics-track" aria-hidden="true">
          <span
            class="warp-statistics-bar"
            :style="{ width: `${ratio * 100}%`, backgroundColor: `hsl(${hue} 65% 40%)` }"
          />
        </span>
        <span class="warp-statistics-pulls">{{ t('warp.history.pulls', { count: pulls }) }}</span>
        <span class="warp-statistics-up"
          ><HBadge v-if="entry.event.isUp === true">{{ t('warp.up') }}</HBadge></span
        >
      </li>
    </ol>
  </section>
</template>

<style scoped>
.warp-statistics {
  --portrait-size: 48px;
  --pulls-width: 76px;
  --up-width: 36px;
  --row-gap: 12px;
  min-width: 0;
}
.warp-statistics-group {
  margin: 0 0 12px;
  font-weight: 500;
}
.warp-statistics-empty {
  color: var(--h-muted);
}
.warp-statistics-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}
.warp-statistics-row {
  display: grid;
  grid-template-columns: var(--portrait-size) minmax(0, 1fr) var(--pulls-width) var(--up-width);
  gap: var(--row-gap);
  align-items: center;
}
.warp-statistics-portrait {
  width: var(--portrait-size);
  height: var(--portrait-size);
  padding: 0;
  border: 1px solid #ac8b4f;
  border-radius: 4px;
  background: #6c542c;
}
.warp-statistics-portrait > span {
  display: block;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border-radius: inherit;
}
.warp-statistics-portrait :deep(.warp-detail-visual.warp-cone) {
  padding: 3px;
}
.warp-statistics-portrait :deep(.warp-visual-fallback) {
  color: #eee4ce;
}
.warp-statistics-track {
  display: block;
  min-width: 0;
  height: 16px;
  background: #30313909;
  border-radius: 2px;
}
.warp-statistics-bar {
  display: block;
  min-width: 3px;
  max-width: 100%;
  height: 100%;
  border-radius: inherit;
}
.warp-statistics-pulls {
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.warp-statistics-up {
  display: flex;
  justify-content: flex-end;
}
@media (max-width: 600px) {
  .warp-statistics {
    --portrait-size: 44px;
    --row-gap: 6px;
    --pulls-width: 60px;
    font-size: 12px;
  }
}
</style>
