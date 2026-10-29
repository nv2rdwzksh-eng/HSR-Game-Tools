<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { BookOpen, UserRound } from '@lucide/vue'
import type { ImagePresentation } from '../model/presentation'
import { useWarpRevealSource, revealPixelLimit } from '../composables/useWarpRevealSource'
import { useWarpElementSize } from '../composables/useWarpElementSize'
import { revealGeometry, type RevealCompositionProfile } from '../model/reveal-composition'

const props = withDefaults(
  defineProps<{
    preferred?: ImagePresentation
    fallbackUrl?: string
    label: string
    pixelRatio: number
    limitToSourcePixels?: boolean
    composition?: RevealCompositionProfile
    kind?: 'avatar' | 'light-cone'
    batchId: number
    entryId: number
  }>(),
  { limitToSourcePixels: true },
)
const emit = defineEmits<{ ready: [batchId: number, entryId: number] }>()
const image = useWarpRevealSource(
  () => props.preferred,
  () => props.fallbackUrl,
)
const { source, dimensions, ready } = image
const frame = ref<HTMLElement>()
const compositionFrame = computed(() => (props.composition ? frame.value : undefined))
const size = useWarpElementSize(compositionFrame)
const positioning = computed(() => {
  if (!props.composition || !dimensions.value) return limit.value
  const geometry = revealGeometry(
    size.value.width,
    size.value.height,
    dimensions.value.width,
    dimensions.value.height,
    props.composition,
    props.limitToSourcePixels ? props.pixelRatio : undefined,
  )
  return geometry
    ? Object.fromEntries(Object.entries(geometry).map(([key, value]) => [key, `${value}px`]))
    : limit.value
})
const limit = computed(() =>
  props.limitToSourcePixels && dimensions.value
    ? revealPixelLimit(dimensions.value.width, dimensions.value.height, props.pixelRatio)
    : {},
)
watch(
  ready,
  (value) => {
    if (value) emit('ready', props.batchId, props.entryId)
  },
  { immediate: true },
)
function load(event: Event) {
  const target = event.target as HTMLImageElement
  image.load(target.getAttribute('src') ?? '', target.naturalWidth, target.naturalHeight)
}
function fail(event: Event) {
  image.fail((event.target as HTMLImageElement).getAttribute('src') ?? '')
}
</script>

<template>
  <span
    ref="frame"
    class="warp-reveal-image"
    :class="{ 'warp-reveal-image-composed': composition }"
    role="img"
    :aria-label="label"
  >
    <img
      v-if="source"
      :key="source"
      :src="source"
      alt=""
      :style="positioning"
      :class="{ 'warp-reveal-image-loading': !ready }"
      @load="load"
      @error="fail"
    />
    <BookOpen
      v-else-if="kind === 'light-cone'"
      :size="36"
      :stroke-width="1.25"
      aria-hidden="true"
    />
    <UserRound v-else-if="kind === 'avatar'" :size="36" :stroke-width="1.25" aria-hidden="true" />
    <span v-else aria-hidden="true">—</span>
  </span>
</template>

<style scoped>
.warp-reveal-image {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  place-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  color: var(--color-muted);
}
.warp-reveal-image-composed {
  position: relative;
}
.warp-reveal-image-composed img {
  position: absolute;
  max-width: none;
  max-height: none;
}
img {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  object-fit: contain;
}
.warp-reveal-image-loading {
  visibility: hidden;
}
</style>
