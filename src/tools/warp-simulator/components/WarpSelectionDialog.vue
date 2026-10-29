<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Checkbox from 'primevue/checkbox'
import { HButton } from 'astral-ui/components'
import 'astral-ui/scoped-theme.css'
import '../ui/controls.css'
import Badge from 'primevue/badge'
import { Check, X } from '@lucide/vue'
import type { ToolLocale } from '../../../locales/types'
import type { createPresentation } from '../model/presentation'
import WarpItemVisual from './WarpItemVisual.vue'
const props = defineProps<{
  visible: boolean
  draft: readonly string[]
  eligibleIds: readonly string[]
  valid: boolean
  presentation: ReturnType<typeof createPresentation>
}>()
const emit = defineEmits<{
  cancel: []
  confirm: []
  'update:draft': [ids: string[]]
  'after-hide': []
}>()
const { t, locale } = useI18n()
const query = ref('')
watch(
  () => props.visible,
  (visible) => {
    if (visible) query.value = ''
  },
)
const candidates = computed(() =>
  props.presentation
    .search(props.eligibleIds, query.value)
    .map((id) => props.presentation.item(id, locale.value as ToolLocale)),
)
const unavailableChoices = computed(() =>
  props.draft
    .filter((id) => !props.eligibleIds.includes(id))
    .map((id) => props.presentation.item(id, locale.value as ToolLocale)),
)
function removeUnavailable(id: string) {
  emit(
    'update:draft',
    props.draft.filter((selected) => selected !== id),
  )
  void nextTick(() => document.getElementById('warp-character-search')?.focus())
}
</script>

<template>
  <Dialog
    :visible="visible"
    @after-hide="emit('after-hide')"
    modal
    :draggable="false"
    aria-labelledby="warp-selection-title"
    :style="{ width: '42rem', maxWidth: 'calc(100vw - 32px)' }"
    :close-button-props="{ 'aria-label': t('warp.cancel') }"
    @update:visible="
      (value) => {
        if (!value) emit('cancel')
      }
    "
  >
    <template #header>
      <div class="warp-selection-heading">
        <span id="warp-selection-title" class="warp-dialog-title">{{
          t('warp.selection.title')
        }}</span>
        <span id="warp-selection-count" aria-live="polite" aria-atomic="true">
          <Badge
            :value="t('warp.selection.count', { count: draft.length })"
            :severity="draft.length === 7 ? 'success' : 'secondary'"
          />
        </span>
      </div>
    </template>
    <div class="warp-selection">
      <label for="warp-character-search" class="warp-sr-only">{{
        t('warp.selection.search')
      }}</label>
      <InputText
        id="warp-character-search"
        v-model="query"
        class="warp-search"
        :placeholder="t('warp.selection.searchPlaceholder')"
        aria-describedby="warp-selection-count warp-selection-error"
        autofocus
      />
      <ul
        v-if="unavailableChoices.length"
        class="warp-unavailable-choices"
        :aria-label="t('warp.selection.unavailable')"
      >
        <li v-for="item in unavailableChoices" :key="item.id">
          <span>{{ item.name }}</span>
          <HButton
            class="h-theme warp-astral-button"
            variant="ghost"
            size="sm"
            :aria-label="t('warp.selection.remove', { name: item.name })"
            @click="removeUnavailable(item.id)"
          >
            <X :size="16" aria-hidden="true" />
          </HButton>
        </li>
      </ul>
      <fieldset
        class="warp-character-grid"
        aria-describedby="warp-selection-count warp-selection-error"
      >
        <legend class="warp-sr-only">{{ t('warp.selection.candidates') }}</legend>
        <label
          v-for="item in candidates"
          :key="item.id"
          :for="`warp-choice-${item.id}`"
          class="warp-character-choice"
          :class="{ selected: draft.includes(item.id) }"
        >
          <Checkbox
            :input-id="`warp-choice-${item.id}`"
            :model-value="draft"
            :value="item.id"
            :disabled="!draft.includes(item.id) && draft.length >= 7"
            :pt="{ input: { 'aria-describedby': 'warp-selection-count warp-selection-error' } }"
            @update:model-value="emit('update:draft', $event)"
          />
          <span class="warp-choice-portrait" aria-hidden="true"
            ><WarpItemVisual :item="item"
          /></span>
          <span class="warp-choice-name" :title="item.name">{{ item.name }}</span>
        </label>
      </fieldset>
      <p v-if="!candidates.length" class="warp-selection-hint">
        {{ t('warp.selection.noMatches') }}
      </p>
      <p id="warp-selection-error" class="warp-selection-hint" aria-live="polite">
        {{
          !valid
            ? t(
                unavailableChoices.length
                  ? 'warp.selection.incompatible'
                  : 'warp.selection.required',
              )
            : ''
        }}
      </p>
    </div>
    <template #footer>
      <HButton class="h-theme warp-astral-button" variant="secondary" @click="emit('cancel')">{{
        t('warp.cancel')
      }}</HButton>
      <HButton
        class="h-theme warp-astral-button"
        variant="primary"
        :disabled="!valid"
        @click="emit('confirm')"
        ><Check :size="16" aria-hidden="true" />{{ t('warp.selection.confirm') }}</HButton
      >
    </template>
  </Dialog>
</template>

<style scoped>
.warp-selection {
  min-width: 0;
}
.warp-selection-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.warp-dialog-title {
  font-size: 20px;
  font-weight: 600;
}
.warp-search {
  width: 100%;
  margin-bottom: 16px;
}
.warp-selection-hint {
  font-size: 12px;
  color: var(--color-muted);
  line-height: 1.6;
}
.warp-unavailable-choices {
  list-style: none;
  padding: 0;
  margin: 0 0 16px;
}
.warp-unavailable-choices li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 13px;
}
.warp-character-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  border: 0;
}
.warp-character-choice {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--color-line);
  border-radius: 6px;
  cursor: pointer;
}
.warp-character-choice.selected {
  border-color: var(--color-accent);
  background: color-mix(in srgb, var(--color-accent) 7%, transparent);
}
.warp-choice-portrait {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
}
.warp-choice-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.warp-sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
@media (max-width: 480px) {
  .warp-character-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
