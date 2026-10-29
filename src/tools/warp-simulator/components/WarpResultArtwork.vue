<script setup lang="ts">
import { computed, ref } from 'vue'
import { BookOpen, UserRound } from '@lucide/vue'
import type { ItemPresentation } from '../model/presentation'
import { resultPortraitFocus, portraitGeometry, type PortraitFocus } from '../model/portrait-focus'
import { useWarpRevealSource } from '../composables/useWarpRevealSource'
import { useWarpElementSize } from '../composables/useWarpElementSize'
const props = defineProps<{ item: ItemPresentation; focus?: PortraitFocus }>()
const frame = ref<HTMLElement>()
const size = useWarpElementSize(frame)
const image = useWarpRevealSource(
  () =>
    props.item.kind === 'light-cone' ? props.item.lightConePreview : props.item.resultPortrait,
  () => props.item.artworkUrl,
  () =>
    props.item.kind === 'avatar' && props.item.revealArtwork ? [props.item.revealArtwork] : [],
)
const { source, ready, dimensions } = image
const positioning = computed(() => {
  if (props.item.kind !== 'avatar' || !dimensions.value) return undefined
  const geometry = portraitGeometry(
    size.value.width,
    size.value.height,
    dimensions.value.width,
    dimensions.value.height,
    props.focus ?? resultPortraitFocus(props.item.id),
  )
  return geometry
    ? Object.fromEntries(Object.entries(geometry).map(([key, value]) => [key, `${value}px`]))
    : undefined
})
function load(event: Event) {
  const img = event.target as HTMLImageElement
  image.load(img.getAttribute('src') ?? '', img.naturalWidth, img.naturalHeight)
}
</script>

<template>
  <span
    ref="frame"
    class="warp-result-artwork"
    :class="{
      'warp-result-avatar': item.kind === 'avatar',
    }"
    role="img"
    :aria-label="item.name"
  >
    <img
      v-if="source"
      :key="source"
      :src="source"
      alt=""
      decoding="async"
      :style="positioning"
      :class="{ 'warp-result-image-loading': !ready }"
      @load="load"
      @error="image.fail(($event.target as HTMLImageElement).getAttribute('src') ?? '')"
    />
    <BookOpen v-else-if="item.kind === 'light-cone'" :size="36" aria-hidden="true" />
    <UserRound v-else :size="36" aria-hidden="true" />
  </span>
</template>

<style scoped>
.warp-result-artwork {
  position: relative;
  display: grid;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  place-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  color: #d9dfec;
}
img {
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 0;
  object-fit: cover;
  object-position: center top;
}
.warp-result-avatar img {
  position: absolute;
  max-width: none;
  padding: 0;
  object-fit: contain;
}
.warp-result-image-loading {
  visibility: hidden;
}
</style>
