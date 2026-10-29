<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectButton from 'primevue/selectbutton'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import type { OperationDraft } from '../model/editor'
const draft = defineModel<OperationDraft>({ required: true })
const props = defineProps<{ invalid: string[] }>()
const { t, locale } = useI18n()
const kinds = computed(() =>
  ['actor', 'scheduledEvent'].map((value) => ({ value, label: t(`ui.${value}`) })),
)
const camps = computed(() => ['ally', 'enemy'].map((value) => ({ value, label: t(`ui.${value}`) })))
const categories = computed(() =>
  ['character', 'custom', 'enemy', 'summon', 'memosprite'].map((value) => ({
    value,
    label: t(`ui.category.${value}`),
  })),
)
const bad = (key: string) => props.invalid.includes(key)
const pt = (key: string) => ({
  pcInputText: { root: { 'aria-describedby': bad(key) ? `error-${key}` : undefined } },
})
</script>
<template>
  <div class="field">
    <span id="kind-label" class="field-label">{{ t('ui.entityType') }}</span
    ><SelectButton
      v-model="draft.participant.kind"
      size="small"
      :options="kinds"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      :disabled="draft.original?.type === 'spawnParticipant'"
      aria-labelledby="kind-label"
    />
  </div>
  <div class="field">
    <label for="entity-name">{{ t('ui.entityName') }}</label
    ><InputText
      id="entity-name"
      v-model="draft.participant.name"
      :invalid="bad('name')"
      :aria-describedby="bad('name') ? 'error-name' : undefined"
      fluid
    /><small v-if="bad('name')" id="error-name" class="field-error">{{ t('ui.required') }}</small>
  </div>
  <template v-if="draft.participant.kind === 'actor'"
    ><div class="form-grid">
      <div class="field">
        <span id="camp-label" class="field-label">{{ t('ui.camp') }}</span
        ><SelectButton
          v-model="draft.participant.camp"
          size="small"
          :options="camps"
          option-label="label"
          option-value="value"
          :allow-empty="false"
          aria-labelledby="camp-label"
        />
      </div>
      <div class="field">
        <label for="entity-category">{{ t('ui.categoryLabel') }}</label
        ><Select
          v-model="draft.participant.category"
          input-id="entity-category"
          :aria-label="t('ui.categoryLabel')"
          :options="categories"
          option-label="label"
          option-value="value"
          fluid
        />
      </div>
    </div>
    <div class="form-grid">
      <div class="field">
        <label for="entity-base">{{ t('ui.baseSpeed') }}</label
        ><InputNumber
          v-model="draft.participant.baseSpeed"
          input-id="entity-base"
          :locale="locale"
          :use-grouping="false"
          :max-fraction-digits="20"
          :invalid="bad('baseSpeed')"
          :pt="pt('baseSpeed')"
          fluid
        /><small v-if="bad('baseSpeed')" id="error-baseSpeed" class="field-error">{{
          t('ui.positive')
        }}</small>
      </div>
      <div class="field">
        <label for="entity-panel">{{ t('ui.panelSpeed') }}</label
        ><InputNumber
          v-model="draft.participant.panelSpeed"
          input-id="entity-panel"
          :locale="locale"
          :use-grouping="false"
          :max-fraction-digits="20"
          :invalid="bad('panelSpeed')"
          :pt="pt('panelSpeed')"
          fluid
        /><small v-if="bad('panelSpeed')" id="error-panelSpeed" class="field-error">{{
          t('ui.positive')
        }}</small>
      </div>
    </div>
    <div class="field">
      <label for="entity-limit">{{ t('ui.actionLimit') }}</label
      ><InputText
        id="entity-limit"
        v-model="draft.participant.actionLimit"
        inputmode="numeric"
        :placeholder="t('ui.unlimited')"
        :invalid="bad('actionLimit')"
        :aria-describedby="bad('actionLimit') ? 'error-actionLimit' : undefined"
        fluid
      /><small v-if="bad('actionLimit')" id="error-actionLimit" class="field-error">{{
        t('ui.integer')
      }}</small>
    </div></template
  >
  <template v-else>
    <div class="field">
      <label for="event-base-speed">{{ t('planner.eventBaseSpeed') }}</label>
      <InputNumber
        v-model="draft.participant.eventBaseSpeed"
        input-id="event-base-speed"
        :locale="locale"
        :use-grouping="false"
        :max-fraction-digits="20"
        :invalid="bad('baseSpeed')"
        :pt="pt('baseSpeed')"
        fluid
      />
      <small v-if="bad('baseSpeed')" id="error-baseSpeed" class="field-error">{{
        t('ui.positive')
      }}</small>
    </div>
    <div class="field">
      <label for="event-speed">{{ t('ui.eventSpeed') }}</label
      ><InputNumber
        v-model="draft.participant.speed"
        input-id="event-speed"
        :locale="locale"
        :use-grouping="false"
        :max-fraction-digits="20"
        :invalid="bad('speed')"
        :pt="pt('speed')"
        fluid
      /><small v-if="bad('speed')" id="error-speed" class="field-error">{{
        t('ui.positive')
      }}</small>
    </div>
  </template>
</template>
