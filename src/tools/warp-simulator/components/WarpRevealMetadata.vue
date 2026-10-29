<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ItemPresentation } from '../model/presentation'
import WarpVisualIcon from './WarpVisualIcon.vue'
import { revealMetadata } from './reveal-metadata'

const props = defineProps<{ item: ItemPresentation; rarity: 3 | 4 | 5; descriptionId: string }>()
const { t } = useI18n()
const metadata = computed(() => revealMetadata(props.item, props.rarity, t))
</script>

<template>
  <span class="warp-reveal-metadata">
    <span class="warp-reveal-metadata-type" aria-hidden="true">{{ metadata.kindLabel }}</span>
    <span class="warp-reveal-metadata-band" aria-hidden="true">
      <span class="warp-reveal-metadata-primary">
        <WarpVisualIcon :url="metadata.primaryIcon.icon" :label="metadata.primaryIcon.name" />
      </span>
      <span class="warp-reveal-metadata-content">
        <span class="warp-reveal-metadata-name">{{ metadata.name }}</span>
        <span class="warp-reveal-metadata-rarity">
          <WarpVisualIcon
            :image="metadata.stars"
            :reference-aspect-ratio="metadata.starsReferenceAspectRatio"
            :label="metadata.rarityLabel"
            stars
          />
        </span>
      </span>
    </span>
    <span v-if="metadata.path" class="warp-reveal-metadata-path" aria-hidden="true">
      <WarpVisualIcon :url="metadata.path.icon" :label="metadata.path.name" />
      <span>{{ metadata.path.name }}</span>
    </span>
    <span :id="descriptionId" class="warp-reveal-metadata-summary">{{ metadata.description }}</span>
  </span>
</template>

<style scoped>
.warp-reveal-metadata {
  --reveal-content-inset: max(12vw, env(safe-area-inset-left));
  --reveal-primary-size: clamp(44px, 3.8vw, 77px);
  --reveal-column-gap: clamp(6px, 0.55vw, 13px);
  --reveal-text-inset: calc(
    var(--reveal-content-inset) + var(--reveal-primary-size) + var(--reveal-column-gap)
  );
  --warp-stars-target-height: clamp(15px, 1.035vw, 20px);
  --warp-icon-align: start;
  --warp-icon-position: left center;
  position: absolute;
  z-index: 1;
  left: 0;
  top: 45.3%;
  display: grid;
  justify-items: start;
  gap: clamp(4px, 0.55vh, 8px);
  width: min(40vw, 860px);
  min-width: 0;
  color: #f5f5f7;
  line-height: 1.2;
  text-align: left;
  overflow-wrap: anywhere;
  pointer-events: none;
}
.warp-reveal-metadata-type {
  margin-left: var(--reveal-text-inset);
  padding: 2px 8px;
  background: #dfdfe4;
  color: #17191d;
  font-size: clamp(12px, 1.035vw, 20px);
  font-weight: 600;
}
.warp-reveal-metadata-band {
  display: grid;
  grid-template-columns: var(--reveal-primary-size) minmax(0, 1fr);
  align-items: center;
  column-gap: var(--reveal-column-gap);
  width: 100%;
  min-width: 0;
  padding: 6px clamp(17px, 3.3vw, 66px) 6px var(--reveal-content-inset);
  background: linear-gradient(90deg, #0008, #000c 22%, #000b 58%, #0000);
}
.warp-reveal-metadata-primary {
  --warp-icon-size: calc(var(--reveal-primary-size) * 0.88);
  --warp-icon-align: center;
  display: grid;
  place-items: center;
  align-self: center;
  width: var(--reveal-primary-size);
  height: var(--reveal-primary-size);
}
.warp-reveal-metadata-content {
  display: grid;
  gap: 4px;
  min-width: 0;
  container-type: inline-size;
}
.warp-reveal-metadata-name {
  font-size: clamp(20px, 1.56vw, 33px);
  font-weight: 600;
  text-shadow: 0 1px 3px #0008;
}
.warp-reveal-metadata-rarity {
  display: grid;
  justify-items: start;
  min-width: 0;
}
.warp-reveal-metadata-path {
  --warp-icon-size: clamp(18px, 1.24vw, 27px);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: calc(100% - var(--reveal-text-inset));
  margin-left: var(--reveal-text-inset);
  padding: 2px 5px 2px 2px;
  background: #11131b99;
  font-size: clamp(14px, 1.1vw, 23px);
}
.warp-reveal-metadata-summary {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 640px), (max-aspect-ratio: 17/20) {
  .warp-reveal-metadata {
    --reveal-content-inset: max(16px, env(safe-area-inset-left));
    --reveal-primary-size: 40px;
    --reveal-column-gap: 8px;
    --warp-stars-target-height: 15px;
    top: auto;
    bottom: max(76px, calc(env(safe-area-inset-bottom) + 56px));
    width: 100%;
    gap: 4px;
  }
  .warp-reveal-metadata-band {
    padding-right: max(20px, env(safe-area-inset-right));
  }
  .warp-reveal-metadata-name {
    font-size: clamp(16px, 4.14vw, 20px);
  }
}
@media (min-width: 641px) and (min-aspect-ratio: 17/20) and (max-height: 480px) {
  .warp-reveal-metadata {
    --reveal-content-inset: max(6vw, env(safe-area-inset-left));
    --reveal-primary-size: 37px;
    --warp-stars-target-height: 13px;
    top: 50%;
    transform: translateY(-50%);
    width: 47%;
    gap: 4px;
  }
  .warp-reveal-metadata-name {
    font-size: clamp(14px, 3.73vh, 18px);
  }
  .warp-reveal-metadata-path {
    --warp-icon-size: 17px;
    font-size: 12px;
  }
}
</style>
