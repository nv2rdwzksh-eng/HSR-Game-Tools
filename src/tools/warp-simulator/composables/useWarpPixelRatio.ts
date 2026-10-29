import { onMounted, onScopeDispose, readonly, ref } from 'vue'

export function useWarpPixelRatio() {
  const ratio = ref(1)
  let media: MediaQueryList | undefined
  function update() {
    const value = window.devicePixelRatio
    ratio.value = Number.isFinite(value) && value > 0 ? value : 1
    media?.removeEventListener('change', update)
    media = window.matchMedia(`(resolution: ${ratio.value}dppx)`)
    media.addEventListener('change', update)
  }
  onMounted(() => {
    update()
    window.addEventListener('resize', update)
    window.visualViewport?.addEventListener('resize', update)
  })
  onScopeDispose(() => {
    media?.removeEventListener('change', update)
    window.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('resize', update)
  })
  return readonly(ratio)
}
