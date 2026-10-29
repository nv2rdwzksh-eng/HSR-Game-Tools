import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import { anchorKey } from '../../../src/tools/action-planner/engine/queue'
import { participantCatalog } from '../../../src/tools/action-planner/engine/validation'
import { operationTargets } from '../../../src/tools/action-planner/engine/targeting'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { usePlannerPresentation } from '../../../src/tools/action-planner/composables/usePlannerPresentation'
import { contextAt } from '../../../src/tools/action-planner/model/editor'
import {
  buildCurrentQueueView,
  currentQueueCards,
} from '../../../src/tools/action-planner/model/current-queue'
import {
  emptyDocument,
  PLANNER_FORMAT,
  PLANNER_VERSION,
  parsePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
} from '../../../src/tools/action-planner/model/document-file'
import { createPlannerPersistence } from '../../../src/tools/action-planner/model/persistence'
import { loadPlannerTemplate } from '../../../src/tools/action-planner/templates/loader'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'
import { projectResult } from '../../fixtures/action-planner/action-planner-cases'
import type { CycleMode, EffectOperation } from '../../../src/tools/action-planner/engine/types'

const boundary = (ordinal = 1) => ({ kind: 'cycleBoundary' as const, ordinal })
function document() {
  const doc = emptyDocument()
  doc.plan.cycleMode = 'moc'
  doc.plan.actors = [
    {
      id: 'a',
      name: 'A',
      kind: 'actor',
      camp: 'ally',
      baseSpeed: 100,
      panelSpeed: 100,
      position: 0,
      initialAG: 20000,
    },
  ]
  return doc
}
const pull: EffectOperation = { id: 'pull', type: 'immediatelyAct', target: { kind: 'allies' } }
function legacyFile() {
  const doc = syntheticDocument()
  const { cycleMode: omitted, aha: omittedAha, ...plan } = doc.plan
  void omitted
  void omittedAha
  return { format: PLANNER_FORMAT, version: 1, document: { ...doc, plan } }
}

describe('cycle planner projection and document compatibility', () => {
  it('merges one pending boundary with queue entries and uses pre-effect state for the current node', () => {
    const doc = document()
    doc.plan.events = [
      {
        anchor: boundary(),
        operations: [
          pull,
          {
            id: 'spawn',
            type: 'spawnParticipant',
            participant: {
              kind: 'actor',
              name: 'Child',
              camp: 'ally',
              baseSpeed: 100,
              panelSpeed: 100,
            },
          },
        ],
      },
    ]
    const result = simulatePlan(doc.plan)
    const initial = currentQueueCards(buildCurrentQueueView(result, 0))
    expect(initial.map((c) => [anchorKey(c.anchor), c.total])).toEqual([
      ['cycleBoundary:1', 150],
      ['action:a:1', 200],
    ])
    const current = currentQueueCards(buildCurrentQueueView(result, 1))
    expect(current.map((c) => [anchorKey(c.anchor), c.total])).toEqual([
      ['cycleBoundary:1', 0],
      ['action:a:1', 50],
    ])
    expect(current[0]!.isCurrent).toBe(true)
    expect(current[0]).not.toHaveProperty('effectiveSpeed')
    const after = currentQueueCards(buildCurrentQueueView(result, 2))
    expect(after.map((c) => anchorKey(c.anchor))).toContain('action:spawn%3Aspawn:1')
    expect(after.map((c) => anchorKey(c.anchor))).toContain('cycleBoundary:2')
    expect(participantCatalog(doc.plan).map((p) => p.id)).toEqual([
      'aha-instant',
      'a',
      'spawn:spawn',
    ])
  })
  it('keeps pending boundary last when ordinary waiting entries have the same zero AV', () => {
    const doc = document()
    doc.plan.actors[0]!.initialAG = 15000
    doc.plan.actors.push({ ...doc.plan.actors[0]!, id: 'b', name: 'B', position: 1 })
    const result = simulatePlan(doc.plan),
      cards = currentQueueCards(buildCurrentQueueView(result, 1))
    expect(cards.map((c) => [anchorKey(c.anchor), c.total])).toEqual([
      ['action:a:1', 0],
      ['action:b:1', 0],
      ['cycleBoundary:1', 0],
    ])
    expect(result.records.slice(0, 3).map((r) => anchorKey(r.anchor))).toEqual([
      'action:a:1',
      'action:b:1',
      'cycleBoundary:1',
    ])
  })
  it('replays a failed cycle context using the same scheduler and repairs its operation', () => {
    const doc = document()
    doc.plan.events = [
      {
        anchor: boundary(2),
        operations: [
          {
            id: 'bad',
            type: 'addSpeedModifier',
            target: { kind: 'allies' },
            mode: 'flat',
            amount: -1000,
            duration: { kind: 'turns', turns: 2 },
          },
        ],
      },
    ]
    const p = useActionPlanner(doc.plan)
    expect(p.result.value.stopReason).toBe('error')
    expect(p.result.value.diagnostics).toContainEqual(
      expect.objectContaining({ anchor: boundary(2), operationId: 'bad' }),
    )
    const context = contextAt(p.plan.value, p.result.value, boundary(2))!
    expect(context.elapsedAV).toBe(250)
    p.select(boundary(2))
    p.edit(p.operations.value[0])
    p.draft.value!.amount = 10
    expect(p.submit()).toBe(true)
    expect(p.result.value.stopReason).not.toBe('error')
  })
  it('supports single-window preview, ordering, metadata names and actor creation at a cycle anchor', () => {
    const p = useActionPlanner(document().plan)
    p.select(boundary())
    p.edit()
    p.draft.value!.type = 'spawnParticipant'
    p.draft.value!.participant.name = 'Child'
    p.draft.value!.participant.baseSpeed = 100
    p.draft.value!.participant.panelSpeed = 100
    expect(p.submit()).toBe(true)
    p.edit()
    p.draft.value!.type = 'immediatelyAct'
    p.draft.value!.targetKind = 'allies'
    p.draft.value!.customName = 'Cycle pull'
    expect(operationTargets(p.preview.value).map((p) => p.id)).toContain('spawn:editor-1')
    expect(p.submit()).toBe(true)
    expect(p.operations.value.every((op) => !('phase' in op))).toBe(true)
    expect(p.document.value.metadata.customNames['editor-2']).toBe('Cycle pull')
    p.move('editor-2', -1)
    expect(p.operations.value.map((op) => op.id)).toEqual(['editor-2', 'editor-1'])
    p.edit(p.operations.value[0])
    p.draft.value!.customName = 'Renamed'
    const before = p.result.value
    expect(p.submit()).toBe(true)
    expect(p.result.value).toBe(before)
    p.remove('editor-1')
    expect(p.operations.value).toHaveLength(1)
  })
  it('preserves cycle anchors, inactive operations and selection through every mode transition', () => {
    const doc = document()
    doc.plan.events = [{ anchor: boundary(), operations: [pull] }]
    const p = useActionPlanner(doc.plan)
    p.stepQueue(1)
    for (const mode of ['aa', 'moc', 'none', 'aa', 'none', 'moc'] as CycleMode[]) {
      expect(p.applySetup(p.plan.value.actors, 60, 600, {}, mode)).toBe(true)
      expect(p.selected.value).toEqual(boundary())
      expect(p.operations.value).toEqual([pull])
      if (mode === 'none') {
        expect(p.inactive.value).toHaveLength(1)
        expect(p.unreached.value).toHaveLength(0)
        expect(p.context.value).toBeUndefined()
        expect(p.queueIndex.value).toBe(0)
        expect(p.result.value.diagnostics.some((d) => d.code === 'unreached-anchor')).toBe(false)
        expect(
          parsePlannerDocument(serializePlannerDocument(p.document.value)).document.plan.events,
        ).toEqual(doc.plan.events)
      } else {
        expect(p.context.value!.elapsedAV).toBe(mode === 'moc' ? 150 : 300)
        expect(p.inactive.value).toHaveLength(0)
      }
    }
    p.applySetup(p.plan.value.actors, 60, 100, {}, 'moc')
    expect(p.unreached.value).toHaveLength(1)
    p.reset()
    expect(p.plan.value.cycleMode).toBe('none')
  })
  it('translates system identity by ordinal without participant metadata', () => {
    const p = useActionPlanner(document().plan)
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } })
    const presentation = usePlannerPresentation(p.document, i18n.global.locale, i18n.global.t)
    expect(presentation.anchorLabel(boundary(2))).toBe(
      i18n.global.t('planner.anchor.cycleBoundary', { ordinal: '2' }),
    )
    i18n.global.locale.value = 'en'
    expect(presentation.anchorLabel(boundary(2))).toBe(
      i18n.global.t('planner.anchor.cycleBoundary', { ordinal: '2' }),
    )
    expect(presentation.catalog.value.map((p) => p.id)).toEqual(['aha-instant', 'a'])
  })
  it('migrates strict Version 1 JSON while preserving original mathematical results and identities', () => {
    const file = legacyFile(),
      parsed = parsePlannerDocument(JSON.stringify(file)).document
    expect(parsed.plan.cycleMode).toBe('none')
    expect(parsed.plan.events).toEqual(file.document.plan.events)
    expect(parsed.metadata).toEqual(file.document.metadata)
    expect(projectResult(simulatePlan(parsed.plan))).toEqual(
      projectResult(simulatePlan(syntheticDocument().plan)),
    )
    expect(JSON.parse(serializePlannerDocument(parsed)).version).toBe(PLANNER_VERSION)
    expect(() =>
      validatePlannerFile({
        ...file,
        document: { ...file.document, plan: { ...file.document.plan, cycleMode: 'none' } },
      }),
    ).toThrow('structure')
    expect(() =>
      validatePlannerFile({
        ...file,
        document: {
          ...file.document,
          plan: { ...file.document.plan, events: [{ anchor: boundary(), operations: [] }] },
        },
      }),
    ).toThrow('structure')
  })
  it.each(['moc', 'aa', 'none'] as const)(
    'round-trips %s Version 3 with stable operations and rejects unknown fields',
    (mode) => {
      const doc = document()
      doc.plan.cycleMode = mode
      doc.plan.events = [{ anchor: boundary(), operations: [pull] }]
      doc.metadata.customNames.pull = 'Custom'
      expect(parsePlannerDocument(serializePlannerDocument(doc)).document).toEqual(doc)
      const file = { format: PLANNER_FORMAT, version: 3, document: doc }
      expect(() => validatePlannerFile({ ...file, version: 8 })).toThrow('version')
      expect(() =>
        validatePlannerFile({
          ...file,
          document: { ...doc, plan: { ...doc.plan, customCycleLength: 42 } },
        }),
      ).toThrow('structure')
      const { cycleMode: omitted, ...noMode } = doc.plan
      void omitted
      expect(() => validatePlannerFile({ ...file, document: { ...doc, plan: noMode } })).toThrow(
        'structure',
      )
      expect(() =>
        validatePlannerFile({
          ...file,
          document: { ...doc, plan: { ...doc.plan, cycleMode: 'pf' } },
        }),
      ).toThrow('structure')
    },
  )
  it('restores old local storage without a write, then saves Version 3 using the same controller', () => {
    const raw = JSON.stringify(legacyFile()),
      store = {
        raw,
        writes: 0,
        getItem() {
          return this.raw
        },
        setItem(_key: string, value: string) {
          this.raw = value
          this.writes++
        },
      }
    const persistence = createPlannerPersistence(() => store),
      initial = persistence.initialize()
    expect(initial.document.plan.cycleMode).toBe('none')
    expect(store.raw).toBe(raw)
    expect(store.writes).toBe(0)
    const p = useActionPlanner(
      initial.document.plan,
      initial.document.metadata,
      initial.document.name,
    )
    p.applySetup(p.plan.value.actors, 60, 600, initial.document.metadata.characterIds, 'aa')
    expect(persistence.save(p.document.value)).toBe(true)
    expect(JSON.parse(store.raw)).toMatchObject({
      version: 7,
      document: { plan: { cycleMode: 'aa' } },
    })
    expect(createPlannerPersistence(() => store).initialize().document.plan.cycleMode).toBe('aa')
  })
  it('loads legacy and current templates through the shared strict parser', () => {
    const template = {
      id: 'test',
      order: 0,
      nameKey: 'test.name',
      descriptionKey: 'test.description',
    }
    expect(loadPlannerTemplate({ ...template, file: legacyFile() }).document.plan.cycleMode).toBe(
      'none',
    )
    expect(
      loadPlannerTemplate({
        ...template,
        file: { format: PLANNER_FORMAT, version: 3, document: document() },
      }).document.plan.cycleMode,
    ).toBe('moc')
  })
})
