import type { Lineup, Snapshot } from '../types'
import { positiveInteger, record } from '../validation'
import { assetUrl, type VisualCatalog } from './visuals'

export interface CraftMaterial {
  id: number
  name: string
  icon?: string
}

export interface EmblemRecipe {
  craftIds: number[]
  materials: [number, number]
}

export interface CurrencyWarsCraftCatalog {
  schemaVersion: 1
  seasonId: number
  materials: CraftMaterial[]
  recipes: Record<string, EmblemRecipe[]>
}

export function assertCraftCatalog(
  value: unknown,
  snapshot: Snapshot,
  seasonId = 1,
): asserts value is CurrencyWarsCraftCatalog {
  function requireValue(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error('Invalid craft catalog: ' + message)
  }
  requireValue(
    record(value) && value.schemaVersion === 1 && value.seasonId === seasonId,
    'version/season',
  )
  requireValue(Array.isArray(value.materials) && record(value.recipes), 'materials/recipes')
  const materials = new Set<number>()
  for (const material of value.materials) {
    requireValue(
      record(material) && positiveInteger(material.id) && !materials.has(material.id),
      'material ID',
    )
    requireValue(typeof material.name === 'string' && material.name.trim(), 'material name')
    requireValue(
      material.icon === undefined ||
        material.icon === `game-assets/currency-war-equipments/${material.id}.webp`,
      'material icon',
    )
    materials.add(material.id)
  }
  const emblemIds = new Set(snapshot.emblems.map((e) => String(e.id)))
  requireValue(Object.keys(value.recipes).length === emblemIds.size, 'emblem coverage')
  const craftIds = new Set<number>()
  const usedMaterials = new Set<number>()
  for (const [id, recipes] of Object.entries(value.recipes)) {
    requireValue(emblemIds.has(id) && Array.isArray(recipes), 'emblem recipes')
    const pairs = new Set<string>()
    for (const recipe of recipes) {
      requireValue(
        record(recipe) &&
          Array.isArray(recipe.materials) &&
          recipe.materials.length === 2 &&
          recipe.materials.every((id) => positiveInteger(id) && materials.has(id)),
        'recipe materials',
      )
      const pair = [...recipe.materials].sort((a, b) => a - b).join(',')
      requireValue(!pairs.has(pair), 'duplicate recipe')
      pairs.add(pair)
      requireValue(Array.isArray(recipe.craftIds) && recipe.craftIds.length > 0, 'craft IDs')
      for (const craftId of recipe.craftIds) {
        requireValue(
          positiveInteger(craftId) && !craftIds.has(craftId),
          'duplicate/invalid craft ID',
        )
        craftIds.add(craftId)
      }
      for (const materialId of recipe.materials) usedMaterials.add(materialId)
    }
  }
  requireValue(materials.size === usedMaterials.size, 'unused materials')
}

/** Count actual equipment in the single lineup, without changing the lineup or session. */
export function summarizeEmblemDemand(solution: { lineup: Lineup }) {
  const counts = new Map<number, number>()
  for (const member of solution.lineup.members)
    for (const id of member.emblemIds) counts.set(id, (counts.get(id) ?? 0) + 1)
  return [...counts]
    .map(([emblemId, count]) => ({ emblemId, count }))
    .sort((a, b) => b.count - a.count || a.emblemId - b.emblemId)
}

export function createEmblemDemand(
  solution: { lineup: Lineup },
  snapshot: Snapshot,
  catalog: CurrencyWarsCraftCatalog,
  visuals: VisualCatalog,
  base: string,
) {
  const materials = new Map(catalog.materials.map((material) => [material.id, material]))
  const emblems = new Map(snapshot.emblems.map((emblem) => [emblem.id, emblem]))
  return summarizeEmblemDemand(solution).map(({ emblemId, count }) => {
    const emblem = emblems.get(emblemId)!
    return {
      emblemId,
      name: emblem.name,
      count,
      icon: assetUrl(visuals.emblems[String(emblem.traitId)], base),
      recipes: catalog.recipes[String(emblemId)].map((recipe) => ({
        craftIds: recipe.craftIds,
        materials: recipe.materials.map((id) => {
          const material = materials.get(id)!
          return { ...material, icon: assetUrl(material.icon, base) }
        }),
      })),
    }
  })
}

export type EmblemDemand = ReturnType<typeof createEmblemDemand>[number]
