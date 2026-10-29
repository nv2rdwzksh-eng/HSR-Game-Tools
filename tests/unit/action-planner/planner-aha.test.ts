import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import catalog from '../../../src/tools/action-planner/data/game/catalog.json'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'
import {
  emptyDocument,
  parsePlannerDocument,
  preparePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
  PLANNER_FORMAT,
  PLANNER_VERSION,
} from '../../../src/tools/action-planner/model/document-file'
import { createPlannerPersistence } from '../../../src/tools/action-planner/model/persistence'
import { resolveElationContributors } from '../../../src/tools/action-planner/model/aha-config'
import { setupDraft, buildBattleSetup } from '../../../src/tools/action-planner/model/battle-setup'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { usePlannerPresentation } from '../../../src/tools/action-planner/composables/usePlannerPresentation'
import { loadPlannerTemplate } from '../../../src/tools/action-planner/templates/loader'
import { nodeCamp } from '../../../src/tools/action-planner/model/naming'
import type { PlannerDocument } from '../../../src/tools/action-planner/model/editor'

const elationId = catalog.characters.find((c) => c.form.pathCode === 'Elation')!.id
const file = (document: PlannerDocument) => ({
  format: PLANNER_FORMAT,
  version: PLANNER_VERSION,
  document,
})
function elationDocument() {
  const doc = syntheticDocument()
  doc.metadata.characterIds['editor-1'] = elationId
  doc.plan.aha.contributorIds = ['editor-1']
  return doc
}
function legacy(document: PlannerDocument, version: 1 | 2) {
  const { aha, cycleMode, ...rest } = document.plan
  void aha
  return {
    format: PLANNER_FORMAT,
    version,
    document: { ...document, plan: { ...rest, ...(version === 2 ? { cycleMode } : {}) } },
  }
}

describe('Aha document, identity and editor integration', () => {
  it.each([1, 2] as const)(
    'migrates strict Version %s without changing existing identities or source objects',
    (version) => {
      const input = legacy(elationDocument(), version)
      const source = JSON.stringify(input)
      const parsed = parsePlannerDocument(source)
      expect(parsed.document.plan.aha).toEqual({
        id: 'aha-instant',
        baseSpeed: 80,
        contributorIds: ['editor-1'],
      })
      expect(parsed.migration).toEqual({ fromVersion: version, ahaAdded: true })
      expect(parsed.document.plan.actors).toEqual(input.document.plan.actors)
      expect(parsed.document.plan.events).toEqual(input.document.plan.events)
      expect(parsed.document.metadata).toEqual(input.document.metadata)
      expect(JSON.stringify(input)).toBe(source)
      const prepared = preparePlannerDocument(parsed.document, parsed.issues, parsed.migration)
      expect(prepared.migration).toEqual(parsed.migration)
      expect(prepared.result.records.some((r) => r.kind === 'aha')).toBe(true)
      expect(JSON.parse(serializePlannerDocument(parsed.document)).version).toBe(9)
      expect(() =>
        validatePlannerFile({
          ...input,
          document: {
            ...input.document,
            plan: { ...input.document.plan, aha: parsed.document.plan.aha },
          },
        }),
      ).toThrow('structure')
    },
  )
  it.each(['moc', 'aa'] as const)(
    'preserves Version 2 %s boundary operations during Aha migration',
    (cycleMode) => {
      const doc = elationDocument()
      doc.plan.cycleMode = cycleMode
      doc.plan.events.push({
        anchor: { kind: 'cycleBoundary', ordinal: 1 },
        operations: [
          {
            id: 'boundary-speed',
            type: 'addSpeedModifier',
            target: { kind: 'allies' },
            mode: 'flat',
            amount: 1,
            duration: { kind: 'turns', turns: null },
          },
        ],
      })
      const parsed = validatePlannerFile(legacy(doc, 2))
      expect(parsed.document.plan.cycleMode).toBe(cycleMode)
      expect(parsed.document.plan.events).toEqual(doc.plan.events)
      expect(preparePlannerDocument(parsed.document).result.stopReason).not.toBe('error')
    },
  )
  it.each(['advance', 'delay', 'immediatelyAct'] as const)(
    'rejects forged Version 3 Aha %s operations at the file boundary',
    (type) => {
      const doc = elationDocument()
      const target = { kind: 'participants' as const, participantIds: [doc.plan.aha.id] }
      doc.plan.events[0]!.operations.push(
        type === 'immediatelyAct'
          ? { id: 'illegal', type, target }
          : { id: 'illegal', type, target, percent: 10 },
      )
      expect(() => validatePlannerFile(file(doc))).toThrow('structure')
    },
  )
  it('allocates IDs around actors, operations and orphan anchors/targets without rebinding', () => {
    const doc = elationDocument()
    doc.plan.actors[1]!.id = 'aha-instant:3'
    doc.plan.events.push({
      anchor: { kind: 'trigger', participantId: 'aha-instant' },
      operations: [],
    })
    doc.plan.events[0]!.operations[0]!.id = 'aha-instant:2'
    doc.plan.events[0]!.operations.push({
      id: 'orphan',
      type: 'addSpeedModifier',
      target: { kind: 'participants', participantIds: ['aha-instant:4'] },
      mode: 'flat',
      amount: 1,
      duration: { kind: 'turns', turns: null },
    })
    const parsed = validatePlannerFile(legacy(doc, 2))
    expect(parsed.document.plan.aha.id).toBe('aha-instant:5')
    expect(parsed.document.plan.events).toEqual(doc.plan.events)
    const prepared = preparePlannerDocument(parsed.document)
    expect(prepared.result.diagnostics.some((d) => d.code === 'missing-target')).toBe(true)
  })
  it('round-trips custom base speed and speed operations without runtime modifiers', () => {
    const doc = elationDocument()
    doc.plan.aha.baseSpeed = 95.125
    doc.plan.events[0]!.operations.push({
      id: 'aha-speed',
      type: 'addSpeedModifier',
      target: { kind: 'participants', participantIds: [doc.plan.aha.id] },
      mode: 'percent',
      amount: 20,
      duration: { kind: 'turns', turns: 1 },
    })
    const serialized = serializePlannerDocument(doc)
    expect(parsePlannerDocument(serialized).document).toEqual(doc)
    expect(serialized).not.toContain('"modifiers"')
    expect(serialized).not.toContain('"remainingAG"')
    expect(() =>
      validatePlannerFile({
        ...file(doc),
        document: { ...doc, plan: { ...doc.plan, aha: { ...doc.plan.aha, modifiers: [] } } },
      }),
    ).toThrow('structure')
  })
  it('preserves saved Version 3 facts when known identities disagree or resources are missing', () => {
    const doc = elationDocument()
    doc.metadata.characterIds['editor-1'] = '1001'
    const mismatch = validatePlannerFile(file(doc))
    expect(mismatch.document.plan.aha.contributorIds).toEqual(['editor-1'])
    expect(mismatch.issues).toContainEqual({ kind: 'elationMismatch', id: 'editor-1' })
    doc.metadata.characterIds['editor-1'] = 'unavailable'
    const missing = validatePlannerFile(file(doc))
    expect(missing.document.plan.aha.contributorIds).toEqual(['editor-1'])
    expect(missing.issues).toContainEqual({ kind: 'unknownElation', id: 'editor-1' })
    const old = validatePlannerFile(legacy(doc, 2))
    expect(old.document.plan.aha.contributorIds).toEqual([])
    expect(old.issues).toContainEqual({ kind: 'unknownElation', id: 'editor-1' })
  })
  it('recognizes Elation by form identity and preserves only unchanged unknown contributors', () => {
    const doc = elationDocument()
    expect(
      resolveElationContributors(doc.plan.actors, doc.metadata.characterIds).contributorIds,
    ).toEqual(['editor-1'])
    doc.metadata.characterIds['editor-1'] = '1001'
    expect(
      resolveElationContributors(doc.plan.actors, doc.metadata.characterIds, ['editor-1'])
        .contributorIds,
    ).toEqual([])
    delete doc.metadata.characterIds['editor-1']
    expect(
      resolveElationContributors(doc.plan.actors, doc.metadata.characterIds, ['editor-1'])
        .contributorIds,
    ).toEqual(['editor-1'])
    doc.plan.actors[0]!.id = 'replacement'
    expect(resolveElationContributors(doc.plan.actors, {}, ['editor-1']).contributorIds).toEqual([])
    const forms = catalog.characters.filter(
      (c) => c.form.pathCode === 'Elation' && 'gender' in c.form,
    )
    expect(forms.length).toBeGreaterThan(0)
    for (const form of forms)
      expect(
        resolveElationContributors([{ ...doc.plan.actors[0]!, id: 'form' }], { form: form.id })
          .contributorIds,
      ).toEqual(['form'])
  })
  it('commits setup once, preserves speed-edit IDs, and restores hidden Aha operations', () => {
    const doc = elationDocument()
    doc.plan.aha.baseSpeed = 91
    doc.plan.events.push({
      anchor: { kind: 'action', participantId: doc.plan.aha.id, turn: 1 },
      operations: [
        {
          id: 'aha-op',
          type: 'addSpeedModifier',
          phase: 'postAction',
          target: { kind: 'participants', participantIds: [doc.plan.aha.id] },
          mode: 'flat',
          amount: 25,
          duration: { kind: 'turns', turns: 1 },
        },
      ],
    })
    doc.metadata.customNames['aha-op'] = 'Custom Aha buff'
    const p = useActionPlanner(doc.plan, doc.metadata)
    const draft = setupDraft(doc.plan, doc.metadata)
    draft.allies[0]!.panelSpeed = 180
    expect(p.plan.value.actors[0]!.panelSpeed).not.toBe(180)
    const built = buildBattleSetup(draft.allies, draft.enemies, 60, 600)
    expect(p.applySetup(built.actors, 60, 600, built.characters)).toBe(true)
    expect(p.plan.value.actors[0]!.id).toBe('editor-1')
    expect(p.plan.value.aha.baseSpeed).toBe(91)
    expect(p.result.value.snapshots[0]!.queue.find((q) => q.kind === 'aha')!.effectiveSpeed).toBe(
      129,
    )
    const alliesRemoved = p.plan.value.actors.filter((a) => a.camp === 'enemy')
    expect(p.applySetup(alliesRemoved, 60, 600, {})).toBe(true)
    expect(p.plan.value.aha).toEqual({ id: doc.plan.aha.id, baseSpeed: 91, contributorIds: [] })
    expect(p.result.value.records.some((r) => r.kind === 'aha')).toBe(false)
    expect(p.document.value.metadata.customNames['aha-op']).toBe('Custom Aha buff')
    expect(
      p.unreached.value.some(
        (e) => e.anchor.kind === 'action' && e.anchor.participantId === doc.plan.aha.id,
      ),
    ).toBe(true)
    expect(p.applySetup(built.actors, 60, 600, built.characters)).toBe(true)
    expect(p.plan.value.aha.id).toBe(doc.plan.aha.id)
    expect(p.result.value.records.some((r) => r.kind === 'aha')).toBe(true)
    expect(p.nextId()).not.toBe(doc.plan.aha.id)
  })
  it('restores legacy storage without writing and shares migration with templates', () => {
    const source = JSON.stringify(legacy(elationDocument(), 2))
    const store = {
      raw: source,
      writes: 0,
      getItem() {
        return this.raw
      },
      setItem(_key: string, value: string) {
        this.raw = value
        this.writes++
      },
    }
    const persistence = createPlannerPersistence(() => store)
    const restored = persistence.initialize()
    expect(restored.migration?.ahaAdded).toBe(true)
    expect(store.writes).toBe(0)
    expect(store.raw).toBe(source)
    expect(persistence.save(restored.document)).toBe(true)
    expect(JSON.parse(store.raw).version).toBe(9)
    expect(persistence.save(restored.document)).toBe(true)
    store.raw = 'external change'
    expect(persistence.save(restored.document)).toBe(false)
    expect(store.raw).toBe('external change')
    const template = loadPlannerTemplate({
      id: 'synthetic',
      order: 0,
      nameKey: 'test',
      descriptionKey: 'test',
      file: JSON.parse(source),
    })
    expect(template.migration?.ahaAdded).toBe(true)
  })
  it('rejects invalid imports before replacing the current document and protects bad storage', () => {
    const doc = elationDocument(),
      p = useActionPlanner(doc.plan, doc.metadata)
    const previous = p.document.value,
      result = p.result.value
    const bad = structuredClone(doc)
    bad.plan.aha.baseSpeed = 0
    expect(p.restoreDocument(bad)).toBe(false)
    expect(p.document.value).toBe(previous)
    expect(p.result.value).toBe(result)
    const persistence = createPlannerPersistence(() => ({
      getItem: () => JSON.stringify(file(bad)),
      setItem: () => {
        throw new Error('must not write')
      },
    }))
    expect(persistence.initialize().document).toEqual(emptyDocument())
    expect(persistence.status).toBe('protected')
    expect(persistence.save(doc)).toBe(false)
  })
  it('localizes neutral Aha identity without replaying the engine or persisting titles', () => {
    const doc = elationDocument(),
      p = useActionPlanner(doc.plan, doc.metadata)
    const i18n = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zh, en } })
    const presentation = usePlannerPresentation(p.document, i18n.global.locale, i18n.global.t)
    const result = p.result.value
    expect(presentation.label(doc.plan.aha.id)).toBe(zh.planner.aha.name)
    expect(nodeCamp({ kind: 'aha', camp: 'neutral' })).toBe('neutral')
    i18n.global.locale.value = 'en'
    expect(presentation.label(doc.plan.aha.id)).toBe(en.planner.aha.name)
    expect(p.result.value).toBe(result)
    expect(serializePlannerDocument(doc)).not.toContain('Aha Instant')
  })
})
