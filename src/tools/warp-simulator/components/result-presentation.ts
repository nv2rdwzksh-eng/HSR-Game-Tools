import type { ItemPresentation } from '../model/presentation'

type Translate = (key: string, params: Record<string, string | number>) => string

export function rarityColorVariable(rarity: 3 | 4 | 5) {
  return `var(--p-warp-rarity-${rarity})`
}

/** Plain text only; Tooltip must keep escape enabled and preserve these newlines. */
export function resultTooltip(item: ItemPresentation, rarity: 3 | 4 | 5, t: Translate): string {
  const metadata = [item.pathName, item.kind === 'avatar' ? item.elementName : undefined]
    .filter(Boolean)
    .join(t('warp.resultTooltip.separator', {}))
  return [
    metadata ? t('warp.resultTooltip.name', { name: item.name, metadata }) : item.name,
    t('warp.resultTooltip.rarity', { count: rarity }),
    t('warp.resultTooltip.kind', { kind: t(`warp.itemKind.${item.kind ?? 'unknown'}`, {}) }),
  ].join('\n')
}
