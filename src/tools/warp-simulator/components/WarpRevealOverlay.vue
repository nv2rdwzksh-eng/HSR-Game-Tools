<script setup lang="ts">
import { computed, nextTick, ref, shallowRef, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { X } from '@lucide/vue'
import type { HistoryEntry } from '../composables/useWarpSimulator'
import { REVEAL_TIMING, type RevealPhase } from '../composables/useWarpReveal'
import type { ItemPresentation, createPresentation } from '../model/presentation'
import WarpRevealImage from './WarpRevealImage.vue'
import WarpRevealIdentity from './WarpRevealIdentity.vue'
import WarpRevealMetadata from './WarpRevealMetadata.vue'
import WarpResultBackground from './WarpResultBackground.vue'
import WarpResultsWall from './WarpResultsWall.vue'
import WarpResultCard from './WarpResultCard.vue'
import WarpItemDetails from './WarpItemDetails.vue'
import { showRevealMetadata } from './reveal-metadata'
import { useWarpPixelRatio } from '../composables/useWarpPixelRatio'
import { revealComposition } from '../model/reveal-composition'
import type { ToolLocale } from '../../../locales/types'

const props = defineProps<{
  mode?: 'reveal' | 'review'
  visible: boolean
  reviewRevision?: number
  batchId?: number
  entry?: HistoryEntry
  item?: ItemPresentation
  entries?: readonly HistoryEntry[]
  presentation?: ReturnType<typeof createPresentation>
  sourceLabel?: string
  sourceLabelForEntry?: (entry: HistoryEntry) => string
  phase: RevealPhase
  artworkReady: boolean
  identityReady: boolean
}>()
const emit = defineEmits<{
  'review-close': []
  'review-after-hide': [batchId?: number, revision?: number]
  activate: []
  escape: []
  'after-hide': [batchId?: number]
  'artwork-ready': [batchId: number, entryId: number]
  'identity-ready': [batchId: number, entryId: number]
}>()
const { t, locale } = useI18n()
const pixelRatio = useWarpPixelRatio()
const screen = ref<{ $el: HTMLButtonElement }>()
const overviewClose = ref<{ $el: HTMLButtonElement }>()
const maskId = useId()
const detailActive = ref(false)
const detailZIndex = ref(1001)
const detailContext = ref(0)
let detailOrigin: number | undefined
function resetDetails() {
  detailContext.value++
  details.value = undefined
  detailActive.value = false
  detailOrigin = undefined
}
const details = shallowRef<HistoryEntry>()
const leavingStage = ref<RevealPhase>('artwork')
let hiddenBatch: number | undefined
let hiddenRevision: number | undefined
let hiddenMode: 'reveal' | 'review' | undefined
watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      hiddenBatch = props.batchId ?? props.entry?.batchId
      hiddenMode = props.mode
      hiddenRevision = props.reviewRevision
      resetDetails()
    }
  },
  { flush: 'sync' },
)
watch(
  () => props.phase,
  (next, previous) => {
    if (next === 'leaving') leavingStage.value = previous
    if (next === 'overview') void nextTick(focusScreen)
  },
  { flush: 'sync' },
)
watch(
  () => [props.batchId, props.mode, props.reviewRevision],
  () => {
    resetDetails()
  },
  { flush: 'sync' },
)
const stage = computed(() => (props.phase === 'leaving' ? leavingStage.value : props.phase))
const overview = computed(() => props.mode === 'review' || stage.value === 'overview')
function closeResults() {
  if (!props.visible || detailActive.value) return
  if (props.mode === 'review') emit('review-close')
  else emit('escape')
}
function afterHide() {
  if (hiddenMode === 'review') emit('review-after-hide', hiddenBatch, hiddenRevision)
  else emit('after-hide', hiddenBatch)
}
const metadataVisible = computed(() => showRevealMetadata(stage.value, props.artworkReady))
const metadataDescriptionId = computed(
  () => `warp-reveal-metadata-${props.entry?.batchId}-${props.entry?.id}`,
)
const detailItem = computed(
  () =>
    details.value &&
    props.presentation?.item(details.value.event.itemId, locale.value as ToolLocale),
)
const hint = computed(() =>
  t(
    props.phase === 'artwork' && !props.artworkReady
      ? 'warp.reveal.loading'
      : props.phase === 'waiting'
        ? 'warp.reveal.continue'
        : 'warp.reveal.skip',
  ),
)
const dialogLabel = computed(() =>
  overview.value
    ? t('warp.results.overviewTitle')
    : t('warp.reveal.title', { name: props.item?.name ?? t('warp.visual.unknown') }),
)
function focusScreen() {
  void nextTick(() => {
    if (!props.visible || detailActive.value) return
    ;(overview.value ? overviewClose.value : screen.value)?.$el.focus({ preventScroll: true })
  })
}
function openDetails(entry: HistoryEntry) {
  if (!props.visible || detailActive.value) return
  const mask = document.getElementById(maskId)
  const parentZIndex = mask ? Number(getComputedStyle(mask).zIndex) : 1000
  detailZIndex.value = (Number.isFinite(parentZIndex) ? parentZIndex : 1000) + 1
  detailOrigin = entry.id
  detailActive.value = true
  details.value = entry
}
function afterDetailsLeave() {
  if (details.value) return
  const origin = detailOrigin
  const context = detailContext.value
  detailActive.value = false
  detailOrigin = undefined
  void nextTick(() => {
    if (!props.visible || detailActive.value || context !== detailContext.value) return
    const card = document.getElementById(`warp-overview-result-${origin}`)
    const target = card ?? overviewClose.value?.$el
    if (target?.isConnected) target.focus({ preventScroll: true })
  })
}
function clickOverview(event: MouseEvent) {
  if (
    !overview.value ||
    (props.mode !== 'review' && props.phase !== 'overview') ||
    detailActive.value ||
    event.defaultPrevented
  )
    return
  const target = event.target as Element | null
  if (
    !target ||
    target.closest(
      '.warp-overview-header, button, a, input, select, textarea, [role="button"], [contenteditable="true"]',
    )
  )
    return
  closeResults()
}
function keydown(event: KeyboardEvent) {
  if (detailActive.value) return
  if (event.repeat && ['Escape', 'Enter', ' '].includes(event.key)) event.preventDefault()
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  if (event.repeat) return
  closeResults()
}
</script>

<template>
  <Dialog
    unstyled
    modal
    block-scroll
    append-to="body"
    :visible="visible"
    :draggable="false"
    :closable="false"
    :close-on-escape="false"
    :dismissable-mask="false"
    :show-header="false"
    :aria-label="dialogLabel"
    :pt="{
      mask: { id: maskId, class: 'warp-reveal-mask' },
      root: {
        class: 'warp-reveal-dialog',
        'aria-labelledby': undefined,
        inert: detailActive,
        'aria-hidden': detailActive ? 'true' : undefined,
      },
      transition: { css: false },
    }"
    @show="focusScreen"
    @after-hide="afterHide"
  >
    <template #container>
      <div
        class="warp-reveal-shell"
        :style="{ '--reveal-fade': `${REVEAL_TIMING.fade}ms` }"
        @keydown="keydown"
      >
        <WarpResultBackground v-if="mode === 'review' || stage !== 'identity'" />
        <section
          v-if="overview && presentation"
          class="warp-overview"
          aria-labelledby="warp-overview-title"
          aria-describedby="warp-overview-description"
          :inert="detailActive"
          :class="{ 'warp-reveal-leaving': mode !== 'review' && phase === 'leaving' }"
          @click="clickOverview"
        >
          <header class="warp-overview-header">
            <div>
              <h2 id="warp-overview-title">{{ t('warp.results.overviewTitle') }}</h2>
              <p id="warp-overview-description" class="warp-overview-description">
                {{ sourceLabel }} · {{ t('warp.results.count', { count: entries?.length ?? 0 }) }}
              </p>
            </div>
            <Button
              ref="overviewClose"
              unstyled
              class="warp-reveal-close"
              :aria-label="t('warp.results.close')"
              @click="closeResults"
              ><X :size="30" aria-hidden="true"
            /></Button>
          </header>
          <WarpResultsWall
            v-if="entries?.length === 10"
            :entries="entries ?? []"
            :presentation="presentation"
            @details="openDetails"
          />
          <div v-else class="warp-review-single">
            <WarpResultCard
              v-for="(result, index) in entries ?? []"
              :key="`${result.batchId}:${result.id}`"
              :entry="result"
              :item="presentation.item(result.event.itemId, locale as ToolLocale)"
              :index="index"
              id-prefix="warp-overview-result"
              @details="openDetails"
            />
          </div>
        </section>
        <Button
          v-else
          ref="screen"
          unstyled
          type="button"
          class="warp-reveal-screen"
          :class="{
            'warp-reveal-leaving': mode !== 'review' && phase === 'leaving',
            'warp-reveal-full-canvas': stage !== 'identity',
          }"
          :aria-label="
            t('warp.reveal.action', { name: item?.name ?? t('warp.visual.unknown'), action: hint })
          "
          :aria-describedby="metadataVisible && entry && item ? metadataDescriptionId : undefined"
          @click="emit('activate')"
        >
          <span
            v-if="entry && item"
            :key="`${entry.batchId}:${entry.id}`"
            class="warp-reveal-stage"
          >
            <WarpRevealIdentity
              v-if="stage === 'identity'"
              :item="item"
              :batch-id="entry.batchId"
              :entry-id="entry.id"
              :started="identityReady"
              :path-label="item.pathName ?? t('warp.visual.unknown')"
              :rarity-label="t('warp.visual.rarity', { count: entry.event.rarity })"
              @ready="(batchId, entryId) => emit('identity-ready', batchId, entryId)"
            />
            <span
              v-show="stage === 'artwork' || stage === 'waiting'"
              class="warp-reveal-artwork"
              :class="{ 'warp-reveal-artwork-enter': phase === 'artwork' && artworkReady }"
            >
              <span
                class="warp-reveal-art-area"
                :class="{ 'warp-reveal-cone-area': item.kind === 'light-cone' }"
              >
                <WarpRevealImage
                  :preferred="
                    item.kind === 'light-cone' ? item.lightConePreview : item.revealArtwork
                  "
                  :fallback-url="item.artworkUrl"
                  :kind="item.kind"
                  :composition="revealComposition(item.id, item.kind)"
                  :limit-to-source-pixels="item.kind !== 'avatar'"
                  :label="item.name"
                  :pixel-ratio="pixelRatio"
                  :batch-id="entry.batchId"
                  :entry-id="entry.id"
                  @ready="(batchId, entryId) => emit('artwork-ready', batchId, entryId)"
                />
              </span>
              <WarpRevealMetadata
                v-if="metadataVisible"
                :item="item"
                :rarity="entry.event.rarity"
                :description-id="metadataDescriptionId"
              />
            </span>
          </span>
          <span class="warp-reveal-hint" aria-hidden="true">{{ hint }}</span>
        </Button>
      </div>
    </template>
  </Dialog>
  <WarpItemDetails
    v-if="visible"
    :key="detailContext"
    :entry="details"
    :item="detailItem"
    :source-label="details ? (sourceLabelForEntry?.(details) ?? details.event.bannerId) : ''"
    :z-index="detailZIndex"
    @close="details = undefined"
    @after-leave="afterDetailsLeave"
  />
</template>

<style>
.warp-reveal-mask,
.warp-reveal-dialog {
  background: #000;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}
.warp-reveal-dialog {
  width: 100%;
  height: 100dvh;
  max-width: none;
  max-height: none;
  margin: 0;
}
</style>
<style scoped>
.warp-reveal-shell {
  position: relative;
  width: 100%;
  height: 100%;
  color: #f4f5fa;
  isolation: isolate;
  overflow: hidden;
}
.warp-reveal-screen {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right))
    max(64px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
  border: 0;
  border-radius: 0;
  background: transparent;
  color: inherit;
}
.warp-reveal-screen:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: -4px;
}
.warp-reveal-screen.warp-reveal-full-canvas {
  padding: 0;
}
.warp-reveal-stage {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}
.warp-reveal-artwork {
  position: absolute;
  inset: 0;
  min-height: 0;
}
.warp-reveal-art-area {
  position: absolute;
  inset: 0;
}
.warp-reveal-cone-area {
  filter: drop-shadow(8px 16px 22px #0007);
}
.warp-reveal-artwork-enter {
  animation: warp-reveal-in var(--reveal-fade) ease-out both;
}
.warp-reveal-leaving {
  animation: warp-reveal-out var(--reveal-fade) ease-in both;
}
.warp-reveal-hint {
  position: absolute;
  z-index: 2;
  bottom: max(24px, env(safe-area-inset-bottom));
  inset-inline: 24px;
  color: #eef2ff;
  font-size: 13px;
  text-shadow: 0 1px 4px #000;
  text-align: center;
}
.warp-overview {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: 100%;
  height: 100%;
  gap: 8px;
  padding: max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-right))
    max(24px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
}
.warp-review-single {
  display: grid;
  place-items: center;
  min-height: 0;
  overflow: auto;
  padding: 32px;
}
.warp-review-single > .warp-result-card {
  width: min(100%, 620px);
}
.warp-overview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-inline: 8px;
}
.warp-overview-header h2 {
  font-size: clamp(20px, 1.35vw, 26px);
}
h2 {
  margin: 0;
  font-size: clamp(20px, 2vw, 28px);
  font-weight: 500;
  overflow-wrap: anywhere;
}
.warp-overview-description {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.warp-reveal-close {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.warp-reveal-close:focus-visible {
  outline: 2px solid #ffd17a;
  outline-offset: 3px;
}
.warp-reveal-close:hover {
  background: #ffffff15;
}
@keyframes warp-reveal-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@keyframes warp-reveal-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}
@media (max-width: 640px) {
  .warp-reveal-screen {
    padding-inline: 12px;
  }
  .warp-overview {
    padding-inline: 8px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .warp-reveal-artwork-enter,
  .warp-reveal-leaving {
    animation: none;
  }
}
</style>
