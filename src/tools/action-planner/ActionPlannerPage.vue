<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Splitter from 'primevue/splitter'
import SplitterPanel from 'primevue/splitterpanel'
import Button from 'primevue/button'
import { SlidersHorizontal, ListOrdered, RotateCcw } from '@lucide/vue'
import BattleSetup from './components/BattleSetup.vue'
import ActionNavigator from './components/ActionNavigator.vue'
import ActionInspector from './components/ActionInspector.vue'
import { usePlannerSession } from './composables/usePlannerSession'
import PlanManagement from './components/PlanManagement.vue'
import { usePlannerPresentation } from './composables/usePlannerPresentation'
import { anchorKey } from './engine/queue'
import { countdownSources } from './model/speed-modifier-tags'
import type { ActorConfig, CycleMode, AhaConfig, SkillPointsConfig } from './engine/types'
const { t, locale } = useI18n()
const { planner, persistence, saveStatus } = usePlannerSession()
const planManagement = ref<InstanceType<typeof PlanManagement>>()
const setupDirty = ref(false)
const {
  document,
  plan,
  result,
  selected,
  stage,
  view,
  draft,
  invalid,
  operations,
  context,
  preview,
  targets,
  unreached,
  inactive,
  queueIndex,
  currentQueueView,
  select,
  edit,
  cancel,
  submit,
  submitKhaslana,
  submitRobin,
  robinPresetIssue,
  remove,
  move,
  deleteEvent,
  stepQueue,
  nextId,
  operationContext,
  setupRevision,
  documentError,
} = planner
watch(
  setupRevision,
  () => {
    setupDirty.value = false
  },
  { flush: 'sync' },
)
const { label, image, title, anchorLabel } = usePlannerPresentation(document, locale, t)
function apply(
  actors: ActorConfig[],
  nodes: number,
  av: number,
  characters: Record<string, string>,
  cycleMode: CycleMode,
  aha: AhaConfig,
  skillPoints: SkillPointsConfig,
) {
  if (planner.applySetup(actors, nodes, av, characters, cycleMode, aha, skillPoints))
    stage.value = 'planning'
}
const modifierSources = computed(() => countdownSources(plan.value))
const navigatorProps = computed(() => ({
  countdownSources: modifierSources.value,
  records: result.value.records,
  startSkillPointEvents: result.value.startSkillPointEvents,
  startMaxChanges: result.value.startMaxChanges,
  blockedAction: result.value.blockedAction,
  selected: selected.value,
  plan: plan.value,
  currentQueueView: currentQueueView.value,
  queueIndex: queueIndex.value,
  label,
  image,
}))
const inspectorProps = computed(() => ({
  countdownSources: modifierSources.value,
  ahaId: plan.value.aha.id,
  spEnabled:
    !!plan.value.skillPoints?.enabled &&
    result.value.participants.some(
      (p) =>
        selected.value.kind === 'action' &&
        p.id === selected.value.participantId &&
        p.kind === 'actor' &&
        p.camp === 'ally',
    ),
  uncommittedResources:
    !!result.value.blockedAction &&
    anchorKey(result.value.blockedAction.anchor) === anchorKey(selected.value),
  maxChanges:
    selected.value.kind === 'start'
      ? result.value.startMaxChanges
      : result.value.records.find((r) => anchorKey(r.anchor) === anchorKey(selected.value))
          ?.maxChanges,
  resourceRecords:
    selected.value.kind === 'start'
      ? result.value.startSkillPointEvents
      : [
          ...result.value.records,
          ...(result.value.blockedAction ? [result.value.blockedAction] : []),
        ].find((r) => anchorKey(r.anchor) === anchorKey(selected.value))?.skillPointEvents,
  skill: plan.value.events.find((e) => anchorKey(e.anchor) === anchorKey(selected.value))?.skill,
  spRecord: [
    ...result.value.records,
    ...(result.value.blockedAction ? [result.value.blockedAction] : []),
  ].find((r) => anchorKey(r.anchor) === anchorKey(selected.value) && r.kind !== 'cycleBoundary'),
  anchor: selected.value,
  inactive: selected.value.kind === 'cycleBoundary' && plan.value.cycleMode === 'none',
  operations: operations.value,
  context: context.value,
  preview: preview.value,
  targets: targets.value,
  invalid: invalid.value,
  robinPresetIssue: robinPresetIssue.value,
  label,
  image,
  anchorLabel,
  title,
  operationContext,
}))
const media = window.matchMedia('(min-width: 960px)')
const desktop = ref(media.matches)
const workspace = ref<HTMLElement>()
const width = ref(1000)
const minNavigator = computed(() => ((320 + 6) / (width.value - 2)) * 100)
const navigatorSize = computed(() => Math.max(35, minNavigator.value))
const minInspector = computed(() => ((440 + 6) / (width.value - 2)) * 100)
const syncMedia = () => {
  desktop.value = media.matches
}
const observer = new ResizeObserver((entries) => {
  width.value = entries[0]?.contentRect.width || 1000
})
onMounted(() => {
  media.addEventListener('change', syncMedia)
  if (workspace.value) observer.observe(workspace.value)
})
onBeforeUnmount(() => {
  media.removeEventListener('change', syncMedia)
  observer.disconnect()
})
</script>
<template>
  <div class="planner-page">
    <div class="page-intro functional-intro">
      <h1>{{ t('planner.title') }}</h1>
      <Button
        v-tooltip="t('planner.files.new')"
        text
        severity="secondary"
        :aria-label="t('planner.files.new')"
        @click="planManagement?.newDocument()"
        ><RotateCcw :size="18" :stroke-width="1.75" /><span>{{
          t('planner.files.new')
        }}</span></Button
      >
    </div>
    <Tabs v-model:value="stage"
      ><TabList :aria-label="t('ui.stage')"
        ><Tab value="setup" class="inline-flex items-center gap-2"
          ><SlidersHorizontal :size="18" :stroke-width="1.75" /><span>{{
            t('ui.setup')
          }}</span></Tab
        ><Tab value="planning" class="inline-flex items-center gap-2"
          ><ListOrdered :size="18" :stroke-width="1.75" /><span>{{ t('ui.planning') }}</span></Tab
        ></TabList
      ><TabPanels
        ><TabPanel value="setup"
          ><PlanManagement
            ref="planManagement"
            :planner="planner"
            :persistence="persistence"
            :save-status="saveStatus"
            :setup-dirty="setupDirty" /><BattleSetup
            :key="setupRevision"
            v-model:dirty="setupDirty"
            :plan="plan"
            :character-ids="document.metadata.characterIds"
            :next-id="nextId"
            @apply="apply" /></TabPanel
        ><TabPanel value="planning">
          <p v-if="documentError" class="field-error" role="alert">
            {{ t(`planner.files.error.${documentError}`) }}
          </p>
          <section
            v-if="result.skillPointsSummary"
            class="range-section"
            :aria-label="t('planner.sp.summary')"
          >
            <h2>{{ t('planner.sp.summary') }}</h2>
            <p v-if="result.skillPointsSummary.firstInsufficient">
              {{ t('planner.sp.firstInsufficient') }}
              <button
                class="text-button"
                @click="select(result.skillPointsSummary.firstInsufficient)"
              >
                {{ anchorLabel(result.skillPointsSummary.firstInsufficient) }}
              </button>
            </p>
            <p v-else>{{ t('planner.sp.noInsufficient') }}</p>
            <p>
              {{
                t('planner.sp.totals', {
                  cost: result.skillPointsSummary.totalCost ?? t('planner.sp.unknownValue'),
                  recovery: result.skillPointsSummary.totalRecovery ?? t('planner.sp.unknownValue'),
                  balance: result.skillPointsSummary.endingBalance ?? t('planner.sp.unknownValue'),
                  stored: result.skillPointsSummary.storedBalance ?? t('planner.sp.unknownValue'),
                })
              }}
            </p>
            <p
              v-if="
                plan.skillPoints?.onInsufficient === 'mark' &&
                result.skillPointsSummary.firstInsufficient
              "
              class="fine-print"
            >
              {{ t('planner.sp.counterfactual') }}
            </p>
            <p>
              {{
                t('planner.sp.maxFormula', {
                  base: result.skillPointsSummary.baseMax,
                  modifier:
                    result.skillPointsSummary.effectiveMax - result.skillPointsSummary.baseMax >= 0
                      ? `+${result.skillPointsSummary.effectiveMax - result.skillPointsSummary.baseMax}`
                      : String(
                          result.skillPointsSummary.effectiveMax -
                            result.skillPointsSummary.baseMax,
                        ),
                  max: result.skillPointsSummary.effectiveMax,
                })
              }}
              · {{ t('planner.sp.capLoss', { amount: result.skillPointsSummary.capLoss }) }}
            </p>
            <p class="fine-print">{{ t('planner.sp.summaryScope') }}</p>
          </section>
          <details
            v-if="result.diagnostics.length"
            class="diagnostics"
            :open="result.stopReason === 'error'"
          >
            <summary>{{ t('ui.diagnostics', { count: result.diagnostics.length }) }}</summary>
            <ul>
              <li
                v-for="(diagnostic, index) in result.diagnostics"
                :key="index"
                :class="{ 'field-error': diagnostic.severity === 'error' }"
              >
                <button
                  v-if="diagnostic.anchor"
                  class="text-button"
                  @click="select(diagnostic.anchor)"
                >
                  {{ anchorLabel(diagnostic.anchor) }}</button
                ><span>{{ t(`ui.diagnostic.${diagnostic.code}`) }}</span>
              </li>
            </ul>
          </details>
          <div ref="workspace" class="workspace" :class="{ 'workspace-mobile': !desktop }">
            <Splitter
              v-if="desktop"
              :gutter-size="6"
              :pt="{
                gutterHandle: {
                  'aria-label': t('ui.resize'),
                  'aria-orientation': 'vertical',
                  'aria-valuemin': minNavigator,
                  'aria-valuemax': 100 - minInspector,
                },
              }"
              class="planner-splitter"
              ><SplitterPanel :size="navigatorSize" :min-size="minNavigator"
                ><ActionNavigator
                  v-model:view="view"
                  v-bind="navigatorProps"
                  @select="select"
                  @step="stepQueue" /></SplitterPanel
              ><SplitterPanel :size="100 - navigatorSize" :min-size="minInspector"
                ><ActionInspector
                  v-model:draft="draft"
                  v-bind="inspectorProps"
                  @edit="edit"
                  @remove="remove"
                  @move="move"
                  @cancel="cancel"
                  @submit="submit"
                  @khaslana="submitKhaslana"
                  @robin="submitRobin"
                  @skill="planner.setSkill" /></SplitterPanel></Splitter
            ><template v-else
              ><ActionNavigator
                v-model:view="view"
                v-bind="navigatorProps"
                @select="select"
                @step="stepQueue" /><ActionInspector
                v-model:draft="draft"
                v-bind="inspectorProps"
                @edit="edit"
                @remove="remove"
                @move="move"
                @cancel="cancel"
                @submit="submit"
                @khaslana="submitKhaslana"
                @robin="submitRobin"
                @skill="planner.setSkill"
            /></template>
          </div>
          <section v-if="inactive.length" class="unreached-events">
            <h2>{{ t('planner.cycle.inactive') }}</h2>
            <div
              v-for="event in inactive"
              :key="JSON.stringify(event.anchor)"
              class="unreached-row"
            >
              <button class="text-button" @click="select(event.anchor)">
                {{ anchorLabel(event.anchor) }}
              </button>
              <span class="fine-print">{{ t('planner.cycle.disabled') }}</span>
              <Button
                text
                severity="secondary"
                size="small"
                :label="t('ui.deleteEvent')"
                @click="deleteEvent(event.anchor)"
              />
            </div>
          </section>
          <section v-if="unreached.length" class="unreached-events">
            <h2>{{ t('ui.unreached') }}</h2>
            <div
              v-for="event in unreached"
              :key="JSON.stringify(event.anchor)"
              class="unreached-row"
            >
              <button class="text-button" @click="select(event.anchor)">
                {{ anchorLabel(event.anchor) }}</button
              ><Button
                text
                severity="secondary"
                size="small"
                :label="t('ui.deleteEvent')"
                @click="deleteEvent(event.anchor)"
              />
            </div>
          </section> </TabPanel></TabPanels
    ></Tabs>
  </div>
</template>
