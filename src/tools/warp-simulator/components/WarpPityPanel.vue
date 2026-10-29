<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Tag from 'primevue/tag'
import { CircleCheck } from '@lucide/vue'
import type { PityState } from '../engine/types'
import { pityRows } from '../model/presentation'
const props = defineProps<{ pity: PityState; hasUp5: boolean; hasUp4: boolean }>()
const { t } = useI18n()
const groups = computed(() => {
  const rows = pityRows(props.pity, props.hasUp5, props.hasUp4)
  return [
    { rarity: 5, count: rows[0].count, pending: false, status: rows[1].status },
    { rarity: 4, count: rows[2].count, pending: rows[2].pending, status: rows[3].status },
  ] as const
})
</script>

<template>
  <div class="warp-pity" :aria-label="t('warp.pity.title')">
    <div v-for="group in groups" :key="group.rarity" class="warp-pity-row">
      <div
        class="warp-pity-count"
        :class="`warp-pity-${group.rarity}`"
        :title="group.pending ? t('warp.pity.pendingHint') : undefined"
      >
        <span class="warp-pity-label">{{
          t(group.rarity === 5 ? 'warp.pity.fiveLabel' : 'warp.pity.fourLabel')
        }}</span>
        <span class="warp-pity-number" aria-hidden="true">{{
          group.pending ? '9+' : group.count
        }}</span>
        <span class="warp-sr-only">{{
          t(
            group.pending
              ? 'warp.pity.fourPending'
              : group.rarity === 5
                ? 'warp.pity.fiveCount'
                : 'warp.pity.fourCount',
            { count: group.count },
          )
        }}</span>
      </div>
      <div class="warp-pity-guarantee">
        <span class="warp-pity-label">{{
          t(group.rarity === 5 ? 'warp.pity.fiveGuarantee' : 'warp.pity.fourGuarantee')
        }}</span>
        <Tag
          :severity="group.status === 'guaranteed' ? 'success' : 'secondary'"
          :value="t(`warp.pity.${group.status}`)"
        >
          <template #icon
            ><CircleCheck
              v-if="group.status !== 'unavailable'"
              :size="14"
              :stroke-width="1.75"
              aria-hidden="true"
          /></template>
        </Tag>
      </div>
    </div>
    <p v-if="pity.pullsSinceLast4 === 9" class="warp-pending-hint">
      {{ t('warp.pity.pendingHint') }}
    </p>
  </div>
</template>

<style scoped>
.warp-pity {
  padding: 14px 0;
  border-top: 1px solid var(--color-line);
  border-bottom: 1px solid var(--color-line);
}
.warp-pity-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 76px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.warp-pity-count,
.warp-pity-guarantee {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 7px;
}
.warp-pity-label {
  color: var(--color-muted);
  font-size: 12px;
}
.warp-pity-number {
  font-size: 30px;
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.warp-pity-5 .warp-pity-number {
  color: var(--p-warp-rarity-5);
}
.warp-pity-4 .warp-pity-number {
  color: var(--p-warp-rarity-4);
}
.warp-pending-hint {
  margin: 6px 0 0;
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.5;
}
.warp-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
