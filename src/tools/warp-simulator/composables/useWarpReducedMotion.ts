import { onMounted, onScopeDispose, readonly, ref } from 'vue'

export function useWarpReducedMotion() {
  const reduced = ref(false)
  let media: MediaQueryList | undefined
  const update = () => {
    reduced.value = media?.matches ?? false
  }
  onMounted(() => {
    media = window.matchMedia('(prefers-reduced-motion: reduce)')
    update()
    media.addEventListener('change', update)
  })
  onScopeDispose(() => media?.removeEventListener('change', update))
  return readonly(reduced)
}
