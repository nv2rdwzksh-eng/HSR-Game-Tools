<script setup lang="ts">
import { ref, watch } from 'vue'
import { Timer, UserRound, Swords, Smile } from '@lucide/vue'
const props = defineProps<{
  src?: string
  name: string
  event?: boolean
  enemy?: boolean
  aha?: boolean
  compact?: boolean
}>()
const failed = ref(false)
watch(
  () => props.src,
  () => {
    failed.value = false
  },
)
</script>
<template>
  <img
    v-if="src && !failed"
    :src="src"
    :alt="name"
    class="game-icon"
    :class="{ 'unit-portrait-compact': compact }"
    width="48"
    height="48"
    @error="failed = true"
  /><span
    v-else
    class="event-avatar"
    :class="{ 'unit-portrait-compact': compact }"
    role="img"
    :aria-label="name"
    ><component
      :is="aha ? Smile : event ? Timer : enemy ? Swords : UserRound"
      :size="compact ? 18 : 22"
      :stroke-width="1.75"
  /></span>
</template>
