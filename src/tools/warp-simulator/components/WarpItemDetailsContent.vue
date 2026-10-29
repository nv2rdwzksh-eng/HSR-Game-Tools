<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { ItemPresentation } from '../model/presentation'

defineProps<{ entry: HistoryEntry; item: ItemPresentation; sourceLabel: string }>()
const { t } = useI18n()
</script>
<template>
  <div class="warp-details">
    <i18n-t
      :keypath="
        item.kind === 'avatar' ? 'warp.details.avatarDescription' : 'warp.details.coneDescription'
      "
      tag="p"
      scope="global"
    >
      <template #element
        ><span class="warp-details-emphasis"
          >【{{ item.elementName || t('warp.visual.unknown') }}】</span
        ></template
      >
      <template #path
        ><span class="warp-details-emphasis"
          >【{{ item.pathName || t('warp.visual.unknown') }}】</span
        ></template
      >
    </i18n-t>
    <dl>
      <dt>{{ t('warp.details.source') }}</dt>
      <dd>{{ sourceLabel }}</dd>
      <template v-if="entry.event.isUp === true">
        <dt>{{ t('warp.up') }}</dt>
        <dd>{{ t('warp.details.eventUp') }}</dd>
      </template>
      <template v-if="entry.event.rarity === 5">
        <dt>{{ t('warp.details.pity') }}</dt>
        <dd>{{ entry.event.pityBefore.pullsSinceLast5 + 1 }}</dd>
      </template>
      <dt>{{ t('warp.details.record') }}</dt>
      <dd>#{{ entry.id }}</dd>
    </dl>
  </div>
</template>
<style scoped>
.warp-details {
  color: var(--h-ink);
}
p {
  margin: 0 0 20px;
  overflow-wrap: anywhere;
}
.warp-details-emphasis {
  color: color-mix(in srgb, var(--h-gold-dark) 65%, var(--h-ink));
}
dl {
  display: grid;
  grid-template-columns: fit-content(45%) minmax(0, 1fr);
  gap: 10px 20px;
  margin: 0;
  font-size: 13px;
  text-align: left;
}
dt {
  color: var(--h-muted);
}
dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
