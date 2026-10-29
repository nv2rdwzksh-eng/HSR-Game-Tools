import { computed, ref } from 'vue'

/** Cache the most recently failed URL per instance; another mapped URL may load normally. */
export function useImageSource(url: () => string | undefined) {
  const failedUrl = ref<string>()
  const source = computed(() => (url() !== failedUrl.value ? url() : undefined))
  function fail() {
    failedUrl.value = url()
  }
  return { source, fail }
}
