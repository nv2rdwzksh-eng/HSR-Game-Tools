import { ordinaryNode } from '../../fixtures/action-planner/ordinary-node'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../../src/tools/action-planner/engine/validation'
import { createInitialState, simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import {
  operationTargets,
  selectableTargets,
} from '../../../src/tools/action-planner/engine/targeting'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { buildBattleSetup, setupDraft } from '../../../src/tools/action-planner/model/battle-setup'
import {
  emptyDocument,
  PLANNER_FORMAT,
  serializePlannerDocument,
  parsePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'
import {
  plannerTemplates,
  type PlannerTemplate,
} from '../../../src/tools/action-planner/templates/catalog'
import {
  loadPlannerTemplate,
  validatePlannerTemplates,
} from '../../../src/tools/action-planner/templates/loader'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'

describe('reviewed template registry', () => {
  const template = (): PlannerTemplate => ({
    id: 'synthetic-test-only',
    order: 0,
    nameKey: 'test.name',
    descriptionKey: 'test.description',
    file: { format: PLANNER_FORMAT, version: 3, document: syntheticDocument() },
  })
  const messages = { test: { name: 'Synthetic fixture', description: 'Tests only' } }
  it('allows an empty production catalog and validates ordinary files and message registration', () => {
    expect(plannerTemplates).toHaveLength(0)
    expect(validatePlannerTemplates([], [messages, messages])).toBe(0)
    expect(validatePlannerTemplates([template()], [messages, messages])).toBe(1)
    expect(() => validatePlannerTemplates([template(), template()], [messages])).toThrow()
    expect(() => validatePlannerTemplates([template()], [{}])).toThrow()
    expect(() =>
      loadPlannerTemplate({ ...template(), file: { ...(template().file as object), version: 8 } }),
    ).toThrow('version')
  })
  it('loads independently, replaces rather than merges, and keeps invalid templates atomic', () => {
    const source = template()
    const first = loadPlannerTemplate(source)
    const second = loadPlannerTemplate(source)
    first.document.plan.actors[0]!.panelSpeed = 999
    expect(second.document.plan.actors[0]!.panelSpeed).toBe(
      syntheticDocument().plan.actors[0]!.panelSpeed,
    )
    expect(loadPlannerTemplate(source).document).toEqual(syntheticDocument())
    const p = useActionPlanner()
    p.rename('Old name')
    p.restoreDocument(second.document)
    expect(p.document.value).toEqual(syntheticDocument())
    const previous = p.document.value
    expect(() =>
      loadPlannerTemplate({
        ...source,
        file: { format: PLANNER_FORMAT, version: 3, document: { name: 'Bad' } },
      }),
    ).toThrow()
    expect(p.document.value).toBe(previous)
  })
})

describe('initial allied and enemy setup', () => {
  it.each([0, 1, 5])('applies %i enemies with single SPD and independent positions', (count) => {
    const doc = syntheticDocument()
    const setup = setupDraft(doc.plan, doc.metadata)
    setup.enemies = Array.from({ length: count }, (_, index) => ({
      id: `enemy-${index}`,
      name: 'Same name allowed',
      speed: 100.125 + index,
    }))
    const built = buildBattleSetup(setup.allies, setup.enemies, 8, 600)
    expect(built.invalid).toEqual([])
    expect(
      built.actors
        .filter((a) => a.camp === 'enemy')
        .map((a) => [a.position, a.baseSpeed, a.panelSpeed]),
    ).toEqual(setup.enemies.map((e, i) => [i, e.speed, e.speed]))
    expect(built.actors[0]!.position).toBe(0)
    expect(validatePlan({ ...doc.plan, actors: built.actors })).toEqual([])
  })
  it('rejects six initial enemies and blank speed without partially applying either side', () => {
    const p = useActionPlanner()
    p.restoreDocument(syntheticDocument())
    const original = p.document.value
    const setup = setupDraft(original.plan, original.metadata)
    setup.allies[0]!.panelSpeed = 200
    setup.enemies[0]!.speed = undefined
    expect(buildBattleSetup(setup.allies, setup.enemies, 8, 600).invalid).toContain('enemy-speed-0')
    expect(p.document.value).toBe(original)
    setup.enemies = Array.from({ length: 6 }, (_, index) => ({
      id: `enemy-${index}`,
      name: 'Enemy',
      speed: 100,
    }))
    expect(buildBattleSetup(setup.allies, setup.enemies, 8, 600).invalid).toContain('roster')
    const enemies = setup.enemies.map((e, position) => ({
      id: e.id,
      position,
      name: e.name,
      kind: 'actor' as const,
      camp: 'enemy' as const,
      baseSpeed: 100,
      panelSpeed: 100,
    }))
    expect(p.applySetup(enemies, 8, 600, {})).toBe(false)
    expect(p.document.value).toBe(original)
  })
  it('preserves imported fields and identities, keeps both camps, and prunes replaced character mappings', () => {
    const p = useActionPlanner()
    const doc = syntheticDocument()
    doc.plan.actors[0]!.initialAG = 6500
    doc.plan.actors[0]!.actionLimit = 4
    doc.metadata.characterIds['editor-1'] = 'missing-character'
    p.restoreDocument(doc)
    const setup = setupDraft(p.plan.value, p.document.value.metadata)
    setup.allies[0]!.panelSpeed = 160
    let built = buildBattleSetup(setup.allies, setup.enemies, 8, 600)
    p.applySetup(built.actors, 8, 600, built.characters)
    expect(p.plan.value.actors[0]).toMatchObject({
      id: 'editor-1',
      panelSpeed: 160,
      initialAG: 6500,
      actionLimit: 4,
    })
    expect(p.plan.value.actors[1]!.id).toBe('enemy-1')
    setup.enemies[0]!.name = 'Renamed enemy'
    setup.enemies[0]!.speed = 120.25
    built = buildBattleSetup(setup.allies, setup.enemies, 8, 600)
    p.applySetup(built.actors, 8, 600, built.characters)
    expect(p.plan.value.actors[0]!.panelSpeed).toBe(160)
    expect(p.plan.value.actors[1]).toMatchObject({
      id: 'enemy-1',
      baseSpeed: 120.25,
      panelSpeed: 120.25,
      initialAG: 5000,
    })
    setup.allies[0] = { id: '', characterId: '', baseSpeed: undefined, panelSpeed: undefined }
    built = buildBattleSetup(setup.allies, setup.enemies, 8, 600)
    p.applySetup(built.actors, 8, 600, built.characters)
    expect(p.document.value.metadata.characterIds).toEqual({})
    expect(
      p.plan.value.events.some(
        (e) => e.anchor.kind === 'action' && e.anchor.participantId === 'editor-1',
      ),
    ).toBe(true)
    expect(p.nextId()).not.toBe('editor-1')
  })
  it('keeps enemy nodes and targets in the same engine and preserves them through JSON', () => {
    const doc = syntheticDocument()
    doc.plan.events.push({
      anchor: { kind: 'action', participantId: 'enemy-1', turn: 1 },
      operations: [
        {
          id: 'enemy-action',
          type: 'advance',
          phase: 'postAction',
          percent: 20,
          target: { kind: 'allies' },
        },
      ],
    })
    const state = createInitialState(doc.plan)
    const enemies = operationTargets(state).filter((p) => p.camp === 'enemy')
    expect(
      selectableTargets('advance', operationTargets(state), []).some(
        (p) => p.id === enemies[0]!.id,
      ),
    ).toBe(true)
    expect(simulatePlan(doc.plan).records.some((r) => ordinaryNode(r).camp === 'enemy')).toBe(true)
    expect(parsePlannerDocument(serializePlannerDocument(doc)).document).toEqual(doc)
  })
  it('does not apply the initial enemy count limit to dynamic spawns', () => {
    const doc = emptyDocument()
    doc.plan.events = [
      {
        anchor: { kind: 'start' },
        operations: Array.from({ length: 6 }, (_, index) => ({
          id: `dynamic-${index}`,
          type: 'spawnParticipant' as const,
          participant: {
            kind: 'actor' as const,
            camp: 'enemy' as const,
            name: 'Dynamic enemy',
            category: 'enemy' as const,
            baseSpeed: 100,
            panelSpeed: 100,
          },
        })),
      },
    ]
    expect(
      parsePlannerDocument(serializePlannerDocument(doc)).document.plan.events[0]!.operations,
    ).toHaveLength(6)
    expect(simulatePlan(doc.plan).stopReason).not.toBe('error')
  })
})
