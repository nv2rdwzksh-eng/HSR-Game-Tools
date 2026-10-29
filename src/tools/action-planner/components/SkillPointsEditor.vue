<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import { validActionSkill } from '../engine/skill-points'
import type { ActionSkill, SkillPointsRecord } from '../engine/types'
const props = defineProps<{ skill?: ActionSkill; record?: SkillPointsRecord }>()
const emit = defineEmits<{ save: [skill?: ActionSkill] }>()
const { t } = useI18n()
const kind = ref('unknown')
const cost = ref<number | undefined>(0)
const recovery = ref<number | undefined>(0)
const invalid = ref(false)
watch(
  () => props.skill,
  (skill) => {
    kind.value = skill?.kind ?? 'unknown'
    cost.value = skill?.kind === 'custom' ? skill.cost : 0
    recovery.value = skill?.kind === 'custom' ? skill.recovery : 0
    invalid.value = false
  },
  { immediate: true },
)
const choices = computed(() =>
  ['unknown', 'basic', 'skill', 'custom'].map((value) => ({
    value,
    label: t(`planner.sp.${value}`),
  })),
)
function save() {
  const skill =
    kind.value === 'unknown'
      ? undefined
      : kind.value === 'custom'
        ? { kind: 'custom', cost: cost.value, recovery: recovery.value }
        : { kind: kind.value }
  if (skill !== undefined && !validActionSkill(skill)) {
    invalid.value = true
    return
  }
  invalid.value = false
  emit('save', skill as ActionSkill | undefined)
}
</script>
<template>
  <section class="range-section">
    <div class="field">
      <label for="sp-skill">{{ t('planner.sp.skillLabel') }}</label>
      <Select
        v-model="kind"
        input-id="sp-skill"
        :options="choices"
        option-label="label"
        option-value="value"
      />
    </div>
    <div v-if="kind === 'custom'" class="form-grid">
      <div class="field">
        <label for="sp-cost">{{ t('planner.sp.cost') }}</label
        ><InputNumber
          v-model="cost"
          input-id="sp-cost"
          :use-grouping="false"
          :invalid="invalid"
          :pt="{
            pcInputText: { root: { 'aria-describedby': invalid ? 'sp-skill-error' : undefined } },
          }"
        />
      </div>
      <div class="field">
        <label for="sp-recovery">{{ t('planner.sp.recovery') }}</label
        ><InputNumber
          v-model="recovery"
          input-id="sp-recovery"
          :use-grouping="false"
          :invalid="invalid"
          :pt="{
            pcInputText: { root: { 'aria-describedby': invalid ? 'sp-skill-error' : undefined } },
          }"
        />
      </div>
    </div>
    <small v-if="invalid" id="sp-skill-error" class="field-error">{{
      t('planner.sp.invalid')
    }}</small>
    <Button :label="t('planner.sp.save')" size="small" @click="save" />
    <p v-if="record" role="status">
      {{
        record.status !== 'unknown'
          ? t('planner.sp.balance', { before: record.before, after: record.after })
          : t(`planner.sp.${record.status}`)
      }}
      <span
        v-if="record.status === 'insufficient' || record.status === 'unverified'"
        class="quiet-tag"
        >{{ t(`planner.sp.${record.status}`) }}</span
      >
      <small>{{
        t('planner.sp.amounts', {
          paid: record.paid ?? t('planner.sp.unknownValue'),
          recovery: record.recovery ?? t('planner.sp.unknownValue'),
          overflow: record.overflow ?? t('planner.sp.unknownValue'),
        })
      }}</small>
      <span v-if="record.overflow">
        · {{ t('planner.sp.overflow', { count: record.overflow }) }}</span
      >
    </p>
    <p class="fine-print">{{ t('planner.sp.hint') }}</p>
  </section>
</template>
