import { computed, type Ref } from 'vue'
import { gameData, characterName, assetUrl } from '../data/adapters/game-data'
import { participantCatalog } from '../engine/validation'
import type { EffectOperation, EventAnchor, SimulationState } from '../engine/types'
import type { MessageTranslator, ToolLocale } from '../../../locales/types'
import type { PlannerDocument } from '../model/editor'
import { metadataValue } from '../model/editor'
import { participantLabels } from '../model/naming'
import { operationName, renderMessage } from '../model/presentation'
import { safeImagePath } from '../model/document-file'
export function usePlannerPresentation(
  document: Readonly<Ref<PlannerDocument>>,
  locale: Ref<string>,
  t: MessageTranslator,
) {
  const catalog = computed(() => participantCatalog(document.value.plan))
  const character = (id: string) =>
    gameData.characters.find(
      (c) => c.id === metadataValue(document.value.metadata.characterIds, id),
    )
  const rawName = (id: string) => {
    if (id === document.value.plan.aha.id) return t('planner.aha.name')
    const c = character(id)
    return c
      ? characterName(c, locale.value as ToolLocale)
      : (catalog.value.find((p) => p.id === id)?.name ?? t('planner.removedUnit'))
  }
  const labels = computed(() => participantLabels(catalog.value, rawName))
  const label = (id: string) => labels.value.get(id) ?? rawName(id)
  const image = (id: string) => {
    const path = safeImagePath(catalog.value.find((p) => p.id === id)?.iconUrl)
    return (
      assetUrl(character(id)?.assetKey) ??
      (path ? import.meta.env.BASE_URL.replace(/\/?$/, '/') + path : undefined)
    )
  }
  const title = (operation: EffectOperation, state?: SimulationState) =>
    operationName(
      operation,
      locale.value as ToolLocale,
      t,
      label,
      state,
      metadataValue(document.value.metadata.customNames, operation.id),
    )
  const anchorLabel = (anchor: EventAnchor) =>
    anchor.kind === 'start'
      ? t('ui.start')
      : anchor.kind === 'cycleBoundary'
        ? renderMessage(
            { key: 'planner.anchor.cycleBoundary', params: { ordinal: anchor.ordinal } },
            locale.value as ToolLocale,
            t,
          )
        : renderMessage(
            {
              key: `planner.anchor.${anchor.kind}`,
              params: {
                name: label(anchor.participantId),
                ...(anchor.kind === 'action' ? { turn: anchor.turn } : {}),
              },
            },
            locale.value as ToolLocale,
            t,
          )
  return { catalog, label, image, title, anchorLabel }
}
