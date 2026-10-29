<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Check, Minus } from '@lucide/vue'
import { HBadge, HButton, HModal, HTabs, HTabPanels, HFadeContainer } from 'astral-ui/components'
import CurrencyRoleCard from './CurrencyRoleCard.vue'
import CurrencyImage from './CurrencyImage.vue'
import CurrencyTrait from './CurrencyTrait.vue'
import CurrencyEmblemDemand from './CurrencyEmblemDemand.vue'
import { createEmblemDemand, type CurrencyWarsCraftCatalog } from '../ui/crafting'
import { traitDetails } from '../ui/trait-details'
import {
  createVisuals,
  sortVisualMembers,
  type VisualCatalog,
  type VisualMember,
} from '../ui/visuals'
import type { SolvedAttempt } from '../ui/session'
import type { Snapshot } from '../types'
const props = defineProps<{
  snapshot: Snapshot
  catalog: VisualCatalog
  crafts: CurrencyWarsCraftCatalog
  attempt: SolvedAttempt
  stale: boolean
  historical: boolean
}>()
const { t } = useI18n()
const visuals = computed(() =>
  createVisuals(props.snapshot, props.catalog, import.meta.env.BASE_URL),
)
const result = computed(() => props.attempt.result)
const evaluation = computed(() => result.value.evaluation!)
const lineup = computed(() => result.value.lineup!)
const emblemDemands = computed(() =>
  createEmblemDemand(
    { lineup: lineup.value },
    props.snapshot,
    props.crafts,
    props.catalog,
    import.meta.env.BASE_URL,
  ),
)
const members = computed(() =>
  sortVisualMembers(
    lineup.value.members.map((member) =>
      visuals.value.member(
        member,
        evaluation.value.members.find((m) => m.formId === member.formId)!,
      ),
    ),
  ),
)
const traits = computed(() => traitDetails(evaluation.value))
const resultTab = ref('lineup')
const resultTabs = computed(() => [
  { value: 'lineup', label: t('currencyWars.result.lineup') },
  { value: 'traits', label: t('currencyWars.result.traits') },
  { value: 'emblems', label: t('currencyWars.crafting.title') },
])
watch(resultTab, () => {
  roleDetailsOpen.value = false
})
const selectedMember = shallowRef<VisualMember>()
const roleDetailsOpen = ref(false)
function inspect(member: VisualMember) {
  selectedMember.value = member
  roleDetailsOpen.value = true
}
function afterDetailsLeave() {
  if (roleDetailsOpen.value) return
  selectedMember.value = undefined
  // A replaced result may have removed the original portrait button.
  if (!document.activeElement || document.activeElement === document.body)
    document
      .getElementById?.('currency-results-tab-' + resultTab.value)
      ?.focus({ preventScroll: true })
}

watch(
  () => props.attempt.requestId,
  () => {
    resultTab.value = 'lineup'
    roleDetailsOpen.value = false
  },
)
</script>

<template>
  <div class="currency-results">
    <p v-if="stale" class="currency-notice currency-notice--warning">
      {{ t('currencyWars.result.stale') }}
    </p>
    <p v-else-if="historical" class="currency-notice">{{ t('currencyWars.result.historical') }}</p>
    <p v-if="result.status === 'feasible'" class="currency-notice currency-notice--warning">
      {{ t('currencyWars.status.feasible') }}
    </p>
    <p
      v-for="warning in evaluation.warnings"
      :key="warning"
      class="currency-notice currency-notice--warning"
    >
      {{
        t(
          warning === 'bronya-tie-conservative-lower-bound'
            ? 'currencyWars.result.bronyaWarning'
            : 'currencyWars.result.genericWarning',
        )
      }}
    </p>
    <HTabs
      v-model="resultTab"
      :items="resultTabs"
      :label="t('currencyWars.result.title')"
      id-prefix="currency-results"
      variant="pill"
    />
    <HTabPanels
      class="currency-result-panels"
      :value="resultTab"
      :order="['lineup', 'traits', 'emblems']"
      id-prefix="currency-results"
    >
      <template #default="{ value }">
        <HFadeContainer
          :key="value"
          class="currency-result-scroll"
          :fade-edges="['top', 'bottom']"
          :fade-size="24"
          overflow="auto"
          :label="resultTabs.find((tab) => tab.value === value)!.label"
        >
          <section v-if="value === 'lineup'" :aria-label="t('currencyWars.result.lineup')">
            <ul class="currency-roster">
              <CurrencyRoleCard
                v-for="member in members"
                :key="member.role.id"
                :member="member"
                @inspect="inspect"
              />
            </ul>
            <p v-if="!members.length" class="currency-muted">
              {{ t('currencyWars.result.noRoles') }}
            </p>
          </section>
          <section v-else-if="value === 'traits'" :aria-label="t('currencyWars.result.traits')">
            <ul class="currency-trait-list">
              <li v-for="trait in traits" :key="trait.traitId">
                <div class="currency-trait-info">
                  <div class="currency-trait-heading">
                    <CurrencyTrait
                      :source="visuals.traitUrl(trait.traitId)"
                      :name="visuals.trait(trait.traitId).name"
                    />
                    <span class="currency-trait-counts">
                      <template v-if="trait.tasks.length">
                        <span
                          v-for="task in trait.tasks"
                          :key="task.id"
                          class="currency-task-count"
                          :aria-label="
                            t('currencyWars.result.taskCounts', {
                              actual: trait.count,
                              required: task.requiredCount,
                            })
                          "
                          >{{ trait.count }} / {{ task.requiredCount }}</span
                        >
                      </template>
                      <span v-else class="currency-task-count">{{ trait.count }}</span>
                    </span>
                  </div>
                  <div v-if="trait.tasks.length" class="currency-trait-statuses">
                    <HBadge tone="success">{{ t('currencyWars.result.targetTask') }}</HBadge>
                    <HBadge v-if="trait.activeThreshold === null" tone="muted">{{
                      t('currencyWars.result.inactiveTrait')
                    }}</HBadge>
                    <span
                      v-for="task in trait.tasks.filter(
                        (task) => task.completed || trait.activeThreshold !== null,
                      )"
                      :key="task.id"
                      class="currency-task-status"
                      :class="{ completed: task.completed }"
                    >
                      <span v-if="trait.tasks.length > 1">≥{{ task.requiredCount }}</span>
                      <Check v-if="task.completed" :size="14" aria-hidden="true" /><Minus
                        v-else
                        :size="14"
                        aria-hidden="true"
                      />
                      {{
                        t(
                          task.completed
                            ? 'currencyWars.result.completed'
                            : 'currencyWars.result.incomplete',
                        )
                      }}
                    </span>
                  </div>
                </div>
                <ul
                  class="currency-contributors"
                  :aria-label="
                    t('currencyWars.result.contributors', {
                      names: trait.contributors
                        .map((id) => visuals.role(id)?.name ?? id)
                        .join(' · '),
                    })
                  "
                >
                  <li
                    v-for="id in trait.contributors"
                    :key="id"
                    :title="visuals.role(id)?.name ?? id"
                    tabindex="0"
                  >
                    <span
                      class="currency-contributor-image"
                      :style="{ background: `var(--p-currency-cost-${catalog.costs[id]})` }"
                    >
                      <CurrencyImage
                        :source="visuals.portrait(id)"
                        :name="visuals.role(id)?.name ?? id"
                        kind="role"
                      />
                    </span>
                  </li>
                </ul>
              </li>
            </ul>
            <p v-if="!traits.length" class="currency-muted">
              {{ t('currencyWars.result.noTraits') }}
            </p>
          </section>
          <CurrencyEmblemDemand v-else :demands="emblemDemands" />
        </HFadeContainer>
      </template>
    </HTabPanels>
    <HModal
      v-model="roleDetailsOpen"
      class="h-theme currency-theme currency-role-dialog"
      :title="selectedMember?.role.name ?? ''"
      :close-label="t('currencyWars.visual.closeDetails')"
      @after-leave="afterDetailsLeave"
    >
      <template #illustration>
        <div v-if="selectedMember" class="currency-detail-hero">
          <div class="currency-detail-portrait-frame">
            <div
              class="currency-detail-portrait"
              :style="{ background: `var(--p-currency-cost-${selectedMember.cost})` }"
            >
              <CurrencyImage
                :source="selectedMember.portraitUrl"
                :name="selectedMember.role.name"
                kind="role"
              />
            </div>
            <span class="currency-detail-cost">{{
              t('currencyWars.visual.cost', { cost: selectedMember.cost })
            }}</span>
          </div>
          <p class="currency-detail-position">
            {{ t(`currencyWars.visual.${selectedMember.position ?? 'unknownPosition'}`) }}
          </p>
        </div>
      </template>
      <div v-if="selectedMember" class="currency-role-details">
        <div class="currency-detail-traits">
          <CurrencyTrait
            v-for="trait in selectedMember.finalTraits"
            :key="trait.id"
            :source="visuals.traitUrl(trait.id)"
            :name="trait.name"
          />
          <span v-if="!selectedMember.finalTraits.length" class="currency-muted">—</span>
        </div>
        <div class="currency-detail-section">
          <ul v-if="selectedMember.slots.some(Boolean)" class="currency-detail-emblems">
            <li
              v-for="emblem in selectedMember.slots.filter((slot) => slot !== undefined)"
              :key="emblem.id"
            >
              <span class="currency-detail-emblem-image"
                ><CurrencyImage :source="emblem.url" :name="emblem.name" kind="emblem"
              /></span>
              <span>{{ emblem.name }}</span>
            </li>
          </ul>
          <span v-else class="currency-muted">—</span>
        </div>
        <div v-if="selectedMember.role.mechanic" class="currency-detail-section">
          <template v-if="selectedMember.role.mechanic === 'navigator'">
            <div v-if="selectedMember.target" class="currency-navigator-target">
              <span
                class="currency-detail-target-image"
                :style="{ background: `var(--p-currency-cost-${selectedMember.targetCost})` }"
              >
                <CurrencyImage
                  :source="visuals.portrait(selectedMember.target.id)"
                  :name="selectedMember.target.name"
                  kind="role"
                />
              </span>
              <span>{{
                t('currencyWars.visual.navigatorTarget', { name: selectedMember.target.name })
              }}</span>
            </div>
            <span v-else class="currency-muted">{{ t('currencyWars.visual.cardNoTarget') }}</span>
          </template>
          <CurrencyTrait
            v-else-if="selectedMember.bronyaTrait"
            :source="visuals.traitUrl(selectedMember.bronyaTrait.id)"
            :name="selectedMember.bronyaTrait.name"
          />
          <template v-else>
            <p>{{ t('currencyWars.visual.cardUnassigned') }}</p>
            <p class="currency-notice currency-notice--warning">
              {{ t('currencyWars.result.bronyaWarning') }}
            </p>
          </template>
        </div>
      </div>
      <template #footer>
        <HButton icon="cross" icon-shape="round" sparkles @click="roleDetailsOpen = false">{{
          t('ui.close')
        }}</HButton>
      </template>
    </HModal>
  </div>
</template>

<style scoped>
.currency-results {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 12px;
  min-width: 0;
  min-height: 0;
}
.currency-results > .currency-notice,
.currency-results > :deep(.h-tabs) {
  flex-shrink: 0;
  margin: 0;
}
.currency-result-panels,
.currency-result-panels :deep(.h-tab-panels__page) {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.currency-result-scroll {
  flex: 1;
  min-height: 0;
}
.currency-result-scroll :deep(.h-fade-container__content) {
  width: 100%;
}
.currency-muted {
  color: var(--color-muted);
  font-size: 12px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.currency-roster {
  display: grid;
  --role-size: 128px;
  grid-template-columns: repeat(auto-fill, minmax(0, var(--role-size)));
  justify-content: start;
  gap: 16px 12px;
  padding: 0;
  margin: 0;
  list-style: none;
}
.currency-trait-list,
.currency-detail-emblems {
  padding: 0;
  list-style: none;
  margin: 0;
}
.currency-trait-list {
  font-size: 13px;
}
.currency-trait-list > li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
  padding: 10px 0;
  --trait-icon-size: 28px;
  border-bottom: 1px solid var(--h-line);
}
.currency-trait-info {
  min-width: 0;
  max-width: 100%;
}
.currency-trait-heading,
.currency-trait-counts,
.currency-trait-statuses {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}
.currency-trait-statuses {
  padding-inline-start: calc(var(--trait-icon-size) + 10px);
  margin-top: 4px;
}
.currency-task-count {
  font-size: 16px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.currency-task-status {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--color-muted);
  font-size: 12px;
}
.currency-task-status.completed {
  color: var(--color-ally);
}
.currency-role-details {
  font-size: 13px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.currency-detail-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  --trait-icon-size: 24px;
}
.currency-contributors {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  max-width: 100%;
  margin: 0 0 0 auto;
  padding: 0;
  list-style: none;
}
.currency-contributor-image {
  display: block;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  overflow: hidden;
}
.currency-navigator-target {
  display: flex;
  align-items: center;
  gap: 8px;
}
.currency-detail-emblems {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
}
.currency-detail-emblems li {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 100%;
}
.currency-detail-emblem-image {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}
.currency-detail-section {
  border-top: 1px solid var(--h-line);
  margin-top: 16px;
  padding-top: 16px;
}
.currency-detail-section p {
  margin: 0;
}
.currency-detail-section .currency-notice {
  margin: 6px 0 0;
  font-size: 12px;
}
.currency-detail-traits > :deep(.currency-trait) {
  border: 1px solid var(--h-line);
  border-radius: 6px;
  padding: 6px 10px;
}
.currency-detail-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}
.currency-detail-portrait-frame {
  position: relative;
  width: min(100%, 180px);
  aspect-ratio: 1;
}
.currency-detail-portrait-frame::before {
  content: '';
  position: absolute;
  inset: -8px;
  border: 1px solid var(--h-line);
  border-radius: 50%;
  pointer-events: none;
}
.currency-detail-portrait {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  overflow: hidden;
}
.currency-detail-cost {
  position: absolute;
  top: 8px;
  left: 0;
  border-radius: 12px;
  padding: 1px 10px;
  background: var(--h-dark);
  color: var(--h-paper-light);
  font-size: 12px;
}
.currency-detail-position {
  margin: 0;
  color: var(--color-muted);
  font-size: 14px;
}
.currency-detail-target-image {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 5px;
  overflow: hidden;
}
@media (max-width: 480px) {
  .currency-roster {
    --role-size: 104px;
    gap: 16px 10px;
  }
  .currency-task-status {
    font-size: 11px;
  }
}
</style>
