import { HARD_LIMITS } from '../engine/queue'
import type { ActorConfig, SimulationPlan } from '../engine/types'
import type { PlannerMetadata } from './editor'
import { metadataValue } from './editor'
import { FILE_LIMITS } from './document-file'

export interface AllySlot {
  id: string
  characterId: string
  original?: ActorConfig
  baseSpeed: number | undefined
  panelSpeed: number | undefined
}
export interface EnemyDraft {
  id: string
  name: string
  speed: number | undefined
  original?: ActorConfig
}
export function setupDraft(plan: SimulationPlan, metadata: PlannerMetadata) {
  const allies: AllySlot[] = Array.from({ length: 4 }, (_, position) => {
    const actor = plan.actors.find((actor) => actor.camp === 'ally' && actor.position === position)
    return {
      id: actor?.id ?? '',
      characterId: actor ? (metadataValue(metadata.characterIds, actor.id) ?? '') : '',
      original: actor ? { ...actor } : undefined,
      baseSpeed: actor?.baseSpeed,
      panelSpeed: actor?.panelSpeed,
    }
  })
  const enemies: EnemyDraft[] = plan.actors
    .filter((actor) => actor.camp === 'enemy')
    .sort((a, b) => a.position - b.position)
    .map((actor) => ({
      id: actor.id,
      name: actor.name,
      speed: actor.baseSpeed,
      original: { ...actor },
    }))
  return { allies, enemies }
}
export function buildBattleSetup(
  allies: AllySlot[],
  enemies: EnemyDraft[],
  maxNodes?: number,
  maxAV?: number,
) {
  const invalid: string[] = []
  const positive = (value?: number) => value !== undefined && Number.isFinite(value) && value > 0
  if (allies.length !== 4 || enemies.length > 5) invalid.push('roster')
  allies.forEach((slot, index) => {
    if (!slot.id) return
    if (!positive(slot.baseSpeed)) invalid.push(`base-${index}`)
    if (!positive(slot.panelSpeed)) invalid.push(`panel-${index}`)
  })
  enemies.forEach((enemy, index) => {
    if (!enemy.name.trim() || enemy.name.length > FILE_LIMITS.displayName)
      invalid.push(`enemy-name-${index}`)
    if (!positive(enemy.speed)) invalid.push(`enemy-speed-${index}`)
  })
  if (!positive(maxNodes) || !Number.isSafeInteger(maxNodes) || maxNodes! > HARD_LIMITS.maxNodes)
    invalid.push('maxNodes')
  if (!positive(maxAV) || maxAV! > HARD_LIMITS.maxAV) invalid.push('maxAV')
  const actors: ActorConfig[] = invalid.length
    ? []
    : [
        ...allies.flatMap((slot, position) =>
          slot.id && slot.original
            ? [
                {
                  ...slot.original,
                  id: slot.id,
                  camp: 'ally' as const,
                  position,
                  baseSpeed: slot.baseSpeed!,
                  panelSpeed: slot.panelSpeed!,
                },
              ]
            : [],
        ),
        ...enemies.map((enemy, position) => ({
          ...enemy.original,
          id: enemy.id,
          name: enemy.name.trim(),
          kind: 'actor' as const,
          camp: 'enemy' as const,
          category: 'enemy' as const,
          position,
          baseSpeed: enemy.speed!,
          panelSpeed: enemy.speed!,
          actionLimit: enemy.original?.actionLimit ?? null,
        })),
      ]
  const characters = Object.fromEntries(
    allies.filter((slot) => slot.id && slot.characterId).map((slot) => [slot.id, slot.characterId]),
  )
  return { actors, characters, invalid }
}
