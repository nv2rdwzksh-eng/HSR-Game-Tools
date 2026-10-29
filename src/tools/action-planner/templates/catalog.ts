/** Register only reviewed ordinary Version 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8 / 9 JSON files; no generated or guessed teams. */
export interface PlannerTemplate {
  id: string
  order: number
  nameKey: string
  descriptionKey: string
  conditionKey?: string
  gameVersion?: string
  file: unknown
}
export const plannerTemplates: readonly PlannerTemplate[] = []
