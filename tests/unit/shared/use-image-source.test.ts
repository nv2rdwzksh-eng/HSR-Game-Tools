import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useImageSource } from '../../../src/composables/useImageSource'

describe('per-instance image source fallback', () => {
  it('handles a missing URL, repeated failure, another URL and returning to the failed URL', () => {
    const url = ref<string>()
    const image = useImageSource(() => url.value)
    expect(image.source.value).toBeUndefined()
    image.fail()
    expect(image.source.value).toBeUndefined()
    url.value = '/sub/game-assets/character/8008.webp'
    expect(image.source.value).toBe(url.value)
    image.fail()
    image.fail()
    expect(image.source.value).toBeUndefined()
    url.value = '/sub/game-assets/emblem/2007.webp'
    expect(image.source.value).toBe(url.value)
    url.value = '/sub/game-assets/character/8008.webp'
    expect(image.source.value).toBeUndefined()
    url.value = undefined
    expect(image.source.value).toBeUndefined()
  })

  it('isolates failure state even when instances use the same URL', () => {
    const url = ref('/game-assets/character/8008.webp')
    const first = useImageSource(() => url.value)
    const second = useImageSource(() => url.value)
    first.fail()
    expect(first.source.value).toBeUndefined()
    expect(second.source.value).toBe(url.value)
    url.value = '/game-assets/character/1204.webp'
    expect(first.source.value).toBe(url.value)
    expect(second.source.value).toBe(url.value)
  })

  it('falls back for unavailable material images and recovers when the candidate uses another material', () => {
    const url = ref<string | undefined>('/hsr/game-assets/currency-war-equipments/350601.webp')
    const material = useImageSource(() => url.value)
    material.fail()
    expect(material.source.value).toBeUndefined()
    url.value = '/hsr/game-assets/currency-war-equipments/352101.webp'
    expect(material.source.value).toBe(url.value)
    url.value = undefined
    expect(material.source.value).toBeUndefined()
  })
})
