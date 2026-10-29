<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HButton } from 'astral-ui/components'
import 'astral-ui/scoped-theme.css'
import WarpVisualIcon from './WarpVisualIcon.vue'
import { ChevronLeft, ChevronRight } from '@lucide/vue'
import type { ToolLocale } from '../../../locales/types'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import { HISTORY_PAGE_SIZE } from '../composables/useWarpSimulator'
import type { createPresentation } from '../model/presentation'
const props = defineProps<{
  entries: readonly HistoryEntry[]
  total: number
  page: number
  presentation: ReturnType<typeof createPresentation>
}>()
const emit = defineEmits<{ page: [page: number]; details: [entry: HistoryEntry] }>()
const { t, locale } = useI18n()
const rows = computed(() =>
  props.entries.map((entry) => ({
    entry,
    item: props.presentation.item(entry.event.itemId, locale.value as ToolLocale),
  })),
)
</script>

<template>
  <section :aria-label="t('warp.history.records')" class="warp-history">
    <header class="warp-history-heading">
      <span>{{ t('warp.history.count', { count: total }) }}</span>
    </header>
    <p v-if="!total" class="warp-history-empty">{{ t('warp.history.empty') }}</p>
    <div
      v-else
      class="warp-history-scroll"
      role="region"
      :aria-label="t('warp.history.title')"
      tabindex="0"
    >
      <table class="warp-history-table">
        <thead>
          <tr>
            <th scope="col">{{ t('warp.history.name') }}</th>
            <th scope="col">{{ t('warp.history.kind') }}</th>
            <th scope="col">{{ t('warp.history.rarity') }}</th>
            <th scope="col">{{ t('warp.visual.path') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ entry, item } in rows" :key="entry.id">
            <td>
              <button
                :id="`warp-history-${entry.id}`"
                v-tooltip="item.name"
                type="button"
                class="warp-history-name"
                :style="{ color: `var(--warp-history-rarity-${entry.event.rarity})` }"
                :aria-label="t('warp.details.open', { summary: item.name })"
                aria-haspopup="dialog"
                @click="emit('details', entry)"
              >
                {{ item.name }}
              </button>
            </td>
            <td>{{ t(`warp.itemKind.${item.kind ?? 'unknown'}`) }}</td>
            <td>
              <WarpVisualIcon
                :url="item.starsUrl"
                :label="t('warp.visual.rarity', { count: entry.event.rarity })"
                stars
              />
            </td>
            <td>
              <span class="warp-history-meta"
                ><WarpVisualIcon
                  :url="item.pathIconUrl"
                  :label="item.pathName ?? t('warp.visual.unknown')"
                />{{ item.pathName ?? t('warp.visual.unknown') }}</span
              >
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <nav
      v-if="total > HISTORY_PAGE_SIZE"
      class="warp-history-pagination"
      :aria-label="t('warp.history.pagination')"
    >
      <HButton
        class="warp-history-page-button"
        variant="ghost"
        v-tooltip="t('warp.history.previous')"
        :aria-label="t('warp.history.previous')"
        :disabled="page === 0"
        @click="emit('page', page - 1)"
        ><ChevronLeft :size="16" aria-hidden="true"
      /></HButton>
      <span>{{
        t('warp.history.page', { current: page + 1, total: Math.ceil(total / HISTORY_PAGE_SIZE) })
      }}</span>
      <HButton
        class="warp-history-page-button"
        variant="ghost"
        v-tooltip="t('warp.history.next')"
        :aria-label="t('warp.history.next')"
        :disabled="(page + 1) * HISTORY_PAGE_SIZE >= total"
        @click="emit('page', page + 1)"
        ><ChevronRight :size="16" aria-hidden="true"
      /></HButton>
    </nav>
  </section>
</template>

<style scoped>
.warp-history {
  --warp-history-rarity-3: #245b91;
  --warp-history-rarity-4: #73429b;
  --warp-history-rarity-5: #805b1e;
  min-width: 0;
}
.warp-history-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.warp-history-heading > span,
.warp-history-empty {
  font-size: 12px;
  color: var(--h-muted);
}
.warp-history-scroll {
  overflow-x: auto;
}
.warp-history-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  text-align: left;
  font-size: 14px;
  line-height: 1.6;
  background: transparent;
}
th,
td {
  padding: 12px 10px;
  vertical-align: middle;
  overflow-wrap: anywhere;
  border-bottom: 1px solid var(--h-line);
}
th {
  font-weight: 500;
  color: var(--h-muted);
}
th:first-child {
  width: auto;
}
th:nth-child(2) {
  width: 90px;
}
th:nth-child(3) {
  width: 92px;
}
th:nth-child(4) {
  width: 136px;
}
.warp-history-name {
  display: block;
  width: 100%;
  overflow-wrap: anywhere;
  text-align: left;
  padding: 4px 0;
  background: transparent;
  border: 0;
  font: inherit;
  border-radius: 3px;
}
.warp-history-name:hover,
.warp-history-name:focus-visible {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.warp-history-name:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.warp-history-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.warp-history-meta :deep(img) {
  filter: brightness(0.3);
}
.warp-history :deep(.warp-stars-icon img) {
  filter: brightness(0.6) contrast(1.25);
}
.warp-history-page-button {
  --h-button-min-width: 0;
  --h-button-padding: 6px 10px;
}
.warp-history-pagination {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  font-size: 12px;
  color: var(--h-muted);
}
@media (max-width: 600px) {
  .warp-history-table {
    font-size: 12px;
  }
  th,
  td {
    padding: 10px 4px;
  }
  th:nth-child(2) {
    width: 48px;
  }
  th:nth-child(3) {
    width: 60px;
  }
  th:nth-child(4) {
    width: 75px;
  }
  .warp-history-meta {
    gap: 3px;
  }
  .warp-history-meta :deep(.warp-icon) {
    --warp-icon-size: 18px;
  }
  .warp-history :deep(.warp-stars-icon) {
    --warp-stars-width: 54px;
  }
}
</style>
