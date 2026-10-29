<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import Popover from 'primevue/popover'
import UnitPortrait from './UnitPortrait.vue'
import type { ParticipantInfo } from '../engine/types'
import type { ToolLocale } from '../../../locales/types'
import { formatNumber } from '../model/presentation'

const props = defineProps<{
  ids?: string[]
  fallback: string
  participants: readonly ParticipantInfo[]
  label: (id: string) => string
  image: (id: string) => string | undefined
}>()
const { t, locale } = useI18n()
const popover = ref<InstanceType<typeof Popover>>()
const isEvent = (id: string) =>
  props.participants.some((p) => p.id === id && p.kind === 'scheduledEvent')
const isAha = (id: string) => props.participants.some((p) => p.id === id && p.kind === 'aha')
const isEnemy = (id: string) => props.participants.some((p) => p.id === id && p.camp === 'enemy')
</script>
<template>
  <div class="operation-targets">
    <span v-if="ids?.length === 1" class="compact-target">
      <UnitPortrait
        :src="image(ids[0]!)"
        :name="label(ids[0]!)"
        :event="isEvent(ids[0]!)"
        :aha="isAha(ids[0]!)"
        :enemy="isEnemy(ids[0]!)"
      />
      <span>{{ label(ids[0]!) }}</span>
    </span>
    <div v-else-if="ids && ids.length > 1" class="target-portraits" :aria-label="t('ui.targets')">
      <span
        v-for="id in ids.slice(0, 4)"
        :key="id"
        class="compact-target portrait-tooltip"
        tabindex="0"
        v-tooltip="label(id)"
      >
        <UnitPortrait
          :src="image(id)"
          :name="label(id)"
          :event="isEvent(id)"
          :aha="isAha(id)"
          :enemy="isEnemy(id)"
        />
      </span>
      <Button
        v-if="ids.length > 4"
        text
        size="small"
        severity="secondary"
        :aria-label="
          t('planner.target.all', { count: formatNumber(ids.length, locale as ToolLocale) })
        "
        @click="popover?.toggle($event)"
        >+{{ formatNumber(ids.length - 4, locale as ToolLocale) }}</Button
      >
      <Popover
        v-if="ids.length > 4"
        ref="popover"
        :pt="{ root: { 'aria-label': t('ui.targets') } }"
      >
        <ul class="all-targets">
          <li v-for="id in ids" :key="id" class="compact-target">
            <UnitPortrait
              :src="image(id)"
              :name="label(id)"
              :event="isEvent(id)"
              :aha="isAha(id)"
              :enemy="isEnemy(id)"
            />
            <span>{{ label(id) }}</span>
          </li>
        </ul>
      </Popover>
    </div>
    <template v-else>
      <span>{{ ids ? t('planner.target.none') : fallback }}</span>
      <span v-if="!ids" class="target-unresolved">{{ t('planner.target.unresolved') }}</span>
    </template>
  </div>
</template>
