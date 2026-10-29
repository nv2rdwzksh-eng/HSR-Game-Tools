import { warpVisualTokens } from '../../../theme/preset'
import type { ToolLocale } from '../../../locales/types'
import type { WarpSnapshot } from '../data/schema'
import type { PityState } from '../engine/types'
import {
  emptyDefinitions,
  safeAssetPath,
  type VisualCatalog,
  type VisualDefinitions,
  type VisualImage,
} from './visual-catalog'
export type { VisualMetadata, VisualCatalog } from './visual-catalog'

export const PATH_CODES = [
  'Elation',
  'Knight',
  'Mage',
  'Memory',
  'Priest',
  'Rogue',
  'Shaman',
  'Warlock',
  'Warrior',
] as const
export const ELEMENT_CODES = [
  'Physical',
  'Fire',
  'Ice',
  'Thunder',
  'Wind',
  'Quantum',
  'Imaginary',
] as const
export interface ImagePresentation {
  readonly url: string
  readonly width: number
  readonly height: number
}
export interface ItemPresentation {
  readonly id: string
  readonly name: string
  readonly kind?: 'avatar' | 'light-cone'
  readonly rarity?: 3 | 4 | 5
  readonly path?: string
  readonly element?: string
  readonly portraitUrl?: string
  readonly artworkUrl?: string
  readonly pathName?: string
  readonly pathIconUrl?: string
  readonly elementName?: string
  readonly elementIconUrl?: string
  readonly elementColor?: string
  readonly starsUrl?: string
  readonly revealArtwork?: ImagePresentation
  readonly resultPortrait?: ImagePresentation
  readonly lightConePreview?: ImagePresentation
  readonly revealPathIcon?: ImagePresentation
  readonly revealStars?: ImagePresentation
  readonly revealStarBig?: ImagePresentation
  readonly cardStars?: ImagePresentation
  readonly cardStarsReferenceAspectRatio?: number
}
function revealImage(image: VisualImage | undefined, base: string): ImagePresentation | undefined {
  const url = portraitUrl(image?.path, base)
  return url &&
    image &&
    Number.isSafeInteger(image.width) &&
    image.width > 0 &&
    Number.isSafeInteger(image.height) &&
    image.height > 0
    ? { url, width: image.width, height: image.height }
    : undefined
}
export function portraitUrl(path: string | undefined, base: string): string | undefined {
  if (!safeAssetPath(path)) return undefined
  return base.replace(/\/?$/, '/') + path
}
export function createPresentation(
  snapshot: WarpSnapshot,
  visuals: VisualCatalog = {},
  base = '/',
  definitions: VisualDefinitions = emptyDefinitions,
) {
  const items = new Map(snapshot.items.map((item) => [item.id, item]))
  const fiveStars = revealImage(definitions.cardStars?.[5], base)
  const cardStarsReferenceAspectRatio = fiveStars ? fiveStars.width / fiveStars.height : 5
  const item = (id: string, locale: ToolLocale): ItemPresentation => {
    const source = items.get(id),
      visual = visuals[id]
    const element =
      source?.kind === 'avatar' ? ELEMENT_CODES.find((code) => code === visual?.element) : undefined
    const pathDefinition = visual?.path ? definitions.paths[visual.path] : undefined
    const elementDefinition =
      source?.kind === 'avatar' && visual?.element
        ? definitions.elements[visual.element]
        : undefined
    return {
      id,
      name: source?.names[locale] ?? id,
      kind: source?.kind,
      rarity: source?.rarity,
      path:
        visual?.path && (PATH_CODES as readonly string[]).includes(visual.path)
          ? visual.path
          : undefined,
      element,
      portraitUrl: source ? portraitUrl(visual?.portraitPath, base) : undefined,
      artworkUrl: source ? portraitUrl(visual?.artworkPath, base) : undefined,
      pathName: pathDefinition?.names[locale],
      pathIconUrl: portraitUrl(pathDefinition?.iconPath, base),
      elementName: elementDefinition?.names[locale],
      elementIconUrl: portraitUrl(elementDefinition?.iconPath, base),
      elementColor: element ? warpVisualTokens.element[element] : undefined,
      starsUrl: source ? portraitUrl(definitions.stars[source.rarity], base) : undefined,
      revealArtwork: source ? revealImage(visual?.revealArtwork, base) : undefined,
      resultPortrait:
        source?.kind === 'avatar' ? revealImage(visual?.resultPortrait, base) : undefined,
      lightConePreview:
        source?.kind === 'light-cone' ? revealImage(visual?.lightConePreview, base) : undefined,
      revealPathIcon: revealImage(pathDefinition?.revealIcon, base),
      revealStars: source ? revealImage(definitions.revealStars?.[source.rarity], base) : undefined,
      revealStarBig:
        source?.rarity === 5 ? revealImage(definitions.revealStarBig, base) : undefined,
      cardStars: source ? revealImage(definitions.cardStars?.[source.rarity], base) : undefined,
      cardStarsReferenceAspectRatio,
    }
  }
  const search = (ids: readonly string[], query: string) => {
    const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase()
    const q = normalize(query)
    return ids.filter((id) => {
      const source = items.get(id)
      return [id, source?.names['zh-CN'] ?? '', source?.names.en ?? ''].some((value) =>
        normalize(value).includes(q),
      )
    })
  }
  return { item, search }
}
export function pityRows(pity: PityState, hasUp5: boolean, hasUp4: boolean) {
  return [
    { key: 'fiveCount', count: pity.pullsSinceLast5 },
    {
      key: 'fiveGuarantee',
      status: hasUp5 ? (pity.guaranteed5 ? 'guaranteed' : 'normal') : 'unavailable',
    },
    { key: 'fourCount', count: pity.pullsSinceLast4, pending: pity.pullsSinceLast4 === 9 },
    {
      key: 'fourGuarantee',
      status: hasUp4 ? (pity.guaranteed4 ? 'guaranteed' : 'normal') : 'unavailable',
    },
  ] as const
}
