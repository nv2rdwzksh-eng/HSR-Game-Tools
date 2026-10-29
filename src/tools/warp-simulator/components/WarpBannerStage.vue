<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { HButton } from 'astral-ui/components'
import { Sparkles, Ticket, ChevronRight } from '@lucide/vue'
import type { WarpBanner } from '../data/schema'
import type { ItemPresentation } from '../model/presentation'
import { useWarpRevealSource } from '../composables/useWarpRevealSource'
import WarpVisualIcon from './WarpVisualIcon.vue'

const props = defineProps<{
  banner?: Readonly<WarpBanner>
  item?: ItemPresentation
  hasResults: boolean
  disabled: boolean
}>()
const emit = defineEmits<{ review: [] }>()
const { t } = useI18n()
// Home-only framing for a portrait whose character occupies the lower canvas.
const homeFraming: Record<string, Record<string, string>> = {
  'avatar:1415': { '--stage-art-height': '170%', '--stage-art-y': '35%' },
}
const cone = computed(() => props.item?.kind === 'light-cone')
const artwork = useWarpRevealSource(
  () => (cone.value ? props.item?.revealArtwork : props.item?.resultPortrait),
  () => (cone.value ? props.item?.artworkUrl : undefined),
  () => (!cone.value && props.item?.revealArtwork ? [props.item.revealArtwork] : []),
)
const { source } = artwork
function fail(event: Event) {
  artwork.fail((event.target as HTMLImageElement).getAttribute('src') ?? '')
}
</script>

<template>
  <section
    class="warp-banner-stage"
    :class="{ 'warp-banner-cone': cone }"
    aria-labelledby="warp-banner-name"
  >
    <div
      class="warp-banner-art"
      :style="item ? homeFraming[item.id] : undefined"
      aria-hidden="true"
    >
      <img
        v-if="source"
        :key="source"
        class="warp-banner-image"
        :src="source"
        alt=""
        @error="fail"
      />
      <div v-else class="warp-banner-placeholder"><Ticket :size="100" :stroke-width="0.7" /></div>
    </div>
    <div class="warp-banner-info">
      <p class="warp-banner-kind">
        <Sparkles :size="17" aria-hidden="true" />{{
          banner ? t(`warp.kind.${banner.kind}`) : t('warp.title')
        }}
      </p>
      <h2 id="warp-banner-name">
        {{ item?.name ?? (banner ? t(`warp.kind.${banner.kind}`) : t('warp.noBanners')) }}
      </h2>
      <WarpVisualIcon
        v-if="item?.rarity"
        class="warp-banner-stars"
        :image="item.cardStars"
        :reference-aspect-ratio="item.cardStarsReferenceAspectRatio ?? 5"
        :label="t('warp.visual.rarity', { count: item.rarity })"
        stars
      />
      <div v-if="item" class="warp-banner-metadata">
        <span v-if="!cone && item.elementName"
          ><WarpVisualIcon :url="item.elementIconUrl" :label="item.elementName" /><span
            :style="{ color: item.elementColor }"
            >{{ item.elementName }}</span
          ></span
        >
        <span v-if="item.pathName"
          ><WarpVisualIcon :url="item.pathIconUrl" :label="item.pathName" /><span>{{
            item.pathName
          }}</span></span
        >
      </div>
      <HButton
        v-if="hasResults"
        id="warp-review-trigger"
        class="h-theme warp-astral-button warp-banner-review"
        variant="secondary"
        :disabled="disabled"
        aria-haspopup="dialog"
        @click="emit('review')"
        ><Sparkles :size="16" aria-hidden="true" />{{ t('warp.results.title')
        }}<ChevronRight :size="16" aria-hidden="true"
      /></HButton>
    </div>
  </section>
</template>

<style scoped>
.warp-banner-stage {
  position: relative;
  display: grid;
  align-items: center;
  min-width: 0;
  min-height: 0;
  isolation: isolate;
  overflow: clip;
  background:
    radial-gradient(ellipse at 70% 55%, var(--p-warp-home-glow), transparent 65%),
    var(--p-warp-home-base);
  color: var(--p-warp-home-ink);
}
.warp-banner-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.35;
  background:
    radial-gradient(circle at 12% 24%, #c8dcff 0 1px, transparent 2px),
    radial-gradient(circle at 86% 49%, #d6c68c 0 1px, transparent 2px);
  background-size:
    370px 310px,
    650px 470px;
}
.warp-banner-stage::after {
  content: '';
  position: absolute;
  width: 80%;
  aspect-ratio: 1;
  left: 20%;
  top: 50%;
  transform: translateY(-50%);
  border: 1px solid color-mix(in srgb, var(--color-accent) 20%, transparent);
  border-radius: 50%;
  pointer-events: none;
}
.warp-banner-art {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.warp-banner-image {
  position: absolute;
  left: 65%;
  top: var(--stage-art-y, 50%);
  height: var(--stage-art-height, 140%);
  width: auto;
  max-width: none;
  transform: translate(-50%, -50%);
  object-fit: contain;
}
.warp-banner-cone .warp-banner-image {
  left: 70%;
  height: 88%;
  max-width: 52%;
  filter: drop-shadow(0 12px 26px #0009);
}
.warp-banner-placeholder {
  position: absolute;
  inset: 10% 5% 10% 40%;
  display: grid;
  place-items: center;
  color: var(--color-accent);
  opacity: 0.25;
}
.warp-banner-info {
  position: relative;
  z-index: 1;
  width: 40%;
  min-width: 0;
  max-height: 100%;
  overflow: auto;
  padding: clamp(24px, 4vw, 72px);
  padding-right: 24px;
  background: linear-gradient(
    90deg,
    var(--p-warp-home-base) 25%,
    color-mix(in srgb, var(--p-warp-home-base) 78%, transparent) 70%,
    transparent
  );
}
.warp-banner-kind {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 20px;
  color: var(--color-accent);
  font-size: clamp(13px, 1.2vw, 19px);
}
.warp-banner-info h2 {
  margin: 0 0 18px;
  font-size: clamp(32px, 5.5vw, 88px);
  font-weight: 500;
  line-height: 1.15;
  overflow-wrap: anywhere;
  text-wrap: balance;
  text-shadow: 0 2px 20px #0008;
}
.warp-banner-cone .warp-banner-info {
  width: 47%;
}
.warp-banner-cone h2 {
  font-size: clamp(28px, 3.6vw, 60px);
}
.warp-banner-stars {
  --warp-stars-target-height: clamp(20px, 2vw, 30px);
}
.warp-banner-metadata,
.warp-banner-metadata > span {
  display: flex;
  align-items: center;
  gap: 12px;
}
.warp-banner-metadata {
  flex-wrap: wrap;
  gap: 16px 24px;
  margin-top: 24px;
  font-size: clamp(14px, 1.5vw, 22px);
  --warp-icon-size: 32px;
}
.warp-banner-review {
  margin-top: 36px;
}
@media (max-width: 759px) {
  .warp-banner-stage {
    grid-template-rows: minmax(260px, 1fr) auto;
    overflow: auto;
  }
  .warp-banner-art {
    position: relative;
    height: 100%;
    min-height: 260px;
    overflow: hidden;
  }
  .warp-banner-image {
    left: 50%;
    top: 50%;
    height: 125%;
  }
  .warp-banner-cone .warp-banner-image {
    left: 50%;
    height: 92%;
    max-width: 85%;
  }
  .warp-banner-placeholder {
    inset: 10%;
  }
  .warp-banner-info,
  .warp-banner-cone .warp-banner-info {
    width: 100%;
    max-height: none;
    padding: 20px 24px 28px;
    overflow: visible;
    background: linear-gradient(0deg, var(--p-warp-home-base), transparent);
  }
  .warp-banner-info h2 {
    font-size: clamp(28px, 7vw, 44px);
  }
  .warp-banner-kind {
    margin-bottom: 10px;
  }
  .warp-banner-metadata {
    margin-top: 12px;
  }
  .warp-banner-review {
    margin-top: 20px;
  }
}
@media (min-width: 760px) and (max-height: 639px) {
  .warp-banner-info {
    padding-block: 16px;
  }
  .warp-banner-info h2 {
    font-size: clamp(28px, 4vw, 52px);
  }
  .warp-banner-kind {
    margin-bottom: 10px;
  }
  .warp-banner-metadata {
    margin-top: 12px;
  }
  .warp-banner-review {
    margin-top: 18px;
  }
}
</style>
