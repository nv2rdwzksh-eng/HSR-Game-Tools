<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { BookOpen, UserRound } from '@lucide/vue'
import type { ItemPresentation } from '../model/presentation'
import { useImageSource } from '../../../composables/useImageSource'
import { useWarpRevealSource } from '../composables/useWarpRevealSource'
const props = defineProps<{
  item: ItemPresentation
  artwork?: boolean
  crop?: boolean
  details?: boolean
}>()
const { t } = useI18n()
const { source, fail } = useImageSource(() =>
  props.artwork ? props.item.artworkUrl : (props.item.portraitUrl ?? props.item.artworkUrl),
)
const detailImage = useWarpRevealSource(
  () =>
    props.details && props.item.kind === 'light-cone' ? props.item.lightConePreview : undefined,
  () =>
    !props.details
      ? undefined
      : props.item.kind === 'avatar'
        ? props.item.portraitUrl
        : props.item.artworkUrl,
)
function failImage(event: Event) {
  if (props.details) detailImage.fail((event.target as HTMLImageElement).getAttribute('src') ?? '')
  else fail()
}
</script>

<template>
  <span
    class="warp-visual"
    :class="{
      'warp-artwork': artwork,
      'warp-crop': artwork && crop,
      'warp-cone': item.kind === 'light-cone',
      'warp-detail-visual': details,
    }"
  >
    <img
      v-if="details ? detailImage.source.value : source"
      :src="details ? detailImage.source.value : source"
      :alt="item.name"
      @error="failImage"
    />
    <span
      v-else
      class="warp-visual-fallback"
      role="img"
      :aria-label="t('warp.visual.missingImage', { name: item.name })"
    >
      <BookOpen
        v-if="item.kind === 'light-cone'"
        :size="36"
        :stroke-width="1.25"
        aria-hidden="true"
      />
      <UserRound v-else :size="36" :stroke-width="1.25" aria-hidden="true" />
    </span>
  </span>
</template>

<style scoped>
.warp-visual {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  overflow: hidden;
}
.warp-artwork.warp-cone {
  padding: 8px 12px;
}
.warp-artwork {
  position: relative;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr);
  grid-template-columns: minmax(0, 1fr);
}
.warp-artwork img {
  display: block;
  min-width: 0;
  min-height: 0;
}
.warp-artwork.warp-crop:not(.warp-cone) img {
  object-fit: cover;
  object-position: center 40%;
}
.warp-cone img {
  object-position: center;
}
.warp-detail-visual:not(.warp-cone) img {
  object-fit: cover;
}
.warp-detail-visual.warp-cone {
  padding: 8px;
}
img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.warp-visual-fallback {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 40px;
  color: var(--color-muted);
  background: color-mix(in srgb, var(--color-muted) 6%, transparent);
  border-radius: 6px;
}
</style>
