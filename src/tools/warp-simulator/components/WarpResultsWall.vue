<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ToolLocale } from '../../../locales/types'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { createPresentation } from '../model/presentation'
import { resultWall, fitResultWall, wallCard, wallLayout } from '../model/result-wall'
import { useWarpElementSize } from '../composables/useWarpElementSize'
import WarpResultCard from './WarpResultCard.vue'

const props = withDefaults(
  defineProps<{
    entries: readonly HistoryEntry[]
    presentation: ReturnType<typeof createPresentation>
    idPrefix?: string
  }>(),
  { idPrefix: 'warp-overview-result' },
)
const emit = defineEmits<{ details: [entry: HistoryEntry] }>()
const { locale, t } = useI18n()
const frame = ref<HTMLElement>()
const size = useWarpElementSize(frame)
const wall = resultWall
const scale = computed(() => fitResultWall(size.value.width, size.value.height, wall))
const rows = computed(() =>
  wall.rows.map((row) => ({
    ...row,
    entries: props.entries.slice(row.start, row.start + row.count).map((entry, column) => ({
      entry,
      index: row.start + column,
    })),
  })),
)
</script>
<template>
  <div ref="frame" class="warp-wall-viewport" :aria-label="t('warp.results.overviewTitle')">
    <div
      class="warp-wall-canvas"
      :style="{
        width: `${wall.width}px`,
        height: `${wall.height}px`,
        '--wall-scale': scale,
        '--wall-angle': `${wall.angle}deg`,
        '--wall-card-width': `${wallCard.width}px`,
        '--wall-card-height': `${wallCard.height}px`,
        '--wall-gap': `${wallLayout.gap}px`,
      }"
    >
      <div
        v-for="(row, rowIndex) in rows"
        :key="rowIndex"
        class="warp-wall-row"
        :style="{
          left: `${row.left}px`,
          top: `${row.top}px`,
          width: `${row.width}px`,
          zIndex: row.zIndex,
        }"
      >
        <div
          v-for="{ entry, index } in row.entries"
          :key="`${entry.batchId}:${entry.id}`"
          class="warp-wall-slot"
        >
          <WarpResultCard
            :entry="entry"
            :item="presentation.item(entry.event.itemId, locale as ToolLocale)"
            :index="index"
            :id-prefix="idPrefix"
            @details="emit('details', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.warp-wall-viewport {
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.warp-wall-canvas {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%) scale(var(--wall-scale));
  transform-origin: center;
}
.warp-wall-row {
  position: absolute;
  display: flex;
  gap: var(--wall-gap);
  height: var(--wall-card-height);
  transform: rotate(var(--wall-angle));
  transform-origin: center;
  isolation: isolate;
}
.warp-wall-row::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    transparent 30%,
    color-mix(in srgb, var(--p-warp-overview-edge-3) 10%, transparent)
  );
  box-shadow: 0 3px 10px color-mix(in srgb, var(--p-warp-overview-edge-3) 18%, transparent);
}
.warp-wall-slot {
  position: relative;
  flex: 0 0 var(--wall-card-width);
  min-width: 0;
}
.warp-wall-row:focus-within,
.warp-wall-row:hover {
  z-index: 20 !important;
}
.warp-wall-slot:focus-within,
.warp-wall-slot:hover {
  z-index: 20;
}
@media (max-width: 1039px), (max-height: 639px) {
  .warp-wall-viewport {
    overflow: auto;
    overscroll-behavior: contain;
  }
  .warp-wall-canvas {
    position: relative;
    left: auto;
    top: auto;
    width: 100% !important;
    height: auto !important;
    transform: none;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 32px 28px;
    padding: 40px;
  }
  .warp-wall-row {
    display: contents;
  }
  .warp-wall-row::before {
    content: none;
  }
  .warp-wall-slot {
    width: 100%;
  }
}
@media (max-width: 640px) {
  .warp-wall-canvas {
    grid-template-columns: minmax(0, 1fr);
    gap: 30px;
    padding: 32px;
  }
}
</style>
