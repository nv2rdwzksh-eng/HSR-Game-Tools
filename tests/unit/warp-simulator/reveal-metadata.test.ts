import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { effectScope, ref } from 'vue'
import { parse } from 'vue/compiler-sfc'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import {
  revealMetadata,
  showRevealMetadata,
} from '../../../src/tools/warp-simulator/components/reveal-metadata'
import {
  createPresentation,
  type ItemPresentation,
} from '../../../src/tools/warp-simulator/model/presentation'
import {
  useWarpReveal,
  type RevealPhase,
} from '../../../src/tools/warp-simulator/composables/useWarpReveal'
import { useWarpSimulator } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import {
  warpSnapshot,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import {
  resultDisplayScenarios,
  resultDisplaySnapshot,
  resultDisplayVisuals,
  syntheticLongNameId,
} from '../../fixtures/warp-simulator/result-display'
import { fixture, selectedAvatarIds } from '../../fixtures/warp-simulator/fixture'

const scenarios = resultDisplayScenarios()
const adapter = createPresentation(
  resultDisplaySnapshot,
  resultDisplayVisuals,
  '/sub/',
  warpVisualDefinitions,
)
const i18n = () =>
  createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN, en } }).global

describe('Final artwork metadata presentation', () => {
  it.each(['zh-CN', 'en'] as const)(
    'selects the primary icon, optional path row and cropped stars in %s',
    (locale) => {
      const { t } = createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, en } }).global
      for (const id of [
        'single-light-cone-3',
        'single-avatar-4',
        'single-avatar-5',
        'single-light-cone-5',
      ]) {
        const entry = scenarios.find((s) => s.id === id)!.entries[0]!
        const item = adapter.item(entry.event.itemId, locale)
        const result = revealMetadata(item, entry.event.rarity, t)
        expect(result.name).toBe(item.name)
        expect(result.stars).toEqual(item.cardStars)
        expect(result.stars!.url).not.toBe(item.starsUrl)
        expect(result.rarityLabel).toBe(t('warp.visual.rarity', { count: entry.event.rarity }))
        const avatar = item.kind === 'avatar'
        expect(result.kindLabel).toBe(t(`warp.itemKind.${item.kind}`))
        expect(result.primaryIcon).toEqual({
          kind: avatar ? 'element' : 'path',
          name: avatar ? item.elementName : item.pathName,
          icon: avatar ? item.elementIconUrl : item.pathIconUrl,
        })
        expect(result.path).toEqual(
          avatar ? { name: item.pathName, icon: item.pathIconUrl } : undefined,
        )
        expect(result.description).toBe(
          [
            result.kindLabel,
            item.name,
            result.rarityLabel,
            item.pathName,
            ...(avatar ? [item.elementName] : []),
          ].join(t('warp.resultTooltip.separator')),
        )
      }
    },
  )
  it('omits absent metadata, ignores light-cone elements and keeps missing images neutral', () => {
    const { t } = i18n()
    const item: ItemPresentation = {
      id: 'fixture',
      name: 'Literal name',
      kind: 'avatar',
      pathName: '  ',
      elementName: 'Ice',
      elementIconUrl: undefined,
    }
    const result = revealMetadata(item, 4, t)
    expect(result.primaryIcon).toEqual({ kind: 'element', name: 'Ice', icon: undefined })
    expect(result.path).toBeUndefined()
    expect(result.stars).toBeUndefined()
    expect(result.starsReferenceAspectRatio).toBe(5)
    expect(result.description).toBe(
      [result.kindLabel, item.name, result.rarityLabel, t('warp.visual.unknown'), 'Ice'].join(
        t('warp.resultTooltip.separator'),
      ),
    )
    const cone = revealMetadata({ ...item, kind: 'light-cone' }, 4, t)
    expect(cone.primaryIcon.name).toBe(t('warp.visual.unknown'))
    expect(cone.path).toBeUndefined()
    expect(cone.description).toBe(
      [cone.kindLabel, item.name, cone.rarityLabel, t('warp.visual.unknown')].join(
        t('warp.resultTooltip.separator'),
      ),
    )
  })
  it('preserves full long and untrusted names as text without identity lookup', () => {
    const { t } = i18n()
    const long = adapter.item(syntheticLongNameId, 'en')
    expect(long.name.length).toBeGreaterThan(100)
    expect(revealMetadata(long, 5, t).name).toBe(long.name)
    expect(warpSnapshot.items.some((item) => item.id === syntheticLongNameId)).toBe(false)
    const official = scenarios.find((s) => s.id === 'reveal-official-long-name')!.entries[0]!
    expect(adapter.item(official.event.itemId, 'en').name).toBe(
      'Resolution Shines As Pearls of Sweat',
    )
    const name = '<img src=x onerror=alert(1)> & "name"'
    const supplied = revealMetadata({ ...long, name, pathName: 'Supplied path' }, 5, t)
    expect(supplied.name).toBe(name)
    expect(supplied.path!.name).toBe('Supplied path')
  })
  it('shows only ready artwork/waiting, retaining final artwork but not identity during leaving', () => {
    for (const stage of [
      'idle',
      'identity',
      'artwork',
      'waiting',
      'overview',
      'leaving',
    ] as RevealPhase[]) {
      expect(showRevealMetadata(stage, false)).toBe(false)
      expect(showRevealMetadata(stage, true)).toBe(stage === 'artwork' || stage === 'waiting')
    }
    // Overlay passes its retained displayed stage during leaving, not the phase.
    expect(showRevealMetadata('waiting', true)).toBe(true)
    expect(showRevealMetadata('identity', true)).toBe(false)
  })
  it('keeps a shared noninteractive information band and a linked description inside artwork', () => {
    const read = (name: string) =>
      readFileSync(
        new URL('../../../src/tools/warp-simulator/components/' + name + '.vue', import.meta.url),
        'utf8',
      )
    const panel = parse(read('WarpRevealMetadata')).descriptor
    const root = panel.template!.ast!
    type Element = Extract<(typeof root.children)[number], { type: 1 }>
    const elements: Element[] = []
    const walk = (node: typeof root | Element) => {
      if (node.type === 1) elements.push(node)
      for (const child of node.children) if (child.type === 1) walk(child)
    }
    walk(root)
    const className = (node: Element) =>
      node.props.find((prop) => prop.type === 6 && prop.name === 'class')
    const owner = elements.find((node) => {
      const prop = className(node)
      return prop?.type === 6 && prop.value?.content === 'warp-reveal-metadata'
    })!
    const rows = owner.children.filter((child) => child.type === 1)
    expect(
      rows.slice(0, 3).map((row) => {
        const prop = className(row)
        return prop?.type === 6 ? prop.value?.content : undefined
      }),
    ).toEqual([
      'warp-reveal-metadata-type',
      'warp-reveal-metadata-band',
      'warp-reveal-metadata-path',
    ])
    expect(elements.some((node) => ['button', 'a', 'input', 'select'].includes(node.tag))).toBe(
      false,
    )
    expect(
      elements.some((node) =>
        node.props.some((prop) => prop.type === 7 && ['html', 'on'].includes(prop.name)),
      ),
    ).toBe(false)
    expect(
      rows[3]!.props.some(
        (prop) =>
          prop.type === 7 &&
          prop.name === 'bind' &&
          prop.arg?.type === 4 &&
          prop.arg.content === 'id',
      ),
    ).toBe(true)
    expect(panel.styles[0]!.content).toMatch(/pointer-events:\s*none/)
    const overlay = read('WarpRevealOverlay')
    const tree = parse(overlay).descriptor.template!.ast!
    const owners: Element[] = []
    const find = (node: typeof tree | Element) => {
      if (node.type === 1) {
        const prop = className(node)
        if (prop?.type === 6 && prop.value?.content === 'warp-reveal-artwork') owners.push(node)
      }
      for (const child of node.children) if (child.type === 1) find(child)
    }
    find(tree)
    expect(owners).toHaveLength(1)
    expect(owners[0]!.children.filter((child) => child.type === 1).map((node) => node.tag)).toEqual(
      ['span', 'WarpRevealMetadata'],
    )
    expect(overlay).toContain('showRevealMetadata(stage.value, props.artworkReady)')
    expect(overlay).toContain(
      ':aria-describedby="metadataVisible && entry && item ? metadataDescriptionId : undefined"',
    )
  })
  it('does not alter committed history, pity, identity or RNG while re-rendering and confirming a queue', async () => {
    const rng = {
      consumed: 0,
      next() {
        this.consumed++
        return 0
      },
    }
    const snapshot = fixture()
    const scope = effectScope()
    const { simulator, reveal } = scope.run(() => ({
      simulator: useWarpSimulator({ snapshot, rng }),
      reveal: useWarpReveal(ref(true)),
    }))!
    try {
      simulator.openSelection()
      simulator.setSelectionDraft(selectedAvatarIds)
      simulator.confirmSelection()
      expect(await simulator.draw(10)).toBe(true)
      const committed = simulator.session.value,
        before = JSON.stringify(committed),
        consumed = rng.consumed
      const local = createPresentation(snapshot)
      const messages = i18n()
      reveal.beginBatch(committed.latestBatchId!, simulator.latestResults.value)
      expect(reveal.current.value).toBeDefined()
      const seen: number[] = []
      while (reveal.current.value) {
        const entry = reveal.current.value!
        seen.push(entry.id)
        reveal.markArtworkReady(entry.batchId, entry.id)
        expect(reveal.phase.value).toBe('waiting')
        for (const locale of ['zh-CN', 'en'] as const) {
          messages.locale.value = locale
          const panel = revealMetadata(
            local.item(entry.event.itemId, locale),
            entry.event.rarity,
            messages.t,
          )
          expect(panel.rarityLabel).toBe(
            messages.t('warp.visual.rarity', { count: entry.event.rarity }),
          )
        }
        reveal.activate()
      }
      expect(reveal.phase.value).toBe('overview')
      expect(reveal.overviewEntries.value).toHaveLength(10)
      reveal.escape()
      reveal.afterHide()
      expect(seen).toEqual(
        simulator.latestResults.value
          .filter((entry) => entry.event.rarity === 5)
          .map((entry) => entry.id),
      )
      expect(simulator.session.value).toBe(committed)
      expect(JSON.stringify(committed)).toBe(before)
      expect(rng.consumed).toBe(consumed)
    } finally {
      scope.stop()
    }
  })
})
