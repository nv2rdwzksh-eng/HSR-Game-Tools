import type { HistoryEntry } from '../composables/useWarpSimulator'
import type { WarpBannerKind } from '../data/schema'
import { isLightCone } from '../engine/probability'
import type { PityGroup } from '../engine/types'

export interface FiveStarRecord {
  readonly entry: HistoryEntry
  readonly pulls: number
  readonly ratio: number
  readonly hue: number
}

/** History is already newest-first. Keep every event, including repeated item IDs. */
export function fiveStarHistory(
  history: readonly HistoryEntry[],
  group: PityGroup | undefined,
  kind: WarpBannerKind | undefined,
): { max: number; records: FiveStarRecord[] } {
  const max = kind && isLightCone(kind) ? 80 : 90
  const records =
    !group || !kind
      ? []
      : history
          .filter(({ event }) => event.pityGroup === group && event.rarity === 5)
          .map((entry) => {
            const pulls = entry.event.pityBefore.pullsSinceLast5 + 1
            return { entry, pulls, ratio: pulls / max, hue: 120 * (1 - (pulls - 1) / (max - 1)) }
          })
  return { max, records }
}
