import { onMounted, onScopeDispose, ref, watch, type Ref } from 'vue'

export function useWarpElementSize(element: Ref<HTMLElement | undefined>) {
  const size = ref({ width: 0, height: 0 })
  let observer: ResizeObserver | undefined
  function measure() {
    // Layout sizes exclude the outer card/canvas rotation and scale.
    if (element.value)
      size.value = { width: element.value.clientWidth, height: element.value.clientHeight }
  }
  function observe() {
    observer?.disconnect()
    measure()
    if (element.value && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      observer.observe(element.value)
    }
  }
  onMounted(observe)
  watch(element, observe)
  onScopeDispose(() => observer?.disconnect())
  return size
}
