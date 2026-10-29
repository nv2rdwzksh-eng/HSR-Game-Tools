<script setup lang="ts">
import { ref, watch } from 'vue'
import { assetUrl } from '../data/adapters/game-data'
const props = defineProps<{ assetKey?: string; name: string; fallback: string }>()
const failed = ref(false)
watch(
  () => props.assetKey,
  () => {
    failed.value = false
  },
)
</script>

<template>
  <img
    v-if="!failed && assetUrl(assetKey)"
    :src="assetUrl(assetKey)"
    :alt="name"
    width="96"
    height="96"
    class="game-icon"
    @error="failed = true"
  />
  <span v-else class="icon-fallback" role="img" :aria-label="fallback">◇</span>
</template>
