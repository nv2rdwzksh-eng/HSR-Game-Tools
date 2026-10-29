<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { UserRound, ShieldQuestion } from '@lucide/vue'
import { useImageSource } from '../../../composables/useImageSource'
const props = defineProps<{
  source?: string
  name: string
  kind: 'role' | 'emblem' | 'trait' | 'material'
}>()
const { t } = useI18n()
const { source: visibleSource, fail } = useImageSource(() => props.source)
</script>

<template>
  <span class="currency-image">
    <img
      v-if="visibleSource"
      :src="visibleSource"
      :data-currency-kind="kind"
      :alt="name"
      width="256"
      height="256"
      @error="fail"
    />
    <span
      v-else
      class="currency-image-fallback"
      role="img"
      :aria-label="t('currencyWars.visual.missing', { name })"
      :title="name"
    >
      <UserRound v-if="kind === 'role'" :size="32" aria-hidden="true" />
      <ShieldQuestion v-else :size="18" aria-hidden="true" />
    </span>
  </span>
</template>

<style scoped>
.currency-image,
.currency-image-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
