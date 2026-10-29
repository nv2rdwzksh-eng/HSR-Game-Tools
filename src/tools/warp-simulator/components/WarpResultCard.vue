<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { ItemPresentation } from '../model/presentation'
import WarpResultArtwork from './WarpResultArtwork.vue'
import type { PortraitFocus } from '../model/portrait-focus'
import WarpVisualIcon from './WarpVisualIcon.vue'
import { rarityColorVariable, resultTooltip } from './result-presentation'
const props = defineProps<{
  entry: HistoryEntry
  item: ItemPresentation
  index: number
  focus?: PortraitFocus
  idPrefix?: string
}>()
const emit = defineEmits<{ details: [entry: HistoryEntry] }>()
const { t } = useI18n()
const tooltip = computed(() => resultTooltip(props.item, props.entry.event.rarity, t))
const summary = computed(() =>
  t('warp.details.summary', {
    name: props.item.name,
    kind: t(`warp.itemKind.${props.item.kind ?? 'unknown'}`),
    rarity: props.entry.event.rarity,
    path: props.item.pathName ?? t('warp.visual.unknown'),
    element:
      props.item.kind === 'avatar'
        ? (props.item.elementName ?? t('warp.visual.unknown'))
        : t('warp.visual.notApplicable'),
  }),
)
</script>

<template>
  <Button
    :id="`${idPrefix ?? 'warp-result'}-${entry.id}`"
    v-tooltip="{
      value: tooltip,
      escape: true,
      pt: { text: { style: { whiteSpace: 'pre-line' } } },
    }"
    unstyled
    type="button"
    class="warp-result-card"
    :class="[
      `warp-rarity-${entry.event.rarity}`,
      item.kind === 'avatar' ? 'warp-character-card' : 'warp-cone-card',
    ]"
    :style="{
      '--warp-delay': `${index * 50}ms`,
      '--warp-rarity': rarityColorVariable(entry.event.rarity),
    }"
    :aria-label="t('warp.details.open', { summary })"
    aria-haspopup="dialog"
    @click="emit('details', entry)"
  >
    <span class="warp-card-visual"><WarpResultArtwork :item="item" :focus="focus" /></span>
    <span v-if="entry.event.isUp === true" class="warp-up">{{ t('warp.up') }}</span>
    <span v-if="item.kind === 'avatar'" class="warp-character-metadata">
      <WarpVisualIcon
        class="warp-card-element-icon"
        :url="item.elementIconUrl"
        :label="item.elementName ?? t('warp.visual.unknown')"
      />
      <WarpVisualIcon
        :image="item.cardStars"
        :reference-aspect-ratio="item.cardStarsReferenceAspectRatio ?? 5"
        :label="t('warp.visual.rarity', { count: entry.event.rarity })"
        stars
      />
    </span>
    <span v-else class="warp-card-metadata">
      <span class="warp-metadata-cluster">
        <span class="warp-metadata-icons">
          <WarpVisualIcon
            class="warp-card-path-icon"
            :url="item.pathIconUrl"
            :label="item.pathName ?? t('warp.visual.unknown')"
          />
        </span>
        <WarpVisualIcon
          :image="item.cardStars"
          :reference-aspect-ratio="item.cardStarsReferenceAspectRatio ?? 5"
          :label="t('warp.visual.rarity', { count: entry.event.rarity })"
          stars
        />
      </span>
    </span>
  </Button>
</template>

<style scoped>
.warp-result-card {
  --warp-edge: var(--p-warp-overview-edge-3);
  --warp-near-glow: 28%;
  --warp-outer-glow: 12%;
  --warp-glow-radius: 12px;
  --warp-glow-spread: 0px;
  position: relative;
  display: grid;
  grid-template: minmax(0, 1fr) / minmax(0, 1fr);
  width: 100%;
  aspect-ratio: 2 / 1;
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: visible;
  color: #f4f5fa;
  border: 1px solid color-mix(in srgb, var(--warp-edge) 38%, transparent);
  border-radius: 0;
  background: linear-gradient(
    165deg,
    #080c14 20%,
    color-mix(in srgb, var(--warp-edge) 17%, #101a30)
  );
  box-shadow:
    0 0 4px color-mix(in srgb, var(--warp-rarity) var(--warp-near-glow), transparent),
    0 0 var(--warp-glow-radius) var(--warp-glow-spread)
      color-mix(in srgb, var(--warp-rarity) var(--warp-outer-glow), transparent),
    inset 0 0 8px color-mix(in srgb, var(--warp-rarity) 12%, transparent);
  animation: warp-result-in 180ms ease-out both;
  animation-delay: var(--warp-delay);
}
.warp-result-card::after {
  content: '';
  position: absolute;
  z-index: 2;
  left: -1px;
  right: -1px;
  bottom: -1px;
  height: 3px;
  pointer-events: none;
  background: var(--warp-edge);
  box-shadow:
    0 0 4px var(--warp-edge),
    0 3px 12px color-mix(in srgb, var(--warp-edge) 65%, transparent);
}
.warp-rarity-4 {
  --warp-edge: var(--p-warp-overview-edge-4);
  --warp-near-glow: 95%;
  --warp-outer-glow: 62%;
  --warp-glow-radius: 26px;
  --warp-glow-spread: 2px;
  border-color: var(--warp-edge);
}
.warp-rarity-5 {
  --warp-edge: var(--p-warp-overview-edge-5);
  --warp-near-glow: 100%;
  --warp-outer-glow: 90%;
  --warp-glow-radius: 40px;
  --warp-glow-spread: 5px;
  border-width: 3px;
  border-color: var(--warp-edge);
  background: linear-gradient(
    135deg,
    color-mix(in srgb, var(--warp-edge) 24%, #17120a),
    #0c111b 65%
  );
}
.warp-result-card:hover {
  filter: brightness(1.12);
}
.warp-result-card:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 5px;
}
.warp-card-visual {
  grid-column: 1;
  grid-row: 1;
  position: relative;
  display: block;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
}
.warp-cone-card {
  grid-template-columns: minmax(0, 26%) minmax(0, 1fr);
}
.warp-cone-card .warp-card-visual {
  grid-column: 2;
}
.warp-character-metadata {
  --warp-icon-size: 36px;
  --warp-stars-target-height: 18px;
  container-type: inline-size;
  position: absolute;
  z-index: 1;
  left: 12px;
  bottom: 12px;
  display: grid;
  justify-items: start;
  gap: 5px;
  width: min(30%, 100px);
  max-width: calc(100% - 24px);
  pointer-events: none;
  filter: drop-shadow(0 1px 3px #000b);
}
.warp-character-metadata .warp-card-element-icon {
  --warp-icon-size: min(40px, 50cqi);
}
.warp-card-metadata {
  grid-column: 1;
  grid-row: 1;
  --warp-stars-target-height: 17px;
  container-type: inline-size;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  place-items: center;
  min-width: 0;
  min-height: 0;
  padding: 8px 5px;
}
.warp-metadata-cluster {
  display: grid;
  justify-items: center;
  align-content: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.warp-metadata-icons {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-width: 0;
}
.warp-card-path-icon {
  --warp-icon-size: min(44px, 56cqi);
}
.warp-up {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 6px;
  border: 1px solid color-mix(in srgb, var(--warp-rarity) 50%, transparent);
  border-radius: 4px;
  background: var(--color-page);
  font-size: 11px;
  line-height: 1.2;
  color: var(--warp-rarity);
}
@keyframes warp-result-in {
  from {
    opacity: 0;
    transform: translateY(7px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .warp-result-card {
    animation: none;
  }
}
</style>
