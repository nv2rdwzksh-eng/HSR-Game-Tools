<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import SkillPointsEditor from './SkillPointsEditor.vue'
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Gauge,
  Timer,
  Zap,
  UserRoundPlus,
  Flag,
  LogOut,
  LogIn,
} from '@lucide/vue'
import UnitPortrait from './UnitPortrait.vue'
import SpeedModifierTags from './SpeedModifierTags.vue'
import { actionSpeedModifierTags, type CountdownSources } from '../model/speed-modifier-tags'
import OperationEditor from './OperationEditor.vue'
import OperationTargets from './OperationTargets.vue'
import { effectiveSpeed } from '../engine/queue'
import { phaseOperations } from '../engine/effect-config'
import { usesSkillPoints } from '../engine/skill-points'
import type {
  ParticipantInfo,
  ActionSkill,
  NodeRecord,
  SkillPointEventRecord,
  SkillPointMaxChange,
  EffectOperation,
  EventAnchor,
  SimulationState,
} from '../engine/types'
import { formatAV, formatNumber, renderMessage } from '../model/presentation'
import type { ToolLocale } from '../../../locales/types'
import type { OperationDraft } from '../model/editor'
import type { KhaslanaPresetInput, RobinPresetInput, RobinPresetIssue } from '../model/presets'
import { operationMetadata, type MetadataField } from '../model/metadata'
const props = defineProps<{
  countdownSources: CountdownSources
  ahaId: string
  spEnabled?: boolean
  skill?: ActionSkill
  spRecord?: NodeRecord
  resourceRecords?: SkillPointEventRecord[]
  maxChanges?: SkillPointMaxChange[]
  uncommittedResources?: boolean
  anchor: EventAnchor
  inactive?: boolean
  operations: EffectOperation[]
  context?: SimulationState
  preview?: SimulationState
  targets: ParticipantInfo[]
  invalid: string[]
  robinPresetIssue?: RobinPresetIssue
  label: (id: string) => string
  image: (id: string) => string | undefined
  anchorLabel: (a: EventAnchor) => string
  title: (o: EffectOperation, s?: SimulationState) => string
  operationContext: (o: EffectOperation) => SimulationState | undefined
}>()
const draft = defineModel<OperationDraft>('draft')
const emit = defineEmits<{
  skill: [skill?: ActionSkill]
  edit: [operation?: EffectOperation]
  remove: [id: string]
  move: [id: string, delta: -1 | 1]
  cancel: []
  submit: []
  khaslana: [input: KhaslanaPresetInput]
  robin: [input: RobinPresetInput]
}>()
const { t, locale } = useI18n()
const skillParticipant = computed(() => {
  const anchor = props.anchor
  return anchor.kind === 'action'
    ? props.context?.participants.find((p) => p.id === anchor.participantId)
    : undefined
})
const skillExcluded = computed(
  () =>
    skillParticipant.value?.kind === 'actor' &&
    skillParticipant.value.camp === 'ally' &&
    !usesSkillPoints(skillParticipant.value),
)
const groups = computed(() =>
  props.anchor.kind === 'action'
    ? ['preAction', 'postAction'].map((phase) => ({
        phase,
        operations: phaseOperations(props.operations, phase as 'preAction' | 'postAction'),
      }))
    : [{ phase: '', operations: props.operations }],
)
const currentSpeed = computed(() => {
  const anchor = props.anchor
  const participant =
    anchor.kind === 'start' || anchor.kind === 'cycleBoundary'
      ? undefined
      : props.context?.participants.find((p) => p.id === anchor.participantId)
  return participant && props.context ? effectiveSpeed(participant, props.context) : undefined
})
const speedTags = computed(() =>
  actionSpeedModifierTags(props.anchor, props.context, props.countdownSources),
)
const currentIsAha = computed(() => {
  const anchor = props.anchor
  return (
    (anchor.kind === 'action' || anchor.kind === 'trigger') && anchor.participantId === props.ahaId
  )
})
const overview = ref<HTMLElement>()
watch(
  () => !!draft.value,
  async (editing, was) => {
    if (!editing && was) {
      await nextTick()
      overview.value?.focus()
    }
  },
)
const icon = (o: EffectOperation) =>
  o.type === 'advance'
    ? ArrowUp
    : o.type === 'delay'
      ? ArrowDown
      : o.type === 'immediatelyAct'
        ? Zap
        : o.type === 'addSpeedModifier'
          ? Gauge
          : o.type === 'restoreSkillPoints' || o.type === 'conditionalRestore'
            ? Zap
            : o.type === 'depart'
              ? LogOut
              : o.type === 'returnToField'
                ? LogIn
                : o.participant.kind === 'actor'
                  ? UserRoundPlus
                  : Timer
const metadata = computed(
  () =>
    new Map(
      props.operations.map((operation) => {
        const state = props.operationContext(operation)
        return [
          operation.id,
          {
            ...operationMetadata(operation, props.label, state),
            participants: state?.participants ?? [],
          },
        ] as const
      }),
    ),
)
const metadataOf = (o: EffectOperation) => metadata.value.get(o.id)!
const fieldIcon = (field: MetadataField, operation: EffectOperation) =>
  field.kind === 'effect'
    ? icon(operation)
    : field.kind === 'speed'
      ? Gauge
      : field.kind === 'duration' || field.kind === 'countdown'
        ? Timer
        : undefined
</script>
<template>
  <section class="inspector" :aria-label="t('ui.inspector')">
    <div class="pane-heading">
      <h2>{{ t('ui.inspector') }}</h2>
    </div>
    <SkillPointsEditor
      v-if="spEnabled && anchor.kind === 'action' && !skillExcluded"
      :key="JSON.stringify(anchor)"
      :skill="skill"
      :record="spRecord?.kind !== 'cycleBoundary' ? spRecord?.skillPoints : undefined"
      @save="emit('skill', $event)"
    />
    <p v-if="spEnabled && skillExcluded" class="fine-print">
      {{ t('planner.sp.notParticipating') }}
    </p>
    <p v-if="spRecord?.refill" class="fine-print">
      {{
        t('planner.sp.refillDetail', {
          amount: spRecord.refill.amount,
          before: spRecord.refill.before,
          after: spRecord.refill.after,
          storedBefore: spRecord.refill.storedBefore,
          storedAfter: spRecord.refill.storedAfter,
        })
      }}
    </p>
    <p v-for="(change, index) in maxChanges" :key="index" class="fine-print">
      {{ t('planner.sp.maxChange', { beforeMax: change.beforeMax, afterMax: change.afterMax })
      }}<span v-if="change.loss">
        ·
        {{
          t('planner.sp.clamp', { before: change.before, after: change.after, loss: change.loss })
        }}</span
      >
    </p>
    <OperationEditor
      v-if="draft"
      v-model="draft"
      :anchor="anchor"
      :resource-allowed="
        anchor.kind === 'start' ||
        (anchor.kind === 'action' &&
          !!context?.participants.some(
            (p) =>
              anchor.kind === 'action' &&
              p.id === anchor.participantId &&
              p.kind === 'actor' &&
              p.camp === 'ally',
          ))
      "
      :participants="targets"
      :preview="preview"
      :invalid="invalid"
      :skill="skill"
      :skill-excluded="skillExcluded"
      :robin-preset-issue="robinPresetIssue"
      :label="label"
      :image="image"
      @cancel="emit('cancel')"
      @submit="emit('submit')"
      @khaslana="emit('khaslana', $event)"
      @robin="emit('robin', $event)"
    />
    <div v-else class="inspector-overview">
      <div class="current-node">
        <span v-if="anchor.kind === 'cycleBoundary'" class="event-avatar"
          ><Flag :size="22" :stroke-width="1.75"
        /></span>
        <UnitPortrait
          v-if="anchor.kind === 'action' || anchor.kind === 'trigger'"
          :src="image(anchor.participantId)"
          :name="label(anchor.participantId)"
          :event="anchor.kind === 'trigger'"
          :aha="currentIsAha"
        />
        <div class="current-identity">
          <h2 ref="overview" tabindex="-1">{{ anchorLabel(anchor) }}</h2>
          <span v-if="currentSpeed !== undefined" class="fine-print current-speed"
            >{{ t('ui.currentSpeed') }}
            {{
              t('planner.metadata.speed', {
                speed: formatNumber(currentSpeed, locale as ToolLocale),
              })
            }}</span
          >
          <SpeedModifierTags :tags="speedTags" focusable class="inspector-speed-tags" />
        </div>
        <div v-if="context" class="current-av">
          <strong>{{
            t('common.av', { value: formatAV(context.elapsedAV, locale as ToolLocale) })
          }}</strong>
        </div>
      </div>
      <p v-if="!context" class="validation-summary">
        {{ t(inactive ? 'planner.cycle.disabled' : 'ui.contextUnavailable') }}
      </p>
      <div class="operations-heading">
        <h3>
          {{ t('ui.operations') }}
          <span class="operation-count">{{
            formatNumber(operations.length, locale as ToolLocale)
          }}</span>
        </h3>
        <Button size="small" :disabled="!context" @click="emit('edit')"
          ><Plus :size="16" :stroke-width="1.75" />{{ t('ui.add') }}</Button
        >
      </div>
      <div v-if="!operations.length" class="empty-operations">
        <p>{{ t('ui.emptyOperations') }}</p>
      </div>
      <div v-for="group in groups" :key="group.phase" class="operation-group">
        <h3 v-if="group.phase && group.operations.length" class="phase-heading">
          {{ t(`ui.${group.phase}`) }}
        </h3>
        <div class="operation-list">
          <article
            v-for="(op, index) in group.operations"
            :key="op.id"
            class="operation-card"
            :data-operation="op.id"
          >
            <div class="operation-top">
              <component
                :is="icon(op)"
                :size="18"
                :stroke-width="1.75"
                :class="
                  op.type === 'advance'
                    ? 'advance-color'
                    : op.type === 'delay'
                      ? 'delay-color'
                      : 'muted'
                "
              /><button class="operation-title" :disabled="!context" @click="emit('edit', op)">
                {{ title(op, operationContext(op)) }}
              </button>
              <div class="card-controls">
                <Button
                  v-tooltip="t('ui.moveUp')"
                  text
                  size="small"
                  severity="secondary"
                  :disabled="index === 0"
                  :aria-label="t('ui.moveUp')"
                  @click="emit('move', op.id, -1)"
                  ><ArrowUp :size="15" /></Button
                ><Button
                  v-tooltip="t('ui.moveDown')"
                  text
                  size="small"
                  severity="secondary"
                  :disabled="index === group.operations.length - 1"
                  :aria-label="t('ui.moveDown')"
                  @click="emit('move', op.id, 1)"
                  ><ArrowDown :size="15" /></Button
                ><Button
                  v-tooltip="t('ui.edit')"
                  text
                  size="small"
                  severity="secondary"
                  :disabled="!context"
                  :aria-label="
                    t('planner.accessibility.edit', { name: title(op, operationContext(op)) })
                  "
                  @click="emit('edit', op)"
                  ><Pencil :size="15" /></Button
                ><Button
                  v-tooltip="t('ui.remove')"
                  text
                  size="small"
                  severity="secondary"
                  :aria-label="
                    t('planner.accessibility.remove', { name: title(op, operationContext(op)) })
                  "
                  @click="emit('remove', op.id)"
                  ><Trash2 :size="15"
                /></Button>
              </div>
            </div>
            <OperationTargets
              v-if="
                op.type !== 'spawnParticipant' &&
                op.type !== 'restoreSkillPoints' &&
                op.type !== 'conditionalRestore'
              "
              :ids="metadataOf(op).targetIds"
              :fallback="renderMessage(metadataOf(op).target!, locale as ToolLocale, t)"
              :participants="metadataOf(op).participants"
              :label="label"
              :image="image"
            />
            <p v-if="resourceRecords?.some((r) => r.operationId === op.id)" class="fine-print">
              <template
                v-for="entry in resourceRecords?.filter((r) => r.operationId === op.id)"
                :key="entry.operationId"
              >
                {{
                  entry.after === null
                    ? t('planner.sp.unknown')
                    : t(
                        entry.committed === false
                          ? 'planner.sp.candidateResult'
                          : 'planner.sp.eventResult',
                        {
                          restored: entry.restored,
                          overflow: entry.overflow,
                          stored: entry.stored ?? t('planner.sp.unknownValue'),
                          wasted: entry.wasted ?? t('planner.sp.unknownValue'),
                          storedAfter: entry.storedAfter ?? t('planner.sp.unknownValue'),
                        },
                      )
                }}
              </template>
            </p>
            <p
              v-if="uncommittedResources && op.type === 'restoreSkillPoints'"
              class="fine-print"
              role="status"
            >
              {{ t('planner.sp.uncommitted') }}
            </p>
            <p
              v-for="entry in spRecord?.conditionalRestores?.filter((r) => r.operationId === op.id)"
              :key="entry.operationId"
              class="fine-print"
              role="status"
            >
              {{
                entry.status === 'proc'
                  ? t('planner.sp.procResult', { turn: entry.availableFromTurn })
                  : t(`planner.sp.conditionalStatus.${entry.status}`)
              }}
              ·
              {{
                t('planner.sp.eventResult', {
                  restored: entry.restored ?? t('planner.sp.unknownValue'),
                  overflow: entry.overflow ?? t('planner.sp.unknownValue'),
                  stored: entry.stored ?? t('planner.sp.unknownValue'),
                  wasted: entry.wasted ?? t('planner.sp.unknownValue'),
                  storedAfter: entry.storedAfter ?? t('planner.sp.unknownValue'),
                })
              }}
            </p>
            <p v-if="uncommittedResources && op.type === 'conditionalRestore'" class="fine-print">
              {{ t('planner.sp.uncommitted') }}
            </p>
            <div class="operation-metadata">
              <span
                v-for="(field, fieldIndex) in metadataOf(op).fields"
                :key="fieldIndex"
                class="metadata-parameter"
                :class="`metadata-${field.kind}`"
              >
                <component
                  v-if="fieldIcon(field, op)"
                  :is="fieldIcon(field, op)"
                  :size="15"
                  :stroke-width="1.75"
                  aria-hidden="true"
                />
                <span>{{ renderMessage(field.message, locale as ToolLocale, t) }}</span>
              </span>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>
