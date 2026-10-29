import { describe, expect, it } from 'vitest'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import { spawnedParticipantId } from '../../../src/tools/action-planner/engine/queue'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import {
  FILE_LIMITS,
  PLANNER_FORMAT,
  emptyDocument,
  parsePlannerDocument,
  serializePlannerDocument,
  validatePlannerFile,
  preparePlannerDocument,
  plannerFilename,
} from '../../../src/tools/action-planner/model/document-file'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'

const file = (document = syntheticDocument()) => ({ format: PLANNER_FORMAT, version: 3, document })
describe('Version 3 planner files', () => {
  it('round-trips full committed input, precision, names, identities and engine results', () => {
    const input = syntheticDocument()
    const source = serializePlannerDocument(input)
    const parsed = parsePlannerDocument(source)
    expect(parsed.document).toEqual(input)
    expect(parsed.document).not.toBe(input)
    expect(simulatePlan(parsed.document.plan)).toEqual(simulatePlan(input.plan))
    for (const key of [
      'snapshots',
      'records',
      'beforeEffects',
      'actionChanges',
      'remainingAG',
      'selected',
      'draft',
    ])
      expect(source).not.toContain(`"${key}"`)
    expect(parsePlannerDocument(serializePlannerDocument(emptyDocument())).document).toEqual(
      emptyDocument(),
    )
  })
  it('normalizes only initial enemies to base SPD and leaves dynamic definitions unchanged', () => {
    const input = syntheticDocument()
    input.plan.actors[1]!.panelSpeed = 150
    const parsed = validatePlannerFile(file(input)).document
    expect(parsed.plan.actors[1]!.panelSpeed).toBe(87.25)
    expect(input.plan.actors[1]!.panelSpeed).toBe(150)
    expect(parsed.plan.events[0]!.operations[2]).toEqual(input.plan.events[0]!.operations[2])
  })
  it('preserves missing resources and unreachable anchors while removing unsafe image paths', () => {
    const input = syntheticDocument()
    input.metadata.characterIds['editor-1'] = 'not-in-this-snapshot'
    input.plan.events.push({
      anchor: { kind: 'action', participantId: 'retired-actor', turn: 3 },
      operations: [
        {
          id: 'orphan',
          type: 'advance',
          target: { kind: 'participants', participantIds: ['retired-target'] },
          percent: 10,
          phase: 'postAction',
        },
      ],
    })
    const spawn = input.plan.events[0]!.operations[2]!
    if (spawn.type !== 'spawnParticipant') throw new Error('Fixture')
    spawn.participant.iconUrl = 'http://localhost:5173/arbitrary.svg'
    const parsed = validatePlannerFile(file(input))
    expect(parsed.issues).toEqual([
      { kind: 'missingCharacter', id: 'editor-1' },
      { kind: 'unsafeImage', id: spawnedParticipantId('spawn') },
    ])
    expect(parsed.document.plan.events.at(-1)).toEqual(input.plan.events.at(-1))
    const prepared = preparePlannerDocument(parsed.document, parsed.issues)
    expect(prepared.result.diagnostics.some((d) => d.code === 'unreached-anchor')).toBe(true)
    expect(prepared.issues).toContainEqual(parsed.issues[1])
    expect(prepared.issues).toHaveLength(2)
    expect(serializePlannerDocument(parsed.document)).not.toContain('localhost')
  })
  it('uses character IDs and allows only portable manifest image paths', () => {
    const input = syntheticDocument()
    input.plan.actors[0]!.iconUrl = '/subpath/game-assets/character/1001.webp'
    const spawn = input.plan.events[0]!.operations[2]!
    if (spawn.type !== 'spawnParticipant') throw new Error('Fixture')
    spawn.participant.iconUrl = 'game-assets/character/1001.webp'
    const parsed = validatePlannerFile(file(input))
    expect(parsed.document.plan.actors[0]).not.toHaveProperty('iconUrl')
    expect(parsed.document.plan.events[0]!.operations[2]).toMatchObject({
      participant: { iconUrl: spawn.participant.iconUrl },
    })
    expect(parsed.issues).toEqual([])
  })
  it('rejects invalid JSON, future versions, runtime fields, prototypes and broken metadata', () => {
    expect(() => parsePlannerDocument('{')).toThrow('json')
    expect(() => validatePlannerFile({ ...file(), version: 8 })).toThrow('version')
    expect(() => validatePlannerFile({ ...file(), format: 'other' })).toThrow('format')
    expect(() => validatePlannerFile({ ...file(), runtime: {} })).toThrow('structure')
    const prototype = serializePlannerDocument(syntheticDocument()).replace(
      '"customNames": {',
      '"customNames": {"__proto__": {},',
    )
    expect(() => parsePlannerDocument(prototype)).toThrow('identity')
    const input = syntheticDocument()
    input.metadata.characterIds['enemy-1'] = '1001'
    expect(() => validatePlannerFile(file(input))).toThrow('metadata')
    delete input.metadata.characterIds['enemy-1']
    input.metadata.customNames.missing = 'Wrong identity'
    expect(() => validatePlannerFile(file(input))).toThrow('metadata')
  })
  it('rejects duplicate and conflicting identities, invalid values and initial roster overflow', () => {
    const input = syntheticDocument()
    input.plan.actors[1]!.id = input.plan.actors[0]!.id
    expect(() => validatePlannerFile(file(input))).toThrow('identity')
    const other = syntheticDocument()
    other.plan.actors[1]!.id = spawnedParticipantId('spawn')
    expect(() => validatePlannerFile(file(other))).toThrow()
    other.plan.actors[1]!.id = 'enemy-1'
    other.plan.actors[1]!.baseSpeed = 0
    expect(() => validatePlannerFile(file(other))).toThrow('structure')
    const outside = syntheticDocument()
    outside.plan.actors[1]!.position = 5
    expect(() => validatePlannerFile(file(outside))).toThrow('limit')
  })
  it('enforces file, string, count and depth boundaries', () => {
    expect(() => parsePlannerDocument(' '.repeat(FILE_LIMITS.bytes + 1))).toThrow('limit')
    const input = syntheticDocument()
    input.name = 'n'.repeat(FILE_LIMITS.name + 1)
    expect(() => serializePlannerDocument(input)).toThrow('limit')
    const excessive = syntheticDocument()
    excessive.plan.events = Array.from({ length: FILE_LIMITS.events + 1 }, () => ({
      anchor: { kind: 'start' },
      operations: [],
    }))
    expect(() => validatePlannerFile(file(excessive))).toThrow('limit')
    let deep: unknown = {}
    for (let i = 0; i <= FILE_LIMITS.depth; i++) deep = { nested: deep }
    expect(() => validatePlannerFile(deep)).toThrow('limit')
    expect(() =>
      validatePlannerFile(Array.from({ length: FILE_LIMITS.objects + 1 }, () => ({}))),
    ).toThrow('limit')
  })
  it('restores atomically, accepts runtime diagnostics and reserves live and orphan IDs', () => {
    const input = syntheticDocument()
    const p = useActionPlanner()
    expect(p.restoreDocument(input)).toBe(true)
    const before = p.document.value
    expect(p.restoreDocument({ ...input, name: 'n'.repeat(121) })).toBe(false)
    expect(p.document.value).toBe(before)
    const orphaned = syntheticDocument()
    orphaned.plan.events.push({
      anchor: { kind: 'action', participantId: 'editor-3', turn: 1 },
      operations: [
        {
          id: 'reference',
          type: 'immediatelyAct',
          phase: 'postAction',
          target: {
            kind: 'participants',
            participantIds: [spawnedParticipantId('editor-4'), 'editor-5'],
          },
        },
      ],
    })
    p.restoreDocument(orphaned)
    expect(p.nextId()).toBe('editor-6')
    expect(p.nextId()).toBe('editor-7')
    const badSpeed = syntheticDocument()
    badSpeed.plan.events[0]!.operations.push({
      id: 'runtime-bad',
      type: 'addSpeedModifier',
      target: { kind: 'allies' },
      mode: 'flat',
      amount: -1000,
      duration: { kind: 'turns', turns: null },
    })
    expect(p.restoreDocument(badSpeed)).toBe(true)
    expect(p.result.value.stopReason).toBe('error')
    expect(p.plan.value.events[0]!.operations.at(-1)!.id).toBe('runtime-bad')
  })
  it('generates safe JSON filenames without mutating documents', () => {
    expect(plannerFilename('')).toBe('action-planner.json')
    expect(plannerFilename('CON')).toBe('action-planner.json')
    expect(plannerFilename('../../foo:*?')).not.toMatch(/[\\/:*?]/)
    expect(plannerFilename('My plan')).toBe('My plan.json')
  })
  it('treats ordinary prototype member names as IDs rather than inherited metadata', () => {
    const input = syntheticDocument()
    input.plan.events[0]!.operations[0]!.id = 'toString'
    const p = useActionPlanner()
    expect(p.nextId()).toBe('editor-1')
    p.reset()
    expect(p.nextId()).toBe('editor-2')
    expect(p.restoreDocument(input)).toBe(true)
    p.edit(p.plan.value.events[0]!.operations[0])
    expect(p.draft.value!.customName).toBe('')
    expect(p.submit()).toBe(true)
  })
})
