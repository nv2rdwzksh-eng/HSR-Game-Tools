<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Tag from 'primevue/tag'
import type { ToolLocale } from '../../../locales/types'
import { renderSpeedModifierTag, type SpeedModifierTagView } from '../model/speed-modifier-tags'

const props = defineProps<{ tags: readonly SpeedModifierTagView[]; focusable?: boolean }>()
const { t, locale } = useI18n()
const rendered = computed(() =>
  props.tags.map((tag) => renderSpeedModifierTag(tag, locale.value as ToolLocale, t)),
)
</script>
<template>
  <span v-if="rendered.length" class="speed-tags">
    <span
      v-for="tag in rendered"
      :key="tag.id"
      class="speed-tag-wrapper"
      role="img"
      :aria-label="tag.description"
      :tabindex="focusable ? 0 : undefined"
      v-tooltip.focus="
        focusable ? { value: tag.description, class: 'speed-tag-tooltip' } : undefined
      "
    >
      <Tag
        :value="tag.label"
        class="speed-modifier-tag"
        :class="`speed-modifier-${tag.direction}`"
        v-tooltip="{ value: tag.tooltip, class: 'speed-tag-tooltip' }"
      />
    </span>
  </span>
</template>
