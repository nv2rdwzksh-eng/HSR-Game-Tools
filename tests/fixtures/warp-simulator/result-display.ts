import {
  warpSnapshot,
  warpVisuals,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import type { WarpItem, WarpSnapshot } from '../../../src/tools/warp-simulator/data/schema'
import type { HistoryEntry } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import type { ItemPresentation } from '../../../src/tools/warp-simulator/model/presentation'
import reviewZhCN from '../../manual/warp-results/zh-CN.json'
import reviewEn from '../../manual/warp-results/en.json'

// Keep this deliberately synthetic identity and its reused four-star artwork
// entirely in the test graph; production five-star cones use their own mappings.
export const syntheticConeId = 'fixture:light-cone:5'
export const syntheticLongNameId = 'fixture:avatar:long-name'
const coneTemplate = warpSnapshot.items
  .filter((item) => item.kind === 'light-cone' && item.rarity === 4)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!
const avatarTemplate = warpSnapshot.items
  .filter((item) => item.kind === 'avatar' && item.rarity === 5)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]!
export const resultDisplaySnapshot: WarpSnapshot = {
  ...warpSnapshot,
  items: [
    ...warpSnapshot.items,
    {
      ...coneTemplate,
      id: syntheticConeId,
      rarity: 5,
      names: { 'zh-CN': reviewZhCN.syntheticCone, en: reviewEn.syntheticCone },
    },
    {
      ...avatarTemplate,
      id: syntheticLongNameId,
      names: { 'zh-CN': reviewZhCN.syntheticLongName, en: reviewEn.syntheticLongName },
    },
  ],
}
export const resultDisplayVisuals = {
  ...warpVisuals,
  [syntheticConeId]: warpVisuals[coneTemplate.id]!,
  [syntheticLongNameId]: warpVisuals[avatarTemplate.id]!,
}

export interface ResultDisplayScenario {
  readonly id: string
  readonly entries: readonly HistoryEntry[]
  readonly overrides: Readonly<Record<string, Partial<ItemPresentation>>>
}

// These are display records, not outcomes from a valid banner or an engine session.
// In particular, all-three deliberately bypasses ten-pull guarantees for visual review.
export function resultDisplayScenarios(
  snapshot: WarpSnapshot = resultDisplaySnapshot,
): readonly ResultDisplayScenario[] {
  const select = (kind: WarpItem['kind'], rarity: WarpItem['rarity'], index = 0) => {
    const items = snapshot.items
      .filter((item) => item.kind === kind && item.rarity === rarity)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    if (!items.length) throw new Error(`Missing visual fixture category: ${kind}/${rarity}`)
    return items[index % items.length]!
  }
  const cone3 = (index = 0) => select('light-cone', 3, index)
  const avatar4 = select('avatar', 4)
  const cone4 = select('light-cone', 4)
  const avatar5 = select('avatar', 5)
  const cone5 = select('light-cone', 5)
  const scenarios: ResultDisplayScenario[] = []
  function add(
    id: string,
    items: readonly WarpItem[],
    upIndices: readonly number[] = [],
    overrides: ResultDisplayScenario['overrides'] = {},
  ) {
    const batchId = scenarios.length + 1
    const entries = items.map((item, index): HistoryEntry =>
      Object.freeze({
        id: batchId * 100 + index + 1,
        batchId,
        event: Object.freeze({
          model: Object.freeze({ id: 'hsr-warp', version: 'v0.3' }),
          bannerId: 'fixture:result-display',
          pityGroup: 'pity:ordinary',
          itemId: item.id,
          rarity: item.rarity,
          pityBefore: Object.freeze({
            pullsSinceLast5: 0,
            pullsSinceLast4: 0,
            guaranteed5: false,
            guaranteed4: false,
          }),
          branch: 'uniform',
          isUp: item.rarity === 3 ? null : upIndices.includes(index),
        }),
      }),
    )
    scenarios.push(
      Object.freeze({
        id,
        entries: Object.freeze(entries),
        overrides: Object.freeze(
          Object.fromEntries(
            Object.entries(overrides).map(([key, value]) => [key, Object.freeze({ ...value })]),
          ),
        ),
      }),
    )
  }
  const allThree = Array.from({ length: 10 }, (_, index) => cone3(index))
  add('all-three', allThree)
  add(
    'four-mixed',
    [cone3(), avatar4, cone4, cone3(1), avatar4, cone4, cone3(2), cone3(3), cone3(4), cone3(5)],
    [1, 2],
  )
  add(
    'five-mixed',
    [avatar5, cone3(), cone5, avatar4, cone4, avatar5, cone5, cone3(1), cone3(2), cone3(3)],
    [0, 2, 3],
  )
  add(
    'ten-one-five',
    [cone3(), avatar4, cone3(1), cone4, avatar5, cone3(2), cone3(3), cone3(4), cone3(5), cone3(6)],
    [4],
  )
  for (const item of [cone3(), avatar4, cone4, avatar5, cone5]) {
    add(`single-${item.kind}-${item.rarity}`, [item], item.rarity > 3 ? [0] : [])
  }
  const svg = (width: number, height: number) =>
    'data:image/svg+xml,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="#3b4049"/><rect x="2" y="2" width="${width - 4}" height="${height - 4}" fill="none" stroke="#f1eee7" stroke-width="4"/><circle cx="${width / 2}" cy="${height / 2}" r="${Math.min(width, height) / 4}" fill="#c9a86b"/></svg>`,
    )
  add('image-fallbacks', [avatar4, cone4, avatar5, cone5, ...allThree.slice(0, 6)], [], {
    [avatar4.id]: {
      artworkUrl: undefined,
      resultPortrait: undefined,
      pathIconUrl: undefined,
      revealArtwork: undefined,
      revealPathIcon: undefined,
    },
    [cone4.id]: {
      lightConePreview: undefined,
      artworkUrl: '/tests/manual/warp-results/missing-fixture.webp',
      starsUrl: undefined,
      cardStars: undefined,
      revealArtwork: undefined,
    },
    [avatar5.id]: { artworkUrl: svg(800, 80), revealArtwork: undefined, resultPortrait: undefined },
    [cone5.id]: { artworkUrl: svg(80, 800), revealArtwork: undefined, lightConePreview: undefined },
  })
  add('missing-artwork', [avatar5], [], {
    [avatar5.id]: {
      resultPortrait: undefined,
      artworkUrl: undefined,
      pathIconUrl: undefined,
      starsUrl: undefined,
      cardStars: undefined,
      revealArtwork: undefined,
      revealPathIcon: undefined,
      revealStars: undefined,
    },
  })
  add('failed-artwork', [cone4], [], {
    [cone4.id]: {
      lightConePreview: {
        url: '/tests/manual/warp-results/missing-preview-fixture.webp',
        width: 348,
        height: 408,
      },
      cardStars: {
        url: '/tests/manual/warp-results/missing-card-stars.webp',
        width: 260,
        height: 68,
      },
      artworkUrl: '/tests/manual/warp-results/missing-fixture.webp',
      revealArtwork: {
        url: '/tests/manual/warp-results/missing-hd-fixture.webp',
        width: 902,
        height: 1260,
      },
    },
  })
  add('hd-fallback', [avatar5], [], {
    [avatar5.id]: {
      resultPortrait: {
        url: '/tests/manual/warp-results/missing-native-fixture.webp',
        width: 2048,
        height: 2048,
      },
      revealArtwork: {
        url: '/tests/manual/warp-results/missing-hd-fixture.webp',
        width: 2048,
        height: 2048,
      },
      revealPathIcon: {
        url: '/tests/manual/warp-results/missing-path-fixture.webp',
        width: 512,
        height: 512,
      },
      revealStars: {
        url: '/tests/manual/warp-results/missing-stars-fixture.webp',
        width: 640,
        height: 128,
      },
    },
  })
  const officialLongName = snapshot.items.find((item) => item.id === 'light-cone:21015')
  const syntheticLongName = snapshot.items.find((item) => item.id === syntheticLongNameId)
  if (!officialLongName || !syntheticLongName) throw new Error('Missing long-name review identity')
  add('reveal-official-long-name', [officialLongName])
  add('reveal-long-name', [syntheticLongName])
  add('reveal-metadata-missing', [avatar5], [], {
    [avatar5.id]: {
      pathName: undefined,
      pathIconUrl: undefined,
      elementName: undefined,
      elementIconUrl: undefined,
    },
  })
  for (const [id, itemId] of [
    ['reveal-cyrene', 'avatar:1415'],
    ['reveal-battle-isnt-over', 'light-cone:23003'],
    ['reveal-march', 'avatar:1001'],
    ['reveal-bronya', 'avatar:1101'],
    ['reveal-clara', 'avatar:1107'],
  ] as const) {
    const item = snapshot.items.find((item) => item.id === itemId)
    if (!item) throw new Error(`Missing single-reveal review identity: ${itemId}`)
    add(id, [item])
  }
  const cyrene = snapshot.items.find((item) => item.id === 'avatar:1415')
  const arlan = snapshot.items.find((item) => item.id === 'avatar:1008')
  const battle = snapshot.items.find((item) => item.id === 'light-cone:23003')
  if (!cyrene || !arlan || !battle) throw new Error('Missing overview reference identities')
  add(
    'overview-reference',
    [cone3(4), cone3(3), cyrene, cone3(5), arlan, cone4, cone3(2), cyrene, cone3(6), battle],
    [2, 4, 7],
  )
  return Object.freeze(scenarios)
}
