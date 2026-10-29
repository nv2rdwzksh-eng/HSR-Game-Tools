<script setup lang="ts">
import { computed } from 'vue'
import { useImageSource } from '../../../composables/useImageSource'
import type { ImagePresentation } from '../model/presentation'
const props = defineProps<{
  url?: string
  label: string
  stars?: boolean
  image?: ImagePresentation
  referenceAspectRatio?: number
}>()
const croppedStars = computed(() => props.stars && props.referenceAspectRatio !== undefined)
const { source, fail } = useImageSource(() => (croppedStars.value ? props.image?.url : props.url))
const starStyle = computed(() => {
  if (!croppedStars.value) return undefined
  const ratio =
    props.referenceAspectRatio &&
    Number.isFinite(props.referenceAspectRatio) &&
    props.referenceAspectRatio > 0
      ? props.referenceAspectRatio
      : 5
  return {
    '--warp-stars-reference-aspect': ratio,
    '--warp-stars-aspect': props.image ? props.image.width / props.image.height : ratio,
  }
})
</script>

<template>
  <span
    class="warp-icon"
    :class="{ 'warp-stars-icon': stars, 'warp-card-stars': croppedStars }"
    :style="starStyle"
    role="img"
    :aria-label="label"
  >
    <img v-if="source" :src="source" alt="" @error="fail" />
    <span v-else aria-hidden="true" class="warp-icon-missing">—</span>
  </span>
</template>

<style scoped>
.warp-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: min(var(--warp-icon-size, 24px), 100%);
  height: min(var(--warp-icon-size, 24px), 100%);
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  max-height: 100%;
  justify-self: var(--warp-icon-align, center);
  vertical-align: middle;
}
.warp-icon img {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  object-fit: contain;
  object-position: var(--warp-icon-position, center);
}
.warp-stars-icon {
  width: min(var(--warp-stars-width, 80px), 100%);
  height: auto;
  aspect-ratio: 5 / 1;
}
.warp-icon-missing {
  color: var(--color-muted);
}
.warp-card-stars {
  --warp-stars-height: min(
    var(--warp-stars-target-height, 18px),
    calc(100cqi / var(--warp-stars-reference-aspect))
  );
  width: calc(var(--warp-stars-height) * var(--warp-stars-aspect));
  height: var(--warp-stars-height);
  aspect-ratio: auto;
}
</style>
