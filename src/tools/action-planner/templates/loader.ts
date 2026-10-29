import { validatePlannerFile } from '../model/document-file'
import type { PlannerTemplate } from './catalog'

export const loadPlannerTemplate = (template: PlannerTemplate) => validatePlannerFile(template.file)
export function validatePlannerTemplates(
  templates: readonly PlannerTemplate[],
  messages: readonly unknown[],
) {
  const ids = new Set<string>()
  const message = (root: unknown, key: string): unknown =>
    key
      .split('.')
      .reduce<unknown>(
        (value, part) =>
          value && typeof value === 'object' && Object.hasOwn(value, part)
            ? (value as Record<string, unknown>)[part]
            : undefined,
        root,
      )
  for (const template of templates) {
    if (!template.id.trim() || ids.has(template.id) || !Number.isFinite(template.order))
      throw new Error('Invalid template identity or order')
    ids.add(template.id)
    for (const key of [
      template.nameKey,
      template.descriptionKey,
      ...(template.conditionKey ? [template.conditionKey] : []),
    ])
      if (
        messages.some(
          (root) =>
            typeof message(root, key) !== 'string' || !(message(root, key) as string).trim(),
        )
      )
        throw new Error(`Missing template message: ${key}`)
    loadPlannerTemplate(template)
  }
  return templates.length
}
