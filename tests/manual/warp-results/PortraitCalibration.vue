<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'
import {
  warpSnapshot,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import { createPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import { portraitFocusConfig } from '../../../src/tools/warp-simulator/model/portrait-focus'
import { useWarpRevealSource } from '../../../src/tools/warp-simulator/composables/useWarpRevealSource'
import WarpResultCard from '../../../src/tools/warp-simulator/components/WarpResultCard.vue'
import { resultDisplayScenarios } from '../../fixtures/warp-simulator/result-display'
import { createPortraitCalibration, portraitPoint } from './portrait-calibration'
import type { ToolLocale } from '../../../src/locales/types'

const { t, locale } = useI18n()
const adapter = createPresentation(
  warpSnapshot,
  warpVisuals,
  import.meta.env.BASE_URL,
  warpVisualDefinitions,
)
const calibration = createPortraitCalibration(portraitFocusConfig)
const { selected, profile, focus, modified, draft } = calibration
const query = ref('')
const crosshair = ref(true)
const error = ref(false)
const options = computed(() =>
  adapter
    .search(
      warpSnapshot.items.filter((i) => i.kind === 'avatar').map((i) => i.id),
      query.value,
    )
    .map((id) => ({
      id,
      name: `${adapter.item(id, locale.value as ToolLocale).name} · ${id}${draft.value.overrides[id] || draft.value.overviewOverrides[id] ? ' · ' + t('review.calibration.configured') : ''}`,
    })),
)
const profiles = computed(() =>
  ['overview', 'default'].map((id) => ({ id, name: t(`review.calibration.${id}`) })),
)
const item = computed(() => adapter.item(selected.value, locale.value as ToolLocale))
const image = useWarpRevealSource(
  () => item.value.resultPortrait,
  () => item.value.artworkUrl,
  () => (item.value.revealArtwork ? [item.value.revealArtwork] : []),
)
const { source, dimensions } = image
const sourceFrame = ref<HTMLElement>()
const imageCanvas = ref<HTMLElement>()
const anchor = computed(() => ({
  aspectRatio: `${dimensions.value?.width ?? 1} / ${dimensions.value?.height ?? 1}`,
}))
const entry = computed(() => {
  const base = resultDisplayScenarios().find((s) => s.id === 'single-avatar-4')!.entries[0]!
  return {
    ...base,
    event: { ...base.event, itemId: selected.value, rarity: item.value.rarity!, isUp: null },
  }
})
let pointerId: number | undefined
function pick(event: PointerEvent, clamp = false) {
  const frame = imageCanvas.value,
    d = dimensions.value
  if (!frame || !d) return false
  const point = portraitPoint(
    event.clientX,
    event.clientY,
    frame.getBoundingClientRect(),
    d.width,
    d.height,
    clamp,
  )
  if (!point) return false
  error.value = !calibration.setFocus({ ...focus.value, ...point })
  return true
}
function start(event: PointerEvent) {
  if (event.button !== 0 || !pick(event)) return
  pointerId = event.pointerId
  sourceFrame.value?.setPointerCapture(pointerId)
  event.preventDefault()
}
function move(event: PointerEvent) {
  if (event.pointerId === pointerId) pick(event, true)
}
function stop(event: PointerEvent) {
  if (event.pointerId !== pointerId) return
  if (sourceFrame.value?.hasPointerCapture(event.pointerId))
    sourceFrame.value.releasePointerCapture(event.pointerId)
  pointerId = undefined
}
function update(field: 'x' | 'y' | 'scale', value: number | null | undefined) {
  error.value = !calibration.setFocus({ ...focus.value, [field]: value })
}
function load(event: Event) {
  const img = event.target as HTMLImageElement
  image.load(img.getAttribute('src') ?? '', img.naturalWidth, img.naturalHeight)
}
function exportJson() {
  const url = URL.createObjectURL(
    new Blob([calibration.exportJson()], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = 'portrait-focus.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
function reset() {
  calibration.reset()
  error.value = false
}
function restore() {
  calibration.restore()
  error.value = false
}
</script>

<template>
  <details class="portrait-calibration">
    <summary>{{ t('review.calibration.title') }}</summary>
    <p>{{ t('review.calibration.hint') }}</p>
    <p>{{ t('review.calibration.install') }}</p>
    <div class="calibration-controls">
      <InputText
        v-model="query"
        :aria-label="t('review.calibration.search')"
        :placeholder="t('review.calibration.search')"
      />
      <Select
        v-model="selected"
        :options="options"
        option-label="name"
        option-value="id"
        :aria-label="t('review.calibration.character')"
      />
      <Select
        v-model="profile"
        :options="profiles"
        option-label="name"
        option-value="id"
        :aria-label="t('review.calibration.profile')"
      />
      <span role="status">{{
        modified ? t('review.calibration.modified') : t('review.calibration.saved')
      }}</span>
    </div>
    <div class="calibration-controls">
      <label v-for="field in ['x', 'y', 'scale'] as const" :key="field" :for="`focus-${field}`">
        {{ field }}
        <InputNumber
          :model-value="focus[field]"
          @update:model-value="(value) => update(field, value)"
          :input-id="`focus-${field}`"
          :min="field === 'scale' ? 0.1 : 0"
          :max="field === 'scale' ? 8 : 1"
          :step="field === 'scale' ? 0.1 : 0.005"
          :min-fraction-digits="3"
          :max-fraction-digits="4"
          :aria-invalid="error"
          :aria-describedby="error ? 'calibration-error' : undefined"
          show-buttons
        />
      </label>
      <Button :label="t('review.calibration.reset')" @click="reset" />
      <Button :label="t('review.calibration.restore')" @click="restore" />
      <Button :label="t('review.calibration.export')" @click="exportJson" />
      <label for="calibration-crosshair" class="crosshair-control"
        ><Checkbox v-model="crosshair" binary input-id="calibration-crosshair" />{{
          t('review.calibration.crosshair')
        }}</label
      >
    </div>
    <p v-if="error" id="calibration-error" role="alert">{{ t('review.calibration.invalid') }}</p>
    <div class="calibration-preview">
      <div
        ref="sourceFrame"
        class="calibration-source"
        role="group"
        :aria-label="t('review.calibration.canvas')"
        @pointerdown="start"
        @pointermove="move"
        @pointerup="stop"
        @pointercancel="stop"
        @lostpointercapture="pointerId = undefined"
      >
        <div ref="imageCanvas" class="calibration-image-canvas" :style="anchor">
          <img
            v-if="source"
            :key="source"
            :src="source"
            :alt="item.name"
            draggable="false"
            decoding="async"
            @load="load"
            @error="image.fail(($event.target as HTMLImageElement).getAttribute('src') ?? '')"
          />
          <span
            v-if="source"
            class="calibration-anchor"
            :style="{ left: `${focus.x * 100}%`, top: `${focus.y * 100}%` }"
          />
          <span v-else>{{ t('review.calibration.unavailable') }}</span>
        </div>
      </div>
      <div class="calibration-card">
        <div class="calibration-card-frame" :class="{ 'calibration-crosshair': crosshair }">
          <WarpResultCard
            :entry="entry"
            :item="item"
            :index="0"
            :focus="focus"
            id-prefix="calibration-result"
          />
        </div>
        <pre>{{ JSON.stringify({ [selected]: focus }, null, 2) }}</pre>
      </div>
    </div>
  </details>
</template>

<style scoped>
.portrait-calibration {
  margin-block: 24px;
  border: 1px solid var(--color-line);
  padding: 20px;
}
summary {
  cursor: pointer;
  font-size: 18px;
}
.calibration-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: end;
  margin-block: 20px;
}
label {
  display: grid;
  gap: 6px;
}
.crosshair-control {
  display: flex;
  align-items: center;
}
.calibration-controls :deep(input.p-inputnumber-input) {
  width: 100px;
}
.calibration-preview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 32px;
  align-items: center;
}
.calibration-source {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  background: repeating-conic-gradient(#242a36 0% 25%, #313a48 0% 50%) 0 / 24px 24px;
  cursor: crosshair;
  touch-action: none;
}
.calibration-image-canvas {
  position: relative;
  width: 100%;
}
img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.calibration-anchor {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #000;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.calibration-card {
  min-width: 0;
}
.calibration-card-frame {
  position: relative;
}
.calibration-crosshair::after {
  content: '';
  position: absolute;
  z-index: 3;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(transparent calc(50% - 0.5px), #fff9 50%, transparent calc(50% + 0.5px)),
    linear-gradient(90deg, transparent calc(50% - 0.5px), #fff9 50%, transparent calc(50% + 0.5px));
}
pre {
  white-space: pre-wrap;
  font-size: 13px;
}
@media (max-width: 640px) {
  .calibration-preview {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
