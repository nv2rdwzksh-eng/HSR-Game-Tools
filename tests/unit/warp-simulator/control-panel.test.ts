import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { effectScope, ref, watch } from 'vue'
import { compileTemplate, parse } from 'vue/compiler-sfc'
import { useWarpSimulator } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import { useWarpReveal } from '../../../src/tools/warp-simulator/composables/useWarpReveal'
import {
  availableBanners,
  BANNER_KIND_ORDER,
} from '../../../src/tools/warp-simulator/model/catalog'
import { createPresentation, pityRows } from '../../../src/tools/warp-simulator/model/presentation'
import { useImageSource } from '../../../src/composables/useImageSource'
import {
  multiBannerFixture,
  selectedAvatarIds,
  seeded,
  scripted,
} from '../../fixtures/warp-simulator/fixture'

function choose(simulator: ReturnType<typeof useWarpSimulator>, ids = selectedAvatarIds) {
  simulator.openSelection()
  simulator.setSelectionDraft(ids)
  expect(simulator.confirmSelection()).toBe(true)
}

describe('Warp control panel categories and shared affinity', () => {
  it('groups five kinds in UI order, includes only resolvable Banners and hides empty categories', () => {
    const snapshot = multiBannerFixture()
    expect(availableBanners(snapshot).groups.map((group) => group.kind)).toEqual(BANNER_KIND_ORDER)
    snapshot.banners.find((banner) => banner.kind === 'ordinary')!.sharedPool = 'missing'
    snapshot.banners.find((banner) => banner.kind === 'fate-light-cone')!.up4 = []
    const catalog = availableBanners(snapshot)
    expect(catalog.groups.map((group) => group.kind)).toEqual([
      'event-avatar',
      'event-light-cone',
      'fate-avatar',
    ])
    expect(catalog.groups[0]!.banners.map((entry) => entry.banner.id)).toEqual([
      'gacha:100',
      'gacha:200',
    ])
    expect(catalog.diagnostics).toHaveLength(2)
    expect(availableBanners({ ...snapshot, banners: [] }).groups).toEqual([])
  })

  it('remembers category choices without consuming RNG, changing history or replaying reveals', async () => {
    const rng = seeded(77),
      scope = effectScope()
    const { simulator, reveal, stop } = scope.run(() => {
      const simulator = useWarpSimulator({ snapshot: multiBannerFixture(), rng })
      const reveal = useWarpReveal(ref(true))
      const stop = watch(
        () => simulator.session.value.latestBatchId,
        (id) => {
          if (id !== undefined) reveal.beginBatch(id, simulator.latestResults.value)
        },
        { flush: 'sync' },
      )
      return { simulator, reveal, stop }
    })!
    try {
      choose(simulator)
      await simulator.draw(1)
      const before = simulator.session.value,
        consumed = rng.consumed,
        revealEntry = reveal.current.value
      simulator.selectBanner('gacha:200')
      const pool = simulator.resolvedPool.value
      expect(pool?.ok && pool.value.bannerId).toBe('gacha:200')
      simulator.selectKind('event-light-cone')
      expect(simulator.selectedBannerId.value).toBe('gacha:101')
      simulator.selectBanner('gacha:201')
      simulator.selectKind('ordinary')
      simulator.selectKind('event-avatar')
      expect(simulator.selectedBannerId.value).toBe('gacha:200')
      expect(simulator.kindBanners.value.map((entry) => entry.banner.id)).toEqual([
        'gacha:100',
        'gacha:200',
      ])
      simulator.selectKind('event-light-cone')
      expect(simulator.selectedBannerId.value).toBe('gacha:201')
      expect(simulator.session.value).toBe(before)
      expect(reveal.current.value).toBe(revealEntry)
      expect(rng.consumed).toBe(consumed)
      expect(simulator.selectKind('unsupported' as never)).toBe(false)
      stop()
    } finally {
      scope.stop()
    }
  })

  it('shares Event/Fate selections immediately while preserving independent pity and historical facts', async () => {
    const simulator = useWarpSimulator({
      snapshot: multiBannerFixture(),
      rng: scripted([0, 0.99, 0.2, 0.99, 0.99, 0]),
    })
    choose(simulator)
    await simulator.draw(1)
    const entry = simulator.latestResults.value[0]!,
      before = JSON.stringify(entry)
    const eventPity = simulator.pity.value
    expect(eventPity?.guaranteed5).toBe(true)
    simulator.selectKind('fate-avatar')
    expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
    expect(simulator.pity.value).toMatchObject({ pullsSinceLast5: 0, pullsSinceLast4: 0 })
    expect(simulator.canPull.value).toBe(true)
    await simulator.draw(1)
    const fatePity = simulator.pity.value
    expect(fatePity?.guaranteed5).toBe(false)
    const session = simulator.session.value
    const next = ['avatar:9', ...selectedAvatarIds.slice(1)]
    choose(simulator, next)
    expect(simulator.session.value).toBe(session)
    expect(
      simulator.resolvedPool.value?.ok &&
        simulator.resolvedPool.value.value.fiveStar.map((item) => item.id),
    ).toEqual(['avatar:9', ...next])
    simulator.selectKind('event-avatar')
    expect(simulator.pity.value).toEqual(eventPity)
    expect(simulator.selectedAvatarIds.value).toEqual(next)
    expect(JSON.stringify(entry)).toBe(before)
    simulator.selectKind('fate-avatar')
    expect(simulator.pity.value).toBe(fatePity)
  })

  it('blocks incompatible Banners, retains shared choices through cancellation, and accepts explicit repair', async () => {
    const snapshot = multiBannerFixture()
    snapshot.sharedPools.push({
      ...snapshot.sharedPools[0]!,
      id: 'restricted',
      fiveStar: [
        'avatar:2',
        'avatar:3',
        'avatar:4',
        'avatar:5',
        'avatar:6',
        'avatar:7',
        'avatar:8',
      ],
    })
    snapshot.banners.find((banner) => banner.kind === 'fate-avatar')!.sharedPool = 'restricted'
    const rng = seeded(12),
      simulator = useWarpSimulator({ snapshot, rng })
    choose(simulator)
    simulator.selectKind('fate-avatar')
    expect(simulator.selectionIssue.value).toBe('incompatible')
    expect(await simulator.draw(10)).toBe(false)
    simulator.openSelection()
    expect(simulator.selectionDraft.value).toEqual(selectedAvatarIds)
    expect(simulator.selectionValid.value).toBe(false)
    expect(simulator.selectKind('ordinary')).toBe(false)
    expect(simulator.confirmSelection()).toBe(false)
    simulator.setSelectionDraft(selectedAvatarIds.slice(1))
    expect(simulator.confirmSelection()).toBe(false)
    simulator.cancelSelection()
    simulator.selectKind('event-avatar')
    expect(simulator.canPull.value).toBe(true)
    simulator.selectKind('fate-avatar')
    choose(simulator, ['avatar:8', ...selectedAvatarIds.slice(1)])
    expect(simulator.canPull.value).toBe(true)
    simulator.selectKind('event-avatar')
    expect(simulator.selectedAvatarIds.value[0]).toBe('avatar:8')
    expect(rng.consumed).toBe(0)
  })

  it('projects actual UP items through the adapter and keeps Fate/Ordinary UP omissions', () => {
    const snapshot = multiBannerFixture(),
      adapter = createPresentation(
        snapshot,
        {
          'avatar:21': { portraitPath: 'game-assets/portrait.webp' },
          'light-cone:21': { artworkPath: 'game-assets/cone.webp' },
        },
        '/sub/',
      )
    for (const { banner } of availableBanners(snapshot).banners) {
      const up4 = banner.up4?.map((id) => adapter.item(id, 'en')) ?? []
      if (banner.kind.startsWith('event-')) {
        expect(up4).toHaveLength(3)
        expect(up4.every((item) => item.rarity === 4)).toBe(true)
        expect(up4[0]?.kind).toBe(banner.kind.endsWith('avatar') ? 'avatar' : 'light-cone')
        expect(up4[0]?.portraitUrl ?? up4[0]?.artworkUrl).toMatch(/^\/sub\/game-assets\//)
        const image = useImageSource(() => up4[0]?.portraitUrl ?? up4[0]?.artworkUrl)
        image.fail()
        expect(image.source.value).toBeUndefined()
        expect(up4[1]?.portraitUrl ?? up4[1]?.artworkUrl).toBeUndefined()
      } else expect(up4).toEqual([])
      if (banner.kind === 'ordinary') expect(banner.up5).toBeUndefined()
    }
  })

  it('preserves pending four-star pity and N/A statuses in compact groups', () => {
    const simulator = useWarpSimulator({ snapshot: multiBannerFixture() })
    const pity = {
      ...simulator.pity.value!,
      pullsSinceLast5: 72,
      pullsSinceLast4: 9,
      guaranteed5: true,
      guaranteed4: false,
    }
    const rows = pityRows(pity, true, true)
    expect(rows[0].count).toBe(72)
    expect(rows[1].status).toBe('guaranteed')
    expect(rows[2]).toMatchObject({ count: 9, pending: true })
    expect(rows[3].status).toBe('normal')
    expect(pityRows(pity, false, false)[1].status).toBe('unavailable')
    expect(pityRows(pity, true, false)[3].status).toBe('unavailable')
  })
})

interface TemplateNode {
  type?: number
  tag?: string
  children?: TemplateNode[]
  props?: {
    type: number
    name: string
    value?: { content: string }
    arg?: { content: string }
    exp?: { content: string }
  }[]
}
function template(file: string) {
  const source = readFileSync(
    new URL('../../../src/tools/warp-simulator/' + file, import.meta.url),
    'utf8',
  )
  const descriptor = parse(source).descriptor
  expect(
    compileTemplate({ source: descriptor.template!.content, filename: file, id: 'warp-test' })
      .errors,
  ).toEqual([])
  const nodes: TemplateNode[] = []
  const visit = (node: TemplateNode) => {
    if (node.type === 1) nodes.push(node)
    node.children?.forEach(visit)
  }
  visit(descriptor.template!.ast as TemplateNode)
  return nodes
}
const binding = (node: TemplateNode, name: string) =>
  node.props?.find((prop) => prop.type === 7 && prop.name === 'bind' && prop.arg?.content === name)
    ?.exp?.content
const condition = (node: TemplateNode) =>
  node.props?.find((prop) => prop.type === 7 && prop.name === 'if')?.exp?.content

describe('control templates and accessible validation wiring', () => {
  it('keeps the dark control surfaces opted in only on buttons and category tabs', () => {
    for (const file of ['WarpSimulatorPage.vue', 'components/WarpSelectionDialog.vue']) {
      const nodes = template(file)
      for (const node of nodes) {
        const classes =
          node.props?.find((prop) => prop.name === 'class')?.value?.content.split(/\s+/) ?? []
        if (classes.includes('h-theme')) expect(['HButton', 'HTabs']).toContain(node.tag)
        if (node.tag === 'HButton' || node.tag === 'HTabs') expect(classes).toContain('h-theme')
      }
    }
  })
  it('keeps the control Drawer inset and scrolling local', () => {
    const nodes = template('WarpSimulatorPage.vue')
    const drawers = nodes.filter((node) => node.tag === 'Drawer')
    const controls = drawers.find((node) =>
      node.props?.some(
        (prop) => prop.name === 'id' && prop.value?.content === 'warp-controls-drawer',
      ),
    )!
    expect(binding(controls, 'style')).toContain('clamp(16px, 4vw, 20px)')
    expect(binding(controls, 'pt')).toMatch(
      /header:[\s\S]*padding:\s*'var\(--warp-controls-inset\)'/,
    )
    expect(binding(controls, 'pt')).toMatch(
      /content:[\s\S]*padding:\s*'0 var\(--warp-controls-inset\)'/,
    )
    expect(drawers).toHaveLength(1)
    expect(nodes.some((node) => node.tag === 'WarpHistoryDialog')).toBe(true)
  })
  it('connects real tabs/panels and the full banner list, with a separate control footer', () => {
    const nodes = template('WarpSimulatorPage.vue')
    expect(nodes.find((node) => node.tag === 'HTabs')).toBeDefined()
    expect(
      nodes.some(
        (node) =>
          node.tag === 'section' &&
          node.props?.some((prop) => prop.name === 'role' && prop.value?.content === 'tabpanel'),
      ),
    ).toBe(true)
    expect(nodes.some((node) => node.tag === 'Select')).toBe(false)
    const list = nodes.find((node) => node.tag === 'WarpBannerList')!
    expect(binding(list, 'banners')).toBe('simulator.kindBanners.value')
    expect(binding(list, 'selected-banner-id')).toBe('selectedBannerId')
    expect(
      binding(
        nodes.find((node) => node.tag === 'WarpPityPanel')!,
        'pity',
      ),
    ).toBe('pity')
    expect(nodes.some((node) => condition(node) === 'activeBanner?.requiresSelection')).toBe(true)
    const source = readFileSync(
      new URL('../../../src/tools/warp-simulator/WarpSimulatorPage.vue', import.meta.url),
      'utf8',
    )
    expect(source).toContain('max-height: 65%')
    expect(source).toContain('grid-template-columns: repeat(7, minmax(0, 1fr))')
    expect(source).not.toContain('warp.memoryOnly')
    expect(source).not.toContain('warp-selection-trigger')
    const controls = nodes.find((node) => node.tag === 'Drawer')!
    expect(binding(controls, 'pt')).toContain("overflow: 'hidden'")
    expect(binding(controls, 'pt')).toContain("minHeight: '0'")
  })

  it('keeps the Dialog named, counts live, input labelled, invalid choices removable and confirmation gated', () => {
    const nodes = template('components/WarpSelectionDialog.vue')
    const dialog = nodes.find((node) => node.tag === 'Dialog')!
    expect(dialog.props?.find((prop) => prop.name === 'aria-labelledby')?.value?.content).toBe(
      'warp-selection-title',
    )
    expect(nodes.find((node) => node.tag === 'Badge')).toBeDefined()
    expect(nodes.find((node) => node.tag === 'InputText')).toBeDefined()
    expect(
      nodes.some(
        (node) =>
          node.tag === 'label' &&
          node.props?.some(
            (prop) => prop.name === 'for' && prop.value?.content === 'warp-character-search',
          ),
      ),
    ).toBe(true)
    expect(nodes.some((node) => condition(node) === 'unavailableChoices.length')).toBe(true)
    expect(
      nodes.some((node) => node.tag === 'HButton' && binding(node, 'disabled') === '!valid'),
    ).toBe(true)
    expect(
      nodes.some(
        (node) =>
          node.tag === 'Checkbox' &&
          binding(node, 'disabled') === '!draft.includes(item.id) && draft.length >= 7',
      ),
    ).toBe(true)
    expect(
      nodes.some((node) =>
        node.props?.some(
          (prop) => prop.name === 'id' && prop.value?.content === 'warp-selection-error',
        ),
      ),
    ).toBe(true)
  })
})
