<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import SelectButton from 'primevue/selectbutton'
import Popover from 'primevue/popover'
import { ArrowLeft, Layers } from '@lucide/vue'
import GameIcon from './GameIcon.vue'
import TargetGrid from './TargetGrid.vue'
import EffectFields from './EffectFields.vue'
import ParticipantFields from './ParticipantFields.vue'
import { gameData } from '../data/adapters/game-data'
import type {
  EffectOperation,
  EventAnchor,
  ParticipantInfo,
  SimulationState,
} from '../engine/types'
import type { OperationDraft } from '../model/editor'
import { provisionalOperation, operationDraft } from '../model/editor'
import { operationName } from '../model/presentation'
import {
  canUseVonwacq,
  presetOperation,
  type PresetKind,
  type KhaslanaPresetInput,
  type RobinPresetInput,
  type RobinPresetIssue,
} from '../model/presets'
import { formatNumber } from '../model/presentation'
import type { ToolLocale } from '../../../locales/types'
const draft = defineModel<OperationDraft>({ required: true })
const props = defineProps<{
  anchor: EventAnchor
  participants: ParticipantInfo[]
  preview?: SimulationState
  invalid: string[]
  resourceAllowed?: boolean
  robinPresetIssue?: RobinPresetIssue
  label: (id: string) => string
  image: (id: string) => string | undefined
}>()
const emit = defineEmits<{
  cancel: []
  submit: []
  khaslana: [input: KhaslanaPresetInput]
  robin: [input: RobinPresetInput]
}>()
const { t, locale } = useI18n()
const heading = ref<HTMLElement>()
onMounted(() => heading.value?.focus())
const types = computed(() =>
  [
    'advance',
    'delay',
    'immediatelyAct',
    'addSpeedModifier',
    'spawnParticipant',
    'depart',
    'returnToField',
    ...(props.resourceAllowed || draft.value.original?.type === 'restoreSkillPoints'
      ? ['restoreSkillPoints']
      : []),
  ].map((value) => ({
    value,
    label: t(`ui.${value}`),
  })),
)
const phases = computed(() =>
  ['preAction', 'postAction'].map((value) => ({ value, label: t(`ui.${value}`) })),
)
const provisional = computed(() => provisionalOperation(draft.value, props.anchor))
const automaticName = computed(() =>
  provisional.value
    ? operationName(provisional.value, locale.value as ToolLocale, t, props.label, props.preview)
    : t(`ui.${draft.value.type}`),
)
const popover = ref<InstanceType<typeof Popover>>()
const khaslana = ref(false)
const phainon = gameData.characters.find((character) => character.id === '1408')
const robin = gameData.characters.find((character) => character.id === '1309')
const robinError = computed(() =>
  props.invalid.find((issue) => issue.startsWith('robin:'))?.slice(6),
)
const baseSpeed = ref<number | undefined>(phainon?.baseSpeed)
const inheritancePercent = ref<number | undefined>(60)
const initialSpeed = computed(
  () => (baseSpeed.value ?? 0) * ((inheritancePercent.value ?? 0) / 100),
)
const eventTarget = computed(
  () =>
    draft.value.type === 'addSpeedModifier' &&
    draft.value.targetKind === 'participants' &&
    props.participants.some(
      (p) => p.kind === 'scheduledEvent' && draft.value.selectedIds.includes(p.id),
    ),
)
function chooseKhaslana() {
  khaslana.value = true
  popover.value?.hide()
}
function chooseRobin() {
  if (props.robinPresetIssue) return
  popover.value?.hide()
  emit('robin', { name: t('planner.robin.eventName') })
}
function submit() {
  if (!khaslana.value) emit('submit')
  else
    emit('khaslana', {
      baseSpeed: baseSpeed.value,
      inheritancePercent: inheritancePercent.value,
      names: Array.from({ length: 8 }, (_, index) =>
        index === 7
          ? t('planner.khaslana.finalName')
          : t('planner.khaslana.eventName', { index: index + 1 }),
      ),
    })
}
function preset(kind: PresetKind) {
  const actor = props.participants.find((p) => p.kind === 'actor')
  const phase = draft.value.phase
  const op: EffectOperation = {
    ...presetOperation(kind, '', actor?.id ?? ''),
    ...(props.anchor.kind === 'action' ? { phase } : {}),
  }
  const next = operationDraft(op)
  next.id = undefined
  next.original = undefined
  draft.value = next
  popover.value?.hide()
}
</script>
<template>
  <form class="operation-editor" @submit.prevent="submit">
    <div class="editor-heading">
      <Button
        v-tooltip="t('ui.back')"
        text
        rounded
        severity="secondary"
        :aria-label="t('ui.back')"
        @click="emit('cancel')"
        ><ArrowLeft :size="18" :stroke-width="1.75"
      /></Button>
      <h2 ref="heading" tabindex="-1">
        {{ khaslana ? t('planner.khaslana.name') : draft.id ? t('ui.edit') : t('ui.add') }}
      </h2>
      <Button
        v-if="!draft.id && !khaslana"
        text
        severity="secondary"
        size="small"
        class="preset-trigger"
        @click="popover?.toggle($event)"
        ><Layers :size="16" :stroke-width="1.75" />{{ t('ui.presets') }}</Button
      >
    </div>
    <p v-if="invalid.includes('form')" role="alert" class="validation-summary">
      {{ t('ui.formInvalid') }}
    </p>
    <p v-if="robinError" role="alert" class="validation-summary">
      {{ t(`planner.robin.unavailable.${robinError}`) }}
    </p>
    <p v-if="!preview" class="validation-summary" role="status">{{ t('ui.contextUnavailable') }}</p>
    <div v-if="!khaslana" class="field">
      <span id="type-label" class="field-label">{{ t('ui.type') }}</span
      ><SelectButton
        v-model="draft.type"
        size="small"
        :options="types"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        :disabled="draft.original?.type === 'spawnParticipant'"
        aria-labelledby="type-label"
        class="type-options"
      />
    </div>
    <div v-if="anchor.kind === 'action'" class="field">
      <span id="phase-label" class="field-label">{{ t('ui.phase') }}</span
      ><SelectButton
        v-model="draft.phase"
        size="small"
        :options="phases"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="phase-label"
      />
    </div>
    <template v-if="khaslana">
      <div class="field">
        <label for="khaslana-base">{{ t('planner.khaslana.baseSpeed') }}</label>
        <InputNumber
          v-model="baseSpeed"
          input-id="khaslana-base"
          :locale="locale"
          :use-grouping="false"
          :max-fraction-digits="20"
          :invalid="invalid.includes('baseSpeed')"
          :pt="{
            pcInputText: {
              root: {
                'aria-describedby': invalid.includes('baseSpeed')
                  ? 'khaslana-base-error'
                  : undefined,
              },
            },
          }"
          fluid
        />
        <small v-if="invalid.includes('baseSpeed')" id="khaslana-base-error" class="field-error">{{
          t('ui.positive')
        }}</small>
      </div>
      <div class="field">
        <label for="khaslana-ratio">{{ t('planner.khaslana.inheritance') }}</label>
        <InputNumber
          v-model="inheritancePercent"
          input-id="khaslana-ratio"
          :locale="locale"
          :use-grouping="false"
          :max-fraction-digits="20"
          :suffix="t('common.percentSuffix')"
          :invalid="invalid.includes('inheritancePercent')"
          :pt="{
            pcInputText: {
              root: {
                'aria-describedby': invalid.includes('inheritancePercent')
                  ? 'khaslana-ratio-error khaslana-hint'
                  : 'khaslana-hint',
              },
            },
          }"
          fluid
        />
        <small id="khaslana-hint" class="fine-print">{{ t('planner.khaslana.hint') }}</small>
        <small
          v-if="invalid.includes('inheritancePercent')"
          id="khaslana-ratio-error"
          class="field-error"
          >{{ t('ui.positive') }}</small
        >
      </div>
      <p class="fine-print">
        {{
          t('planner.khaslana.initialSpeed', {
            speed:
              Number.isFinite(initialSpeed) && initialSpeed > 0
                ? formatNumber(initialSpeed, locale as ToolLocale)
                : t('planner.aha.invalidPreview'),
          })
        }}
      </p>
      <small v-if="invalid.includes('speed')" class="field-error" role="alert">{{
        t('ui.positive')
      }}</small>
      <small v-if="invalid.includes('target')" class="field-error" role="alert">{{
        t('planner.khaslana.noAllies')
      }}</small>
    </template>
    <ParticipantFields
      v-else-if="draft.type === 'spawnParticipant'"
      v-model="draft"
      :invalid="invalid"
    />
    <template v-else
      ><TargetGrid
        v-if="draft.type !== 'restoreSkillPoints'"
        v-model="draft"
        :participants="participants"
        :label="label"
        :image="image"
        :invalid="invalid.includes('target')" /><EffectFields
        v-model="draft"
        :invalid="invalid"
        :event-target="eventTarget"
    /></template>
    <div v-if="!khaslana" class="field">
      <label for="custom-name">{{ t('ui.customName') }}</label
      ><InputText id="custom-name" v-model="draft.customName" :placeholder="automaticName" fluid />
    </div>
    <footer class="editor-footer">
      <div class="editor-actions">
        <Button text severity="secondary" :label="t('ui.cancel')" @click="emit('cancel')" /><Button
          type="submit"
          :label="t('ui.applyOperation')"
          :disabled="!preview"
        />
      </div>
    </footer>
    <Popover ref="popover" :pt="{ root: { 'aria-label': t('ui.presets') } }"
      ><div class="preset-list">
        <button
          v-for="p in gameData.presets"
          :key="p.id"
          type="button"
          class="preset-option"
          :disabled="p.kind === 'vonwacq' && !canUseVonwacq(anchor)"
          :title="p.kind === 'vonwacq' && !canUseVonwacq(anchor) ? t('ui.startOnly') : undefined"
          @click="preset(p.kind)"
        >
          <GameIcon
            :asset-key="p.assetKey"
            :name="p.names[locale as ToolLocale]"
            :fallback="t('planner.imageMissing')"
          /><span>{{ p.names[locale as ToolLocale] }}</span
          ><small>{{ p.kind === 'dance' ? '24%' : p.kind === 'vonwacq' ? '40%' : '25%' }}</small>
        </button>
        <button type="button" class="preset-option preset-batch" @click="chooseKhaslana">
          <GameIcon
            :asset-key="phainon?.assetKey"
            :name="t('planner.khaslana.name')"
            :fallback="t('planner.imageMissing')"
          />
          <span class="preset-copy"
            ><span>{{ t('planner.khaslana.name') }}</span
            ><small>{{ t('planner.khaslana.description') }}</small></span
          >
        </button>
        <button
          type="button"
          class="preset-option preset-batch"
          :disabled="!!robinPresetIssue"
          :aria-describedby="robinPresetIssue ? 'robin-preset-unavailable' : undefined"
          @click="chooseRobin"
        >
          <GameIcon
            :asset-key="robin?.assetKey"
            :name="t('planner.robin.name')"
            :fallback="t('planner.imageMissing')"
          />
          <span class="preset-copy"
            ><span>{{ t('planner.robin.name') }}</span
            ><small>{{ t('planner.robin.description') }}</small></span
          >
        </button>
        <small
          v-if="robinPresetIssue"
          id="robin-preset-unavailable"
          class="fine-print preset-batch"
          role="status"
          >{{ t(`planner.robin.unavailable.${robinPresetIssue}`) }}</small
        >
      </div></Popover
    >
  </form>
</template>
