import catalog from '../game/catalog.json'
import { validateSnapshot, type CharacterRecord, type GameSnapshot } from '../schema'
import type { ToolLocale } from '../../../../locales/types'

const snapshot: unknown = catalog
validateSnapshot(snapshot)
export const gameData: GameSnapshot = snapshot
export function assetUrl(
  key: string | undefined,
  base = import.meta.env.BASE_URL,
): string | undefined {
  const asset = key ? gameData.assets[key] : undefined
  return asset ? base.replace(/\/?$/, '/') + asset.path : undefined
}
export function characterName(character: CharacterRecord, locale: ToolLocale): string {
  return character.names[locale]
}
