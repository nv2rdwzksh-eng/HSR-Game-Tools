<script setup lang="ts">
import type { ItemPresentation } from '../model/presentation'
import {
  IDENTITY_EMBLEM,
  IDENTITY_PATH_MAX_SIZE,
  IDENTITY_PATH_FRACTION,
  IDENTITY_STARS,
  useWarpIdentityReady,
} from '../composables/useWarpIdentityReady'
import WarpRevealImage from './WarpRevealImage.vue'

const props = defineProps<{
  item: ItemPresentation
  batchId: number
  entryId: number
  started: boolean
  pathLabel: string
  rarityLabel: string
}>()
const emit = defineEmits<{ ready: [batchId: number, entryId: number] }>()
const partReady = useWarpIdentityReady(
  () => [props.batchId, props.entryId],
  (batchId, entryId) => emit('ready', batchId, entryId),
)
</script>

<template>
  <span class="warp-identity-viewport">
    <span
      class="warp-identity-canvas"
      :class="{ 'warp-identity-started': started }"
      :style="{
        '--identity-canvas-max-width': `${IDENTITY_PATH_MAX_SIZE / IDENTITY_PATH_FRACTION}px`,
      }"
    >
      <WarpRevealImage
        class="warp-identity-path"
        :style="{
          '--identity-delay': `${IDENTITY_EMBLEM.delay}ms`,
          '--identity-duration': `${IDENTITY_EMBLEM.duration}ms`,
        }"
        :preferred="item.revealPathIcon"
        :fallback-url="item.pathIconUrl"
        :label="pathLabel"
        :pixel-ratio="1"
        :limit-to-source-pixels="false"
        :batch-id="batchId"
        :entry-id="entryId"
        @ready="(batch, entry) => partReady('path', batch, entry)"
      />
      <span role="img" :aria-label="rarityLabel">
        <WarpRevealImage
          v-for="star in IDENTITY_STARS"
          :key="star.id"
          class="warp-identity-star"
          aria-hidden="true"
          :style="{
            left: `${star.left}%`,
            width: `${star.width}%`,
            '--identity-delay': `${star.delay}ms`,
            '--identity-duration': `${star.duration}ms`,
          }"
          :preferred="item.revealStarBig"
          label=""
          :pixel-ratio="1"
          :limit-to-source-pixels="false"
          :batch-id="batchId"
          :entry-id="entryId"
          @ready="(batch, entry) => partReady(star.id, batch, entry)"
        />
      </span>
    </span>
  </span>
</template>

<style scoped>
.warp-identity-viewport {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  container-type: size;
  pointer-events: none;
}
.warp-identity-canvas {
  position: relative;
  width: min(100cqw, calc(100cqh * 807 / 594), var(--identity-canvas-max-width));
  aspect-ratio: 807 / 594;
}
.warp-identity-canvas .warp-identity-path,
.warp-identity-canvas .warp-identity-star {
  position: absolute;
  height: auto;
  aspect-ratio: 1;
  opacity: 0;
  pointer-events: none;
}
.warp-identity-canvas .warp-identity-path {
  width: 57%;
  left: 50%;
  top: 52%;
  transform: translate(-50%, -50%);
}
.warp-identity-star {
  top: 52%;
  transform: translate(-50%, -50%) scale(0.6);
  will-change: opacity, transform, filter;
}
.warp-identity-started .warp-identity-path {
  animation: warp-identity-emblem var(--identity-duration) cubic-bezier(0.22, 0.75, 0.3, 1)
    var(--identity-delay) both;
}
.warp-identity-started .warp-identity-star {
  animation: warp-identity-ignite var(--identity-duration) cubic-bezier(0.17, 0.7, 0.3, 1)
    var(--identity-delay) both;
}
@keyframes warp-identity-emblem {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(1.09);
    filter: brightness(2.7) drop-shadow(0 0 16px rgba(255, 255, 255, 0.5));
  }
  30% {
    opacity: 0.55;
    transform: translate(-50%, -50%) scale(1.01);
    filter: brightness(1.85) drop-shadow(0 0 10px rgba(255, 255, 255, 0.2));
  }
  100% {
    opacity: 0.18;
    transform: translate(-50%, -50%) scale(1);
    filter: brightness(0.9);
  }
}
@keyframes warp-identity-ignite {
  0% {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.63);
    filter: brightness(1.3) drop-shadow(0 0 0 rgba(255, 244, 196, 0));
  }
  18% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.12);
    filter: brightness(2.65) saturate(1.06) drop-shadow(0 0 22px rgba(255, 250, 222, 0.95))
      drop-shadow(0 0 45px rgba(255, 180, 70, 0.56));
  }
  42% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.04);
    filter: brightness(1.72) drop-shadow(0 0 16px rgba(255, 230, 163, 0.75));
  }
  74% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(0.995);
    filter: brightness(1.06) drop-shadow(0 0 10px rgba(255, 199, 109, 0.38));
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
    filter: brightness(1) drop-shadow(0 0 8px rgba(255, 190, 104, 0.28));
  }
}
@media (prefers-reduced-motion: reduce) {
  .warp-identity-started .warp-identity-path,
  .warp-identity-started .warp-identity-star {
    animation: none;
  }
}
</style>
