import type { CharacterRecord } from '../data/schema'
import type { ToolLocale } from '../../../locales/types'

export const normalizeSearch = (value: string): string =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s·•・—_\-/]+/g, '')
function compareText(a: string, b: string): number {
  const left = Array.from(a, (c) => c.codePointAt(0)!)
  const right = Array.from(b, (c) => c.codePointAt(0)!)
  for (let i = 0; i < Math.min(left.length, right.length); i++)
    if (left[i] !== right[i]) return left[i] - right[i]
  return left.length - right.length
}
export function createCharacterSearch(characters: readonly CharacterRecord[], locale: ToolLocale) {
  const entries = characters.map((character) => ({
    character,
    canonical: normalizeSearch(character.names[locale]),
    labels: [
      { value: character.names[locale], authority: 0 },
      ...character.aliases[locale].official.map((value) => ({ value, authority: 1 })),
      ...character.aliases[locale].player.map((value) => ({ value, authority: 2 })),
    ].map((label) => ({ ...label, normalized: normalizeSearch(label.value) })),
  }))
  return (query: string): CharacterRecord[] => {
    const needle = normalizeSearch(query)
    if (!needle) return [...characters]
    return entries
      .flatMap((entry) => {
        const rank = Math.min(
          ...entry.labels.map((label) => {
            const quality =
              label.normalized === needle
                ? 0
                : label.normalized.startsWith(needle)
                  ? 1
                  : label.normalized.includes(needle)
                    ? 2
                    : Infinity
            return quality * 3 + label.authority
          }),
        )
        return Number.isFinite(rank) ? [{ ...entry, rank }] : []
      })
      .sort(
        (a, b) =>
          a.rank - b.rank ||
          compareText(a.canonical, b.canonical) ||
          compareText(a.character.id, b.character.id),
      )
      .map((entry) => entry.character)
  }
}
