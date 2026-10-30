<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { buildSkillPointLedger } from '../model/skill-point-ledger'
import { formatNumber } from '../model/presentation'
import type { CycleMode, EventAnchor, SimulationResult } from '../engine/types'
import type { ToolLocale } from '../../../locales/types'
const props = defineProps<{
  result: SimulationResult
  cycleMode: CycleMode
  anchorLabel: (anchor: EventAnchor) => string
}>()
const emit = defineEmits<{ select: [anchor: EventAnchor] }>()
const { t, locale } = useI18n()
const rows = computed(() => buildSkillPointLedger(props.result, props.cycleMode))
const number = (value: number | null) =>
  value === null ? t('planner.sp.unknownValue') : formatNumber(value, locale.value as ToolLocale)
</script>
<template>
  <details v-if="rows.length" class="ledger">
    <summary>{{ t('planner.ledger.title') }}</summary>
    <p class="fine-print">{{ t('planner.ledger.scope') }}</p>
    <div class="ledger-scroll" tabindex="0" role="region" :aria-label="t('planner.ledger.title')">
      <table>
        <caption class="sr-only">
          {{
            t('planner.ledger.title')
          }}
        </caption>
        <thead>
          <tr>
            <th
              v-for="key in [
                'cycle',
                'opening',
                'cost',
                'skillRecovery',
                'external',
                'refill',
                'ending',
                'stored',
                'max',
                'loss',
                'first',
                'status',
              ]"
              :key="key"
              scope="col"
            >
              {{ t(`planner.ledger.${key}`) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.cycle ?? 'all'">
            <th scope="row">
              {{
                row.cycle === null
                  ? t('planner.ledger.all')
                  : t('planner.ledger.cycleLabel', { cycle: row.cycle })
              }}
            </th>
            <td>{{ number(row.openingBalance) }}</td>
            <td>{{ number(row.totalCost) }}</td>
            <td>{{ number(row.skillRecovery) }}</td>
            <td>{{ number(row.externalRecovery) }}</td>
            <td>{{ number(row.refill) }}</td>
            <td>{{ number(row.endingBalance) }}</td>
            <td>{{ number(row.storedBalance) }}</td>
            <td>
              <span>{{ number(row.openingMax) }}→{{ number(row.endingMax) }}</span
              ><small v-for="(change, index) in row.capChanges" :key="index"
                >{{
                  t('planner.sp.maxChange', {
                    beforeMax: change.beforeMax,
                    afterMax: change.afterMax,
                  })
                }}<span v-if="change.loss">
                  ·
                  {{
                    t('planner.sp.clamp', {
                      before: change.before,
                      after: change.after,
                      loss: change.loss,
                    })
                  }}</span
                ></small
              >
            </td>
            <td>{{ number(row.capLoss) }}</td>
            <td>
              <button
                v-if="row.firstInsufficient"
                class="text-button"
                @click="emit('select', row.firstInsufficient)"
              >
                {{ anchorLabel(row.firstInsufficient) }}</button
              ><span v-else>—</span>
            </td>
            <td>
              <span v-if="row.unknown" class="quiet-tag">{{ t('planner.sp.unknownValue') }}</span>
              <span v-if="row.unverified" class="quiet-tag">{{ t('planner.sp.unverified') }}</span>
              <span v-if="row.stopped" class="quiet-tag">{{ t('planner.ledger.stopped') }}</span
              ><span v-if="!row.unknown && !row.unverified && !row.stopped">{{
                t('planner.ledger.known')
              }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </details>
</template>
<style scoped>
.ledger {
  margin-block: 1rem;
  min-width: 0;
}
.ledger summary {
  cursor: pointer;
}
.ledger-scroll {
  max-width: 100%;
  overflow-x: auto;
}
table {
  width: 100%;
  min-width: 1120px;
  border-collapse: collapse;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
}
th,
td {
  padding: 0.6rem;
  text-align: start;
  vertical-align: top;
  border-bottom: 1px solid var(--color-line);
}
td small {
  display: block;
  white-space: nowrap;
  color: var(--color-muted);
}
</style>
