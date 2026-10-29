<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SelectButton from 'primevue/selectbutton'
import { Check } from '@lucide/vue'
import UnitPortrait from './UnitPortrait.vue'
import { selectableTargets } from '../engine/targeting'
import type { ParticipantInfo } from '../engine/types'
import type { OperationDraft } from '../model/editor'
const draft = defineModel<OperationDraft>({ required: true })
const props = defineProps<{
  participants: ParticipantInfo[]
  label: (id: string) => string
  image: (id: string) => string | undefined
  invalid: boolean
}>()
const { t } = useI18n()
const modes = computed(() =>
  ['participants', 'allies', 'enemies'].map((value) => ({ value, label: t(`ui.${value}`) })),
)
const allowed = computed(() =>
  draft.value.type === 'spawnParticipant' ||
  draft.value.type === 'restoreSkillPoints' ||
  draft.value.type === 'conditionalRestore'
    ? []
    : selectableTargets(draft.value.type, props.participants, draft.value.selectedIds).map(
        (p) => p.id,
      ),
)
const groups = computed(() =>
  ['ally', 'enemy', 'neutral', 'event']
    .map((kind) => ({
      kind,
      participants: props.participants.filter((p) =>
        kind === 'neutral'
          ? p.kind === 'aha'
          : kind === 'event'
            ? p.kind === 'scheduledEvent'
            : p.kind === 'actor' && p.camp === kind,
      ),
    }))
    .filter((g) => g.participants.length),
)
const missing = computed(() =>
  draft.value.selectedIds.filter((id) => !props.participants.some((p) => p.id === id)),
)
function toggle(id: string) {
  draft.value.selectedIds = draft.value.selectedIds.includes(id)
    ? draft.value.selectedIds.filter((x) => x !== id)
    : [...draft.value.selectedIds, id]
}
</script>
<template>
  <fieldset class="target-field" :aria-describedby="invalid ? 'target-error' : undefined">
    <legend>{{ t('ui.targets') }}</legend>
    <SelectButton
      v-model="draft.targetKind"
      size="small"
      :options="modes"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      :aria-label="t('ui.targetMode')"
      class="target-modes"
    /><template v-if="draft.targetKind === 'participants'"
      ><div v-for="group in groups" :key="group.kind" class="target-group">
        <span class="field-label">{{
          t(group.kind === 'neutral' ? 'planner.navigator.neutral' : `ui.${group.kind}`)
        }}</span>
        <div class="target-grid">
          <button
            v-for="p in group.participants"
            :key="p.id"
            type="button"
            class="target-button"
            :aria-label="label(p.id)"
            :title="label(p.id)"
            :aria-pressed="draft.selectedIds.includes(p.id)"
            :disabled="!draft.selectedIds.includes(p.id) && !allowed.includes(p.id)"
            @click="toggle(p.id)"
          >
            <span class="target-portrait"
              ><UnitPortrait
                :src="image(p.id)"
                :name="label(p.id)"
                :event="p.kind === 'scheduledEvent'"
                :aha="p.kind === 'aha'"
                :enemy="p.camp === 'enemy'" /><Check
                v-if="draft.selectedIds.includes(p.id)"
                class="target-check"
                :size="14" /></span
            ><span>{{ label(p.id) }}</span>
          </button>
        </div>
      </div>
      <button
        v-for="id in missing"
        :key="id"
        type="button"
        class="missing-target"
        @click="toggle(id)"
      >
        {{ t('planner.target.unavailableName', { name: label(id) }) }}
      </button></template
    ><small v-if="invalid" id="target-error" class="field-error">{{ t('ui.targetInvalid') }}</small>
  </fieldset>
</template>
