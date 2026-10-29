<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectButton from 'primevue/selectbutton'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import type { OperationDraft } from '../model/editor'
import type { SpeedDurationDraft } from '../model/speed-duration-config'
const draft = defineModel<OperationDraft>({ required: true })
const props = defineProps<{ invalid: string[]; eventTarget?: boolean }>()
const { t, locale } = useI18n()
const options = (values: string[]) => values.map((value) => ({ value, label: t(`ui.${value}`) }))
const modes = computed(() => options(['flat', 'percent']))
const durations = computed(() =>
  options(props.eventTarget ? ['unlimited'] : ['turns', 'countdown']),
)
const durationKind = computed({
  get: () =>
    props.eventTarget
      ? draft.value.duration.kind === 'turns' && draft.value.duration.turns.trim() === ''
        ? 'unlimited'
        : undefined
      : draft.value.duration.kind,
  set: (kind) => {
    if (kind === 'unlimited')
      draft.value.duration = { ...draft.value.duration, kind: 'turns', turns: '' }
    else if (kind === 'turns' || kind === 'countdown') draft.value.duration.kind = kind
  },
})
let previousDuration: SpeedDurationDraft | undefined
watch(
  () => props.eventTarget,
  (eventTarget) => {
    if (draft.value.original) return
    if (eventTarget) {
      previousDuration = { ...draft.value.duration }
      durationKind.value = 'unlimited'
    } else if (previousDuration) {
      draft.value.duration = previousDuration
      previousDuration = undefined
    }
  },
  { immediate: true },
)
const outcomes = computed(() =>
  ['proc', 'no-proc'].map((value) => ({ value, label: t(`planner.sp.outcome.${value}`) })),
)
const bad = (key: string) => props.invalid.includes(key)
const pt = (key: string) => ({
  pcInputText: {
    root: {
      'aria-describedby':
        key === 'amount' && bad('effectiveSpeed')
          ? 'error-effectiveSpeed'
          : bad(key)
            ? `error-${key}`
            : undefined,
    },
  },
})
</script>
<template>
  <div v-if="draft.type === 'advance' || draft.type === 'delay'" class="field">
    <label for="effect-percent">{{ t('ui.percentValue') }}</label
    ><InputNumber
      v-model="draft.percent"
      input-id="effect-percent"
      :locale="locale"
      :max-fraction-digits="20"
      :use-grouping="false"
      :suffix="t('common.percentSuffix')"
      :invalid="bad('percent')"
      :pt="pt('percent')"
      fluid
    /><small v-if="bad('percent')" id="error-percent" class="field-error">{{
      t('ui.nonnegative')
    }}</small>
  </div>
  <template v-if="draft.type === 'restoreSkillPoints' || draft.type === 'conditionalRestore'">
    <div v-if="draft.type === 'restoreSkillPoints'" class="field">
      <label for="sp-store-overflow">{{ t('planner.sp.storeOverflow') }}</label
      ><Checkbox v-model="draft.storeOverflow" input-id="sp-store-overflow" binary />
    </div>
    <div class="field">
      <label for="sp-event-amount">{{ t('planner.sp.eventAmount') }}</label>
      <InputNumber
        v-model="draft.amount"
        input-id="sp-event-amount"
        :locale="locale"
        :use-grouping="false"
        :max-fraction-digits="20"
        :invalid="bad('spAmount')"
        :pt="pt('spAmount')"
        fluid
      />
      <small v-if="bad('spAmount')" id="error-spAmount" class="field-error">{{
        t('planner.sp.positiveInteger')
      }}</small>
    </div>
    <div class="field">
      <label for="sp-event-source">{{ t('planner.sp.eventSource') }}</label>
      <InputText
        id="sp-event-source"
        v-model="draft.source"
        :invalid="bad('spSource')"
        :aria-describedby="bad('spSource') ? 'error-spSource' : undefined"
        fluid
      />
      <small v-if="bad('spSource')" id="error-spSource" class="field-error">{{
        t('planner.sp.sourceRequired')
      }}</small>
    </div>
  </template>
  <template v-if="draft.type === 'conditionalRestore'">
    <p class="fine-print">{{ t('planner.sp.conditionalHint') }}</p>
    <div class="field">
      <label for="conditional-chance">{{ t('planner.sp.chance') }}</label
      ><InputNumber
        v-model="draft.chance"
        input-id="conditional-chance"
        :locale="locale"
        :use-grouping="false"
        :max-fraction-digits="20"
        :invalid="bad('chance')"
        :pt="pt('chance')"
        fluid
      /><small v-if="bad('chance')" id="error-chance" class="field-error">{{
        t('planner.sp.chanceInvalid')
      }}</small>
    </div>
    <div class="field">
      <label for="conditional-cooldown">{{ t('planner.sp.cooldownTurns') }}</label
      ><InputNumber
        v-model="draft.cooldownTurns"
        input-id="conditional-cooldown"
        :use-grouping="false"
        :max-fraction-digits="20"
        :invalid="bad('cooldownTurns')"
        :pt="pt('cooldownTurns')"
        fluid
      /><small v-if="bad('cooldownTurns')" id="error-cooldownTurns" class="field-error">{{
        t('planner.sp.cooldownInvalid')
      }}</small>
    </div>
    <div class="field">
      <span id="conditional-outcome" class="field-label">{{ t('planner.sp.selectedOutcome') }}</span
      ><SelectButton
        v-model="draft.outcome"
        :options="outcomes"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="conditional-outcome"
      />
    </div>
  </template>
  <template v-if="draft.type === 'addSpeedModifier'">
    <div class="field">
      <span id="mode-label" class="field-label">{{ t('ui.modifier') }}</span
      ><SelectButton
        v-model="draft.mode"
        size="small"
        :options="modes"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="mode-label"
      />
    </div>
    <div class="field">
      <label for="effect-amount">{{ t('ui.amount') }}</label
      ><InputNumber
        v-model="draft.amount"
        input-id="effect-amount"
        :locale="locale"
        :max-fraction-digits="20"
        :use-grouping="false"
        :suffix="t(draft.mode === 'percent' ? 'common.percentSuffix' : 'common.speedSuffix')"
        :invalid="bad('amount') || bad('effectiveSpeed')"
        :pt="pt('amount')"
        fluid
      /><small v-if="bad('amount')" id="error-amount" class="field-error">{{
        t('ui.finite')
      }}</small>
      <small v-if="bad('effectiveSpeed')" id="error-effectiveSpeed" class="field-error">{{
        t('ui.diagnostic.invalid-speed')
      }}</small>
    </div>
    <div class="field">
      <span id="duration-label" class="field-label">{{ t('ui.duration') }}</span
      ><SelectButton
        v-model="durationKind"
        size="small"
        :options="durations"
        option-label="label"
        option-value="value"
        :allow-empty="false"
        aria-labelledby="duration-label"
        :aria-describedby="
          eventTarget && (bad('duration') || durationKind !== 'unlimited')
            ? 'error-duration'
            : undefined
        "
      />
    </div>
    <small
      v-if="eventTarget && (bad('duration') || durationKind !== 'unlimited')"
      id="error-duration"
      class="field-error"
      role="alert"
      >{{ t('planner.eventUnlimitedOnly') }}</small
    >
    <div v-if="!eventTarget && draft.duration.kind === 'turns'" class="field">
      <label for="duration-turns">{{ t('ui.turnCount') }}</label
      ><InputText
        id="duration-turns"
        v-model="draft.duration.turns"
        inputmode="numeric"
        :placeholder="t('ui.unlimited')"
        :invalid="bad('turns')"
        :aria-describedby="bad('turns') ? 'error-turns' : undefined"
        fluid
      /><small v-if="bad('turns')" id="error-turns" class="field-error">{{
        t('ui.integer')
      }}</small>
    </div>
    <div v-else-if="!eventTarget" class="form-grid">
      <div class="field">
        <label for="countdown-name">{{ t('ui.countdownName') }}</label
        ><InputText
          id="countdown-name"
          v-model="draft.duration.countdownName"
          :invalid="bad('countdownName')"
          :aria-describedby="bad('countdownName') ? 'error-countdownName' : undefined"
          fluid
        /><small v-if="bad('countdownName')" id="error-countdownName" class="field-error">{{
          t('ui.required')
        }}</small>
      </div>
      <div class="field">
        <label for="countdown-speed">{{ t('ui.countdownSpeed') }}</label
        ><InputNumber
          v-model="draft.duration.countdownSpeed"
          input-id="countdown-speed"
          :locale="locale"
          :use-grouping="false"
          :max-fraction-digits="20"
          :invalid="bad('countdownSpeed')"
          :pt="pt('countdownSpeed')"
          fluid
        /><small v-if="bad('countdownSpeed')" id="error-countdownSpeed" class="field-error">{{
          t('ui.positive')
        }}</small>
      </div>
    </div>
  </template>
</template>
