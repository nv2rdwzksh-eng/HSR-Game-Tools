import type { ItemPresentation } from '../model/presentation'
import type { RevealPhase } from '../composables/useWarpReveal'

type Translate = (key: string, params: Record<string, string | number>) => string

/** Consumes resolved presentation metadata; never looks up an item or owns reveal state. */
export function revealMetadata(item: ItemPresentation, rarity: 3 | 4 | 5, t: Translate) {
  const unknown = t('warp.visual.unknown', {})
  const avatar = item.kind === 'avatar'
  const path = item.pathName?.trim() ? item.pathName : undefined
  const element = avatar && item.elementName?.trim() ? item.elementName : undefined
  const kindLabel = t(`warp.itemKind.${item.kind ?? 'unknown'}`, {})
  const rarityLabel = t('warp.visual.rarity', { count: rarity })
  return {
    name: item.name,
    kindLabel,
    primaryIcon: {
      kind: avatar ? 'element' : 'path',
      name: (avatar ? element : path) ?? unknown,
      icon: avatar ? item.elementIconUrl : item.pathIconUrl,
    },
    path: avatar && path ? { name: path, icon: item.pathIconUrl } : undefined,
    stars: item.cardStars,
    starsReferenceAspectRatio: item.cardStarsReferenceAspectRatio ?? 5,
    rarityLabel,
    description: [
      kindLabel,
      item.name,
      rarityLabel,
      path ?? unknown,
      ...(avatar ? [element ?? unknown] : []),
    ].join(t('warp.resultTooltip.separator', {})),
  }
}

/** stage is the displayed stage, including the retained stage during leaving. */
export function showRevealMetadata(stage: RevealPhase, artworkReady: boolean) {
  return artworkReady && (stage === 'artwork' || stage === 'waiting')
}
