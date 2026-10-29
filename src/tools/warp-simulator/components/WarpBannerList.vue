<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import type { ToolLocale } from '../../../locales/types'
import type { AvailableBanner } from '../model/catalog'
import type { createPresentation } from '../model/presentation'
import WarpItemVisual from './WarpItemVisual.vue'

const props = defineProps<{
  banners: readonly AvailableBanner[]
  selectedBannerId?: string
  disabled: boolean
  presentation: ReturnType<typeof createPresentation>
}>()
const emit = defineEmits<{ select: [id: string] }>()
const { t, locale } = useI18n()
const item = (id: string) => props.presentation.item(id, locale.value as ToolLocale)
function label({ banner }: AvailableBanner) {
  const featured = [banner.up5, ...(banner.up4 ?? [])]
    .filter((id): id is string => !!id)
    .map((id) => {
      const entry = item(id)
      return t('warp.featuredItem', { name: entry.name, rarity: entry.rarity ?? '' })
    })
  return [t(`warp.kind.${banner.kind}`), ...featured].join(' · ')
}
</script>

<template>
  <ul v-if="banners.length" class="warp-banner-list" :aria-label="t('warp.bannerSelect')">
    <li v-for="entry in banners" :key="entry.banner.id">
      <Button
        v-tooltip.focus.top="label(entry)"
        unstyled
        type="button"
        class="warp-banner-row"
        :class="{ selected: entry.banner.id === selectedBannerId }"
        :aria-label="label(entry)"
        :aria-pressed="entry.banner.id === selectedBannerId"
        :disabled="disabled"
        @click="emit('select', entry.banner.id)"
      >
        <span
          v-if="entry.banner.up5"
          v-tooltip.top="item(entry.banner.up5).name"
          class="warp-banner-five"
          aria-hidden="true"
          ><WarpItemVisual :item="item(entry.banner.up5)"
        /></span>
        <span v-else class="warp-banner-ordinary">{{ t(`warp.kind.${entry.banner.kind}`) }}</span>
        <span
          v-for="id in entry.banner.up4 ?? []"
          :key="id"
          v-tooltip.top="item(id).name"
          class="warp-banner-four"
          aria-hidden="true"
          ><WarpItemVisual :item="item(id)"
        /></span>
      </Button>
    </li>
  </ul>
  <p v-else class="warp-banner-empty">{{ t('warp.noBanners') }}</p>
</template>

<style scoped>
.warp-banner-list {
  list-style: none;
  margin: 0;
  padding: 12px 3px;
}
.warp-banner-list li + li {
  margin-top: 8px;
}
.warp-banner-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-width: 0;
  min-height: 108px;
  padding: 9px;
  border: 1px solid var(--color-line);
  border-radius: 8px;
  background: transparent;
  color: var(--color-ink);
  cursor: pointer;
}
.warp-banner-row:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent) 5%, transparent);
}
.warp-banner-row.selected {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  box-shadow: inset 3px 0 var(--color-accent);
}
.warp-banner-row:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
.warp-banner-row:disabled {
  opacity: 0.6;
  cursor: default;
}
.warp-banner-five,
.warp-banner-four {
  display: block;
  min-width: 0;
  aspect-ratio: 1;
  border: 1px solid;
  border-radius: 6px;
  overflow: hidden;
}
.warp-banner-five {
  flex: 0 1 88px;
  border-color: var(--p-warp-rarity-5);
}
.warp-banner-four {
  flex: 0 1 52px;
  border-color: var(--p-warp-rarity-4);
}
.warp-banner-ordinary {
  padding: 12px;
  font-size: 14px;
}
.warp-banner-empty {
  color: var(--color-muted);
  font-size: 12px;
}
</style>
