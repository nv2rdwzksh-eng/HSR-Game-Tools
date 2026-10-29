import catalog from '../data/game/catalog.json'
import type { ActorConfig } from '../engine/types'

/** Resolve only initial allies. Unknown unchanged identities retain saved engine facts. */
export function resolveElationContributors(
  actors: readonly ActorConfig[],
  characterIds: Readonly<Record<string, string>>,
  retainedIds: readonly string[] = [],
) {
  const contributorIds: string[] = []
  const unresolvedIds: string[] = []
  for (const actor of actors) {
    if (actor.camp !== 'ally') continue
    const characterId = Object.hasOwn(characterIds, actor.id) ? characterIds[actor.id] : undefined
    const character = catalog.characters.find((c) => c.id === characterId)
    if (character) {
      if (character.form.pathCode === 'Elation') contributorIds.push(actor.id)
    } else {
      unresolvedIds.push(actor.id)
      if (retainedIds.includes(actor.id)) contributorIds.push(actor.id)
    }
  }
  return { contributorIds, unresolvedIds }
}
