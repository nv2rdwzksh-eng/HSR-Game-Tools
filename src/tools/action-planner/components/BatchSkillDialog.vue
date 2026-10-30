<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import InputNumber from 'primevue/inputnumber'
import { batchSkillCandidates, type BatchSkillFilter } from '../model/batch-skills'
import type { useActionPlanner } from '../composables/useActionPlanner'
import type { ActionSkill, EventAnchor } from '../engine/types'
const props = defineProps<{
  planner: ReturnType<typeof useActionPlanner>
  label: (id: string) => string
  anchorLabel: (anchor: EventAnchor) => string
}>()
const visible = defineModel<boolean>({ required: true })
const { t, locale } = useI18n()
const scope = ref<'all' | 'after' | 'participant'>('all')
const participantId = ref('')
const kind = ref<ActionSkill['kind']>('basic')
const cost = ref<number | undefined>(0)
const recovery = ref<number | undefined>(0)
const reviewFilter = ref<BatchSkillFilter>()
const preview = computed(() => props.planner.batchSkillPreview.value)
const choices = computed(() =>
  ['basic', 'skill', 'custom'].map((value) => ({ value, label: t(`planner.sp.${value}`) })),
)
const scopes = computed(() =>
  ['all', 'after', 'participant'].map((value) => ({ value, label: t(`planner.batch.${value}`) })),
)
const participants = computed(() =>
  [
    ...new Set(
      batchSkillCandidates(props.planner.result.value, { scope: 'all' }).map((record) => record.id),
    ),
  ].map((id) => ({ value: id, label: props.label(id) })),
)
const filter = (): BatchSkillFilter =>
  scope.value === 'after'
    ? { scope: 'after', anchor: { ...props.planner.selected.value } }
    : scope.value === 'participant'
      ? { scope: 'participant', participantId: participantId.value }
      : { scope: 'all' }
const scopeLabel = computed(() => {
  const value = reviewFilter.value ?? filter()
  return value.scope === 'after'
    ? t('planner.batch.afterLabel', { anchor: props.anchorLabel(value.anchor) })
    : value.scope === 'participant'
      ? props.label(value.participantId)
      : t('planner.batch.all')
})
watch(visible, (open) => {
  props.planner.cancelBatchSkills()
  reviewFilter.value = undefined
  if (open) {
    scope.value = 'all'
    kind.value = 'basic'
    cost.value = 0
    recovery.value = 0
    participantId.value = participants.value[0]?.value ?? ''
  }
})
function review() {
  reviewFilter.value = filter()
  const skill =
    kind.value === 'custom'
      ? { kind: 'custom', cost: cost.value, recovery: recovery.value }
      : { kind: kind.value }
  props.planner.reviewBatchSkills(reviewFilter.value, skill as ActionSkill)
}
function back() {
  props.planner.cancelBatchSkills()
  reviewFilter.value = undefined
}
function confirm() {
  if (preview.value && props.planner.confirmBatchSkills(preview.value)) visible.value = false
}
</script>
<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="t('planner.batch.title')"
    :close-button-props="{ 'aria-label': t('ui.close') }"
    :style="{ width: '600px', maxWidth: 'calc(100vw - 32px)' }"
  >
    <p class="fine-print">{{ t('planner.batch.scopeHint') }}</p>
    <p v-if="planner.batchSkillError.value" role="alert" class="field-error">
      {{ t(`planner.batch.error.${planner.batchSkillError.value}`) }}
    </p>
    <template v-if="!preview">
      <div class="field">
        <span id="batch-scope-label" class="field-label">{{ t('planner.batch.scope') }}</span
        ><SelectButton
          v-model="scope"
          :options="scopes"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-labelledby="batch-scope-label"
        />
      </div>
      <div v-if="scope === 'participant'" class="field">
        <label for="batch-participant">{{ t('planner.batch.participant') }}</label
        ><Select
          v-model="participantId"
          input-id="batch-participant"
          :options="participants"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <p>{{ scopeLabel }}</p>
      <div class="field">
        <label for="batch-kind">{{ t('planner.sp.skillLabel') }}</label
        ><Select
          v-model="kind"
          input-id="batch-kind"
          :options="choices"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
      <div v-if="kind === 'custom'" class="form-grid">
        <div class="field">
          <label for="batch-cost">{{ t('planner.sp.cost') }}</label
          ><InputNumber
            v-model="cost"
            input-id="batch-cost"
            :locale="locale"
            :use-grouping="false"
            :max-fraction-digits="20"
            :pt="{ pcInputText: { root: { 'aria-describedby': 'batch-custom-hint' } } }"
            fluid
          />
        </div>
        <div class="field">
          <label for="batch-recovery">{{ t('planner.sp.recovery') }}</label
          ><InputNumber
            v-model="recovery"
            input-id="batch-recovery"
            :locale="locale"
            :use-grouping="false"
            :max-fraction-digits="20"
            :pt="{ pcInputText: { root: { 'aria-describedby': 'batch-custom-hint' } } }"
            fluid
          />
        </div>
        <small id="batch-custom-hint" class="fine-print">{{
          t('planner.batch.invalid.skill')
        }}</small>
      </div>
    </template>
    <section v-else aria-live="polite">
      <p>{{ scopeLabel }} · {{ t(`planner.sp.${preview.skill.kind}`) }}</p>
      <p v-if="preview.skill.kind === 'custom'">
        {{
          t('planner.batch.customSummary', {
            cost: preview.skill.cost ?? t('planner.sp.unknownValue'),
            recovery: preview.skill.recovery ?? t('planner.sp.unknownValue'),
          })
        }}
      </p>
      <p>
        {{
          t('planner.batch.counts', {
            selected: preview.selectedCount,
            changed: preview.changes.length,
          })
        }}
      </p>
      <p v-if="preview.overwriteCount" class="validation-summary">
        {{ t('planner.batch.overwrite', { count: preview.overwriteCount }) }}
      </p>
      <p v-if="preview.invalid" role="alert" class="field-error">
        {{ t(`planner.batch.invalid.${preview.invalid}`) }}
      </p>
      <p v-else-if="!preview.changes.length" class="fine-print">
        {{ t('planner.batch.noChanges') }}
      </p>
      <p v-else>{{ t('planner.batch.confirmHint') }}</p>
    </section>
    <template #footer>
      <Button text severity="secondary" :label="t('ui.cancel')" @click="visible = false" />
      <Button
        v-if="preview"
        text
        severity="secondary"
        :label="t('planner.batch.back')"
        @click="back"
      />
      <Button v-if="!preview" :label="t('planner.batch.review')" @click="review" />
      <Button
        v-else
        :label="t('planner.batch.confirm')"
        :disabled="!!preview.invalid || !preview.changes.length"
        @click="confirm"
      />
    </template>
  </Dialog>
</template>
