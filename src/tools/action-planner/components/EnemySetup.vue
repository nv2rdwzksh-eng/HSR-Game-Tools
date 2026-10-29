<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import { Plus, Trash2 } from '@lucide/vue'
import UnitPortrait from './UnitPortrait.vue'
import { FILE_LIMITS } from '../model/document-file'
import type { EnemyDraft } from '../model/battle-setup'
const enemies = defineModel<EnemyDraft[]>({ required: true })
const props = defineProps<{ nextId: () => string; errors: string[] }>()
const emit = defineEmits<{ dirty: [] }>()
const { t, locale } = useI18n()
function add() {
  if (enemies.value.length >= 5) return
  enemies.value.push({
    id: props.nextId(),
    name: t('planner.enemy.defaultName', { number: enemies.value.length + 1 }),
    speed: undefined,
  })
  emit('dirty')
}
function remove(index: number) {
  enemies.value.splice(index, 1)
  emit('dirty')
}
</script>
<template>
  <section class="enemy-section">
    <div class="section-title">
      <h2>{{ t('planner.enemy.title') }}</h2>
      <span class="fine-print">{{ enemies.length }} / 5</span>
    </div>
    <div class="enemy-grid">
      <div v-for="(enemy, index) in enemies" :key="enemy.id" class="enemy-slot">
        <div class="enemy-portrait">
          <span
            class="camp-dot camp-dot-enemy"
            role="img"
            :aria-label="t('planner.navigator.enemy')"
          ></span
          ><UnitPortrait :name="enemy.name" enemy />
        </div>
        <div class="enemy-fields">
          <div class="field">
            <label :for="`enemy-name-${index}`">{{ t('ui.entityName') }}</label>
            <InputText
              v-model="enemy.name"
              :id="`enemy-name-${index}`"
              :maxlength="FILE_LIMITS.displayName"
              :invalid="errors.includes(`enemy-name-${index}`)"
              :aria-describedby="
                errors.includes(`enemy-name-${index}`) ? `enemy-name-error-${index}` : undefined
              "
              fluid
              @update:model-value="emit('dirty')"
            />
            <small
              v-if="errors.includes(`enemy-name-${index}`)"
              :id="`enemy-name-error-${index}`"
              class="field-error"
              >{{ t('planner.enemy.nameRequired') }}</small
            >
          </div>
          <div class="field">
            <label :for="`enemy-speed-${index}`">{{ t('planner.enemy.speed') }}</label>
            <InputNumber
              v-model="enemy.speed"
              :input-id="`enemy-speed-${index}`"
              :locale="locale"
              :use-grouping="false"
              :max-fraction-digits="20"
              :invalid="errors.includes(`enemy-speed-${index}`)"
              :pt="{
                pcInputText: {
                  root: {
                    'aria-describedby': errors.includes(`enemy-speed-${index}`)
                      ? `enemy-speed-error-${index}`
                      : undefined,
                  },
                },
              }"
              fluid
              @update:model-value="emit('dirty')"
            />
            <small
              v-if="errors.includes(`enemy-speed-${index}`)"
              :id="`enemy-speed-error-${index}`"
              class="field-error"
              >{{ t('ui.positive') }}</small
            >
          </div>
        </div>
        <Button
          text
          severity="secondary"
          v-tooltip="t('planner.enemy.remove', { name: enemy.name })"
          :aria-label="t('planner.enemy.remove', { name: enemy.name })"
          @click="remove(index)"
          ><Trash2 :size="16"
        /></Button>
      </div>
    </div>
    <Button text size="small" :disabled="enemies.length >= 5" @click="add"
      ><Plus :size="16" /><span>{{ t('planner.enemy.add') }}</span></Button
    >
  </section>
</template>
