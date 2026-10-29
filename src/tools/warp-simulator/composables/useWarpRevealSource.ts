import { computed, shallowRef, watch } from 'vue'
import type { ImagePresentation } from '../model/presentation'

/** Ordered image fallback; no requests, timers or business state live here. */
export function useWarpRevealSource(
  preferred: () => ImagePresentation | undefined,
  fallback: () => string | undefined,
  intermediate: () => readonly ImagePresentation[] = () => [],
) {
  const failed = shallowRef<ReadonlySet<string>>(new Set())
  const loaded = shallowRef<{ url: string; width: number; height: number }>()
  const candidates = computed(() => {
    const images = [preferred(), ...intermediate(), fallback() ? { url: fallback()! } : undefined]
    const unique = new Map<string, ImagePresentation | { url: string }>()
    for (const image of images) if (image && !unique.has(image.url)) unique.set(image.url, image)
    return [...unique.values()]
  })
  const source = computed(() => candidates.value.find((image) => !failed.value.has(image.url))?.url)
  const dimensions = computed(() =>
    loaded.value?.url === source.value
      ? loaded.value
      : (candidates.value.find((image) => image.url === source.value && 'width' in image) as
          ImagePresentation | undefined),
  )
  const ready = computed(() => !source.value || loaded.value?.url === source.value)
  watch(
    () =>
      candidates.value
        .map((image) =>
          [
            image.url,
            'width' in image ? image.width : '',
            'height' in image ? image.height : '',
          ].join('\0'),
        )
        .join('\n'),
    () => {
      failed.value = new Set()
      loaded.value = undefined
    },
    { flush: 'sync' },
  )
  function fail(url: string) {
    if (url !== source.value) return
    failed.value = new Set([...failed.value, url])
  }
  function load(url: string, width: number, height: number) {
    if (url !== source.value || width <= 0 || height <= 0) return
    loaded.value = { url, width, height }
  }
  return { source, dimensions, ready, fail, load }
}

export function revealPixelLimit(width: number, height: number, pixelRatio: number) {
  const ratio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1
  return { maxWidth: `${width / ratio}px`, maxHeight: `${height / ratio}px` }
}
