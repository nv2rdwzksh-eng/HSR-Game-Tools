<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import SelectButton from 'primevue/selectbutton'
import {
  ArrowUp,
  ArrowDown,
  Zap,
  SlidersHorizontal,
  Flag,
  ChevronLeft,
  ChevronRight,
} from '@lucide/vue'
import UnitPortrait from './UnitPortrait.vue'
import SpeedModifierTags from './SpeedModifierTags.vue'
import {
  navigatorSpeedModifierTags,
  renderSpeedModifierTag,
  type CountdownSources,
} from '../model/speed-modifier-tags'
import { anchorKey } from '../engine/queue'
import type {
  EventAnchor,
  NodeRecord,
  SimulationPlan,
  SkillPointEventRecord,
} from '../engine/types'
import { actionDirections, nodeCamp } from '../model/naming'
import { operationsAt } from '../model/editor'
import { formatAV, formatNumber } from '../model/presentation'
import { currentQueueCards, type CurrentQueueView } from '../model/current-queue'
import type { ToolLocale } from '../../../locales/types'
const props = defineProps<{
  countdownSources: CountdownSources
  records: NodeRecord[]
  startSkillPointEvents?: SkillPointEventRecord[]
  startMaxChanges?: import('../engine/types').SkillPointMaxChange[]
  blockedAction?: NodeRecord
  selected: EventAnchor
  plan: SimulationPlan
  currentQueueView?: CurrentQueueView
  queueIndex: number
  label: (id: string) => string
  image: (id: string) => string | undefined
}>()
const view = defineModel<'future' | 'queue'>('view', { required: true })
const emit = defineEmits<{ select: [anchor: EventAnchor]; step: [delta: -1 | 1] }>()
const { t, locale } = useI18n()
const modes = computed(() =>
  ['future', 'queue'].map((value) => ({ value, label: t(`ui.${value}`) })),
)
const cards = computed(() => {
  const entries =
    view.value === 'future'
      ? props.records.map((r) => ({ ...r, total: r.elapsedAV, delta: r.deltaAV, isCurrent: false }))
      : currentQueueCards(props.currentQueueView)
  const waitingState =
    props.currentQueueView?.kind === 'acting'
      ? props.currentQueueView.current.beforeEffects
      : undefined
  return entries.map((card) => {
    const speedTags = navigatorSpeedModifierTags(card, props.countdownSources, waitingState)
    return {
      ...card,
      speedTags,
      changes: actionDirections(card.anchor, card.actionChanges),
      speedSummary: speedTags
        .map((tag) => renderSpeedModifierTag(tag, locale.value as ToolLocale, t).description)
        .join('\n'),
    }
  })
})
const recordAt = (anchor: EventAnchor) =>
  [...props.records, ...(props.blockedAction ? [props.blockedAction] : [])].find(
    (r) => anchorKey(r.anchor) === anchorKey(anchor),
  )
const resourceLabels = (anchor: EventAnchor) => {
  const receipts =
    anchor.kind === 'start' ? props.startSkillPointEvents : recordAt(anchor)?.skillPointEvents
  return (
    props.plan.events
      .find((e) => anchorKey(e.anchor) === anchorKey(anchor))
      ?.operations.filter((op) => op.type === 'restoreSkillPoints')
      .map((op) => {
        if (op.type !== 'restoreSkillPoints') return ''
        const receipt =
          view.value === 'future'
            ? receipts?.find((e) => e.operationId === op.id && e.committed !== false)
            : undefined
        return receipt?.stored
          ? t('planner.sp.storedEventLabel', {
              amount: op.amount,
              stored: receipt.stored,
              source: op.source,
            })
          : t('planner.sp.eventLabel', { amount: op.amount, source: op.source })
      }) ?? []
  )
}
const capLabels = (anchor: EventAnchor) =>
  (anchor.kind === 'start' ? props.startMaxChanges : recordAt(anchor)?.maxChanges)?.map(
    (c) =>
      t('planner.sp.maxChange', { beforeMax: c.beforeMax, afterMax: c.afterMax }) +
      (c.loss
        ? ` · ${t('planner.sp.clamp', { before: c.before, after: c.after, loss: c.loss })}`
        : ''),
  ) ?? []
const refillLabel = (anchor: EventAnchor) => {
  const refill = recordAt(anchor)?.refill
  return refill ? t('planner.sp.refill', { amount: refill.amount }) : ''
}
const validationLabel = (anchor: EventAnchor) => {
  const record = [...props.records, ...(props.blockedAction ? [props.blockedAction] : [])].find(
    (r) => anchorKey(r.anchor) === anchorKey(anchor),
  )
  return record?.spValidation && record.spValidation !== 'known'
    ? t(`planner.sp.${record.spValidation}`)
    : ''
}
const spLabel = (anchor: EventAnchor) => {
  const record = [...props.records, ...(props.blockedAction ? [props.blockedAction] : [])].find(
    (r) => anchorKey(r.anchor) === anchorKey(anchor),
  )
  if (!record || record.kind === 'cycleBoundary' || !record.skillPoints) return ''
  const sp = record.skillPoints
  return sp.status !== 'unknown'
    ? t('planner.sp.balance', { before: sp.before, after: sp.after })
    : t(`planner.sp.${sp.status}`)
}
const showStart = computed(
  () => view.value === 'future' || props.currentQueueView?.kind === 'start',
)
const campLabel = (node: { kind?: string; camp?: string }) =>
  t(`planner.navigator.${nodeCamp(node)}`)
const cardName = (card: { kind: string; anchor: EventAnchor; id?: string }) =>
  card.anchor.kind === 'cycleBoundary'
    ? t('planner.anchor.cycleBoundary', {
        ordinal: formatNumber(card.anchor.ordinal, locale.value as ToolLocale),
      })
    : props.label(card.id!)
const cardLabel = (card: {
  kind: string
  anchor: EventAnchor
  id?: string
  total: number
  speedSummary: string
}) => {
  const label = t('planner.navigator.node', {
    name: cardName(card),
    node:
      card.anchor.kind === 'action'
        ? t('ui.turn', { turn: formatNumber(card.anchor.turn, locale.value as ToolLocale) })
        : card.kind === 'cycleBoundary'
          ? t('planner.navigator.system')
          : t('ui.eventNode'),
    value: formatAV(card.total, locale.value as ToolLocale),
  })
  return card.speedSummary
    ? t('planner.speedTag.nodeDescription', { node: label, effects: card.speedSummary })
    : label
}
</script>
<template>
  <section class="navigator" :aria-label="t('ui.navigator')">
    <div class="pane-heading">
      <SelectButton
        v-model="view"
        size="small"
        :options="modes"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        :aria-label="t('ui.navigationMode')"
      />
    </div>
    <div v-if="view === 'queue'" class="queue-controls">
      <Button
        text
        severity="secondary"
        :disabled="!currentQueueView || queueIndex === 0"
        :aria-label="t('ui.previous')"
        @click="emit('step', -1)"
        ><ChevronLeft :size="16" /></Button
      ><span>{{
        t('planner.navigator.queueProgress', {
          count: formatNumber(queueIndex, locale as ToolLocale),
          total: formatNumber(records.length, locale as ToolLocale),
          value: formatAV(currentQueueView?.elapsedAV ?? 0, locale as ToolLocale),
        })
      }}</span
      ><Button
        text
        severity="secondary"
        :disabled="!currentQueueView || queueIndex >= records.length"
        :aria-label="t('ui.next')"
        @click="emit('step', 1)"
        ><ChevronRight :size="16"
      /></Button>
    </div>
    <div class="node-list">
      <button
        v-if="showStart"
        class="node-card start-card"
        :class="{ 'node-selected': selected.kind === 'start' }"
        :aria-pressed="selected.kind === 'start'"
        data-node="start"
        @click="emit('select', { kind: 'start' })"
      >
        <span
          class="camp-dot camp-dot-system"
          v-tooltip="t('planner.navigator.system')"
          role="img"
          :aria-label="t('planner.navigator.system')"
        ></span>
        <span class="event-avatar"><Flag :size="18" :stroke-width="1.75" /></span
        ><span class="node-info"
          ><span class="node-name">{{ t('ui.start') }}</span
          ><small
            v-for="(text, i) in resourceLabels({ kind: 'start' })"
            :key="i"
            class="fine-print"
            >{{ text }}</small
          ></span
        ><SlidersHorizontal
          v-if="operationsAt(plan, { kind: 'start' }).length"
          :size="14"
          :aria-label="t('ui.configured', { count: operationsAt(plan, { kind: 'start' }).length })"
        /><span class="node-values"
          ><small v-if="view === 'future'">+{{ formatAV(0, locale as ToolLocale) }}</small
          ><strong>{{ formatAV(0, locale as ToolLocale) }}</strong></span
        >
      </button>
      <button
        v-for="card in cards"
        :key="anchorKey(card.anchor)"
        class="node-card"
        :class="{
          'node-selected': anchorKey(selected) === anchorKey(card.anchor),
          'node-current': card.isCurrent,
        }"
        :aria-pressed="anchorKey(selected) === anchorKey(card.anchor)"
        :aria-current="card.isCurrent ? 'step' : undefined"
        :data-node="anchorKey(card.anchor)"
        :aria-label="cardLabel(card)"
        v-tooltip.focus="{
          value: card.speedSummary,
          disabled: !card.speedSummary,
          class: 'speed-tag-tooltip',
        }"
        @click="emit('select', card.anchor)"
      >
        <span
          class="camp-dot"
          :class="`camp-dot-${nodeCamp(card)}`"
          v-tooltip="campLabel(card)"
          role="img"
          :aria-label="campLabel(card)"
        ></span
        ><span v-if="card.kind === 'cycleBoundary'" class="event-avatar"
          ><Flag :size="18" :stroke-width="1.75" /></span
        ><UnitPortrait
          v-else
          :src="image(card.id)"
          :name="label(card.id)"
          :event="card.kind === 'scheduledEvent'"
          :aha="card.kind === 'aha'"
          :enemy="card.camp === 'enemy'"
        />
        <span class="node-body">
          <span class="node-name" :title="cardName(card)">{{ cardName(card) }}</span
          ><template v-if="view === 'future'"
            ><small
              v-for="(text, i) in capLabels({ kind: 'start' })"
              :key="`cap-${i}`"
              class="fine-print"
              >{{ text }}</small
            ></template
          >
          <small v-if="view === 'future'" class="node-delta" :title="t('planner.navigator.deltaAV')"
            >+{{ formatAV(card.delta, locale as ToolLocale) }}</small
          >
          <span v-else class="node-delta" aria-hidden="true"></span>
          <span class="node-meta">
            <span v-if="view === 'future' && capLabels(card.anchor).length" class="fine-print"
              ><span v-for="(text, i) in capLabels(card.anchor)" :key="i">{{ text }}</span></span
            >
            <span v-if="view === 'future' && refillLabel(card.anchor)" class="quiet-tag">{{
              refillLabel(card.anchor)
            }}</span>
            <span v-if="view === 'future' && validationLabel(card.anchor)" class="quiet-tag">{{
              validationLabel(card.anchor)
            }}</span>
            <span v-for="(text, i) in resourceLabels(card.anchor)" :key="i" class="fine-print">{{
              text
            }}</span>
            <span v-if="view === 'future' && spLabel(card.anchor)" class="fine-print">{{
              spLabel(card.anchor)
            }}</span>
            <span v-if="card.isCurrent" class="current-action-label">{{
              t('planner.navigator.currentAction')
            }}</span>
            <span v-if="card.anchor.kind === 'action'">{{
              t('ui.turn', { turn: formatNumber(card.anchor.turn, locale as ToolLocale) })
            }}</span>
            <small v-if="view === 'queue' && card.kind !== 'cycleBoundary'">{{
              t('planner.metadata.speed', {
                speed: formatNumber(card.effectiveSpeed, locale as ToolLocale),
              })
            }}</small>
            <SlidersHorizontal
              v-if="operationsAt(plan, card.anchor).length"
              :size="13"
              :aria-label="t('ui.configured', { count: operationsAt(plan, card.anchor).length })"
            />
          </span>
          <strong
            class="node-av"
            :title="t(view === 'future' ? 'ui.elapsedAV' : 'ui.remainingAV')"
            >{{ formatAV(card.total, locale as ToolLocale) }}</strong
          >
          <template
            v-if="
              card.speedTags.length ||
              card.changes.advance ||
              card.changes.delay ||
              card.changes.immediatelyAct
            "
          >
            <SpeedModifierTags :tags="card.speedTags" />
            <span v-if="!card.speedTags.length" class="node-no-tags" aria-hidden="true"></span>
            <span class="change-signals">
              <ArrowUp
                v-if="card.changes.advance"
                class="advance-color"
                v-tooltip="t('ui.affectedAdvance')"
                :size="20"
                :stroke-width="2"
                :aria-label="t('ui.affectedAdvance')"
              />
              <ArrowDown
                v-if="card.changes.delay"
                class="delay-color"
                v-tooltip="t('ui.affectedDelay')"
                :size="20"
                :stroke-width="2"
                :aria-label="t('ui.affectedDelay')"
              />
              <Zap
                v-if="card.changes.immediatelyAct"
                class="advance-color"
                v-tooltip="t('planner.navigator.affectedImmediate')"
                :size="20"
                :stroke-width="2"
                :aria-label="t('planner.navigator.affectedImmediate')"
              />
            </span>
          </template>
        </span>
      </button>
      <button
        v-if="blockedAction"
        class="node-card"
        :aria-pressed="anchorKey(selected) === anchorKey(blockedAction.anchor)"
        @click="emit('select', blockedAction.anchor)"
      >
        {{ cardName(blockedAction) }}
        <span v-if="blockedAction.anchor.kind === 'action'">{{
          t('ui.turn', { turn: blockedAction.anchor.turn })
        }}</span>
        <span v-for="(text, i) in resourceLabels(blockedAction.anchor)" :key="i">{{ text }}</span>
        {{ t('planner.sp.insufficient') }} · {{ spLabel(blockedAction.anchor) }} ·
        {{ formatAV(blockedAction.elapsedAV, locale as ToolLocale) }}
      </button>
      <p v-if="!cards.length && !blockedAction" class="fine-print empty-sequence">
        {{ t('ui.emptySequence') }}
      </p>
    </div>
  </section>
</template>
