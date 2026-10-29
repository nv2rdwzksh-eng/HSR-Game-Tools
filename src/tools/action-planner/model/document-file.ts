import { resolveElationContributors } from './aha-config'
import catalog from '../data/game/catalog.json'
import {
  DEFAULT_LIMITS,
  defaultAhaConfig,
  spawnedParticipantId,
  countdownParticipantId,
} from '../engine/queue'
import { participantCatalog, validatePlan } from '../engine/validation'
import type { ParticipantDefinition, SimulationPlan } from '../engine/types'
import type { PlannerDocument } from './editor'
import { simulatePlan } from '../engine/engine'

export const PLANNER_FORMAT = 'hsr-game-tools/action-planner'
export const PLANNER_VERSION = 7
export const FILE_LIMITS = {
  bytes: 2 * 1024 * 1024,
  events: 1000,
  operations: 2000,
  targets: 256,
  name: 120,
  displayName: 256,
  operationId: 128,
  string: 2048,
  depth: 16,
  objects: 50000,
} as const
export type FileErrorCode =
  'json' | 'format' | 'version' | 'structure' | 'limit' | 'identity' | 'metadata' | 'simulation'
export class PlannerFileError extends Error {
  constructor(public code: FileErrorCode) {
    super(code)
  }
}
export type ResourceIssue = {
  kind: 'missingCharacter' | 'unsafeImage' | 'unknownElation' | 'elationMismatch'
  id: string
}
export interface MigrationNotice {
  fromVersion: 1 | 2 | 3 | 4 | 5 | 6
  ahaAdded: boolean
}
export const emptyDocument = (): PlannerDocument => ({
  name: '',
  plan: { actors: [], events: [], cycleMode: 'none', aha: defaultAhaConfig(), ...DEFAULT_LIMITS },
  metadata: { customNames: {}, characterIds: {} },
})
const fail = (code: FileErrorCode): never => {
  throw new PlannerFileError(code)
}
const forbidden = new Set(['__proto__', 'constructor', 'prototype'])
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('structure')
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    return fail('structure')
  return value as Record<string, unknown>
}
function fields(value: unknown, allowed: string[], required = allowed): Record<string, unknown> {
  const result = object(value)
  if (
    Object.keys(result).some((key) => !allowed.includes(key)) ||
    required.some((key) => result[key] === undefined)
  )
    fail('structure')
  return result
}
function text(value: unknown, max: number = FILE_LIMITS.string): string {
  if (typeof value !== 'string') return fail('structure')
  if (value.length > max) return fail('limit')
  for (const character of value) {
    const code = character.charCodeAt(0)
    if (character.length === 1 && code >= 0xd800 && code <= 0xdfff) fail('structure')
  }
  return value
}
function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) return fail('structure')
  return value
}
function inspectTree(value: unknown): void {
  let objects = 0
  function visit(item: unknown, depth: number) {
    if (depth > FILE_LIMITS.depth) fail('limit')
    if (typeof item === 'string') text(item)
    else if (typeof item === 'number') {
      if (!Number.isFinite(item)) fail('structure')
    } else if (item !== null && typeof item === 'object') {
      if (++objects > FILE_LIMITS.objects) fail('limit')
      if (!Array.isArray(item)) object(item)
      for (const [key, child] of Object.entries(item)) {
        if (forbidden.has(key)) fail('identity')
        text(key)
        visit(child, depth + 1)
      }
    } else if (item !== null && item !== undefined && typeof item !== 'boolean') fail('structure')
  }
  visit(value, 0)
}
const definitionFields = [
  'kind',
  'name',
  'iconUrl',
  'initialAG',
  'camp',
  'category',
  'baseSpeed',
  'panelSpeed',
  'actionLimit',
]
function checkDefinition(value: unknown, initial = false) {
  const p = object(value)
  fields(
    p,
    p.kind === 'scheduledEvent'
      ? ['kind', 'name', 'iconUrl', 'initialAG', 'speed', 'baseSpeed']
      : [...definitionFields, ...(initial ? ['id', 'position'] : [])],
    ['kind', 'name'],
  )
  text(p.name, FILE_LIMITS.displayName)
}
const imagePaths = new Set(Object.values(catalog.assets).map((asset) => asset.path))
export function safeImagePath(value?: string): string | undefined {
  return value && imagePaths.has(value) ? value : undefined
}

/** Strict versioned boundary. Migration returns an independently owned Version 7 document. */
export function validatePlannerFile(value: unknown): {
  document: PlannerDocument
  issues: ResourceIssue[]
  migration?: MigrationNotice
} {
  inspectTree(value)
  const file = fields(value, ['format', 'version', 'document'])
  if (file.format !== PLANNER_FORMAT) fail('format')
  if (
    file.version !== 1 &&
    file.version !== 2 &&
    file.version !== 3 &&
    file.version !== 4 &&
    file.version !== 5 &&
    file.version !== 6 &&
    file.version !== PLANNER_VERSION
  )
    fail('version')
  const doc = fields(file.document, ['name', 'plan', 'metadata'])
  text(doc.name, FILE_LIMITS.name)
  const p = fields(
    doc.plan,
    [
      'actors',
      'events',
      'maxNodes',
      'maxAV',
      ...(file.version !== 1 ? ['cycleMode'] : []),
      ...(Number(file.version) >= 3 ? ['aha'] : []),
      ...(Number(file.version) >= 4 ? ['skillPoints'] : []),
    ],
    [
      'actors',
      'events',
      'maxNodes',
      'maxAV',
      ...(file.version !== 1 ? ['cycleMode'] : []),
      ...(Number(file.version) >= 3 ? ['aha'] : []),
    ],
  )
  if (p.skillPoints !== undefined)
    fields(
      p.skillPoints,
      [
        'enabled',
        'initial',
        'max',
        ...(Number(file.version) >= 6 ? ['onInsufficient'] : []),
        ...(file.version === 7 ? ['storedMax'] : []),
      ],
      [],
    )
  const actors = list(p.actors)
  const events = list(p.events)
  if (events.length > FILE_LIMITS.events || actors.length > 9) fail('limit')
  const declaredIds = new Set<string>()
  for (const value of actors) {
    checkDefinition(value, true)
    const a = object(value)
    const id = text(a.id)
    if (forbidden.has(id) || declaredIds.has(id)) fail('identity')
    declaredIds.add(id)
    const bound = a.camp === 'ally' ? 4 : 5
    if (typeof a.position !== 'number' || a.position < 0 || a.position >= bound) fail('limit')
  }
  if (
    actors.filter((a) => object(a).camp === 'ally').length > 4 ||
    actors.filter((a) => object(a).camp === 'enemy').length > 5
  )
    fail('limit')
  let count = 0
  const opIds = new Set<string>()
  for (const value of events) {
    const e = fields(
      value,
      ['anchor', 'operations', ...(Number(file.version) >= 4 ? ['skill'] : [])],
      ['anchor', 'operations'],
    )
    const a = object(e.anchor)
    fields(
      a,
      a.kind === 'start'
        ? ['kind']
        : a.kind === 'action'
          ? ['kind', 'participantId', 'turn']
          : a.kind === 'cycleBoundary' && file.version !== 1
            ? ['kind', 'ordinal']
            : ['kind', 'participantId'],
    )
    const ops = list(e.operations)
    if ((count += ops.length) > FILE_LIMITS.operations) fail('limit')
    for (const value of ops) {
      const op = object(value)
      if (op.type === 'restoreSkillPoints' && Number(file.version) < 5) fail('structure')
      const common = ['id', 'type', 'phase']
      const specific =
        op.type === 'restoreSkillPoints'
          ? ['amount', 'source']
          : op.type === 'spawnParticipant'
            ? ['participant']
            : op.type === 'addSpeedModifier'
              ? ['target', 'mode', 'amount', 'duration']
              : op.type === 'immediatelyAct' || op.type === 'depart' || op.type === 'returnToField'
                ? ['target']
                : ['target', 'percent']
      fields(
        op,
        [
          ...common,
          ...specific,
          ...(op.type === 'restoreSkillPoints' && file.version === 7 ? ['storeOverflow'] : []),
        ],
        ['id', 'type', ...specific],
      )
      const id = text(op.id, FILE_LIMITS.operationId)
      if (forbidden.has(id) || opIds.has(id) || declaredIds.has(id)) fail('identity')
      opIds.add(id)
      if (op.type === 'spawnParticipant') checkDefinition(op.participant)
      else if (op.type === 'restoreSkillPoints') text(op.source, FILE_LIMITS.displayName)
      else {
        const target = object(op.target)
        fields(target, target.kind === 'participants' ? ['kind', 'participantIds'] : ['kind'])
        if (
          target.kind === 'participants' &&
          list(target.participantIds).length > FILE_LIMITS.targets
        )
          fail('limit')
        if (op.type === 'addSpeedModifier') {
          const duration = object(op.duration)
          fields(
            duration,
            duration.kind === 'turns' ? ['kind', 'turns'] : ['kind', 'name', 'speed'],
          )
          if (duration.kind === 'countdown') text(duration.name, FILE_LIMITS.displayName)
        }
      }
    }
  }
  const plan = {
    ...p,
    ...(file.version === 1 ? { cycleMode: 'none' } : {}),
  } as unknown as SimulationPlan
  const m = fields(doc.metadata, ['customNames', 'characterIds'])
  const customNames = object(m.customNames)
  const characterIds = object(m.characterIds)
  for (const [id, name] of Object.entries(customNames)) {
    if (!opIds.has(id)) fail('metadata')
    text(name, FILE_LIMITS.displayName)
  }
  for (const [id, characterId] of Object.entries(characterIds)) {
    if (!plan.actors.some((actor) => actor.id === id && actor.camp === 'ally')) fail('metadata')
    if (!text(characterId).trim()) fail('metadata')
  }
  const issues: ResourceIssue[] = []
  let migration: MigrationNotice | undefined
  if (Number(file.version) >= 3) {
    const aha = fields(p.aha, ['id', 'baseSpeed', 'contributorIds'])
    const id = text(aha.id)
    if (forbidden.has(id) || declaredIds.has(id) || opIds.has(id)) fail('identity')
    for (const contributor of list(aha.contributorIds)) text(contributor)
  } else {
    // Strict fields were checked above; reserve old identities before shared semantic validation.
    const legacy = { ...plan, aha: defaultAhaConfig() }
    let suffix = 1
    const occupied = new Set(declaredIds)
    opIds.forEach((id) => occupied.add(id))
    // Reserve derived IDs and orphan references before validating with the temporary config.
    for (const event of legacy.events) {
      if (event.anchor.kind === 'action' || event.anchor.kind === 'trigger')
        occupied.add(event.anchor.participantId)
      for (const op of event.operations) {
        occupied.add(spawnedParticipantId(op.id))
        occupied.add(countdownParticipantId(op.id))
        if (
          op.type !== 'spawnParticipant' &&
          op.type !== 'restoreSkillPoints' &&
          op.target.kind === 'participants'
        )
          list(op.target.participantIds).forEach((id) => occupied.add(text(id)))
      }
    }
    while (occupied.has(legacy.aha.id)) legacy.aha.id = `aha-instant:${++suffix}`
    if (validatePlan(legacy).length) fail('structure')
    const aha = { ...defaultAhaConfig(), id: legacy.aha.id }
    const resolved = resolveElationContributors(plan.actors, characterIds as Record<string, string>)
    aha.contributorIds = resolved.contributorIds
    plan.aha = aha
    resolved.unresolvedIds.forEach((id) => issues.push({ kind: 'unknownElation', id }))
    migration = { fromVersion: file.version as 1 | 2, ahaAdded: aha.contributorIds.length > 0 }
  }
  if (file.version === 3 || file.version === 4 || file.version === 5 || file.version === 6)
    migration = { fromVersion: file.version, ahaAdded: false }
  if (validatePlan(plan).length) fail('structure')
  const participants = participantCatalog(plan)
  if (participants.some((p) => opIds.has(p.id))) fail('identity')
  // A fresh JSON tree also removes optional undefined properties from internal drafts.
  const document = JSON.parse(JSON.stringify(doc)) as PlannerDocument
  document.plan = JSON.parse(JSON.stringify(plan)) as SimulationPlan
  if (Number(file.version) >= 3) {
    const resolved = resolveElationContributors(
      document.plan.actors,
      document.metadata.characterIds,
      document.plan.aha.contributorIds,
    )
    for (const actor of document.plan.actors.filter((a) => a.camp === 'ally')) {
      if (resolved.unresolvedIds.includes(actor.id)) {
        if (document.plan.aha.contributorIds.includes(actor.id))
          issues.push({ kind: 'unknownElation', id: actor.id })
      } else if (
        resolved.contributorIds.includes(actor.id) !==
        document.plan.aha.contributorIds.includes(actor.id)
      )
        issues.push({ kind: 'elationMismatch', id: actor.id })
    }
  }
  for (const [id, characterId] of Object.entries(document.metadata.characterIds))
    if (!catalog.characters.some((c) => c.id === characterId))
      issues.push({ kind: 'missingCharacter', id })
  function image(participant: ParticipantDefinition, id: string, mapped = false) {
    if (mapped) delete participant.iconUrl
    else if (participant.iconUrl && !safeImagePath(participant.iconUrl)) {
      issues.push({ kind: 'unsafeImage', id })
      delete participant.iconUrl
    }
  }
  for (const actor of document.plan.actors) {
    if (actor.camp === 'enemy') {
      actor.panelSpeed = actor.baseSpeed
      actor.category = 'enemy'
      delete actor.iconUrl
    }
    image(actor, actor.id, Object.hasOwn(document.metadata.characterIds, actor.id))
  }
  for (const event of document.plan.events)
    for (const operation of event.operations)
      if (operation.type === 'spawnParticipant')
        image(operation.participant, spawnedParticipantId(operation.id))
  const serialized = JSON.stringify({ format: PLANNER_FORMAT, version: PLANNER_VERSION, document })
  if (new TextEncoder().encode(serialized).length > FILE_LIMITS.bytes) fail('limit')
  return { document, issues, ...(migration ? { migration } : {}) }
}

export function parsePlannerDocument(source: string) {
  if (new TextEncoder().encode(source).length > FILE_LIMITS.bytes) fail('limit')
  let value: unknown
  try {
    value = JSON.parse(source)
  } catch {
    return fail('json')
  }
  return validatePlannerFile(value)
}
export function serializePlannerDocument(document: PlannerDocument): string {
  const normalized = validatePlannerFile({
    format: PLANNER_FORMAT,
    version: PLANNER_VERSION,
    document,
  }).document
  const source =
    JSON.stringify(
      { format: PLANNER_FORMAT, version: PLANNER_VERSION, document: normalized },
      null,
      2,
    ) + '\n'
  if (new TextEncoder().encode(source).length > FILE_LIMITS.bytes) fail('limit')
  return source
}
export function preparePlannerDocument(
  input: PlannerDocument,
  inheritedIssues: ResourceIssue[] = [],
  migration?: MigrationNotice,
) {
  const parsed = validatePlannerFile({
    format: PLANNER_FORMAT,
    version: PLANNER_VERSION,
    document: input,
  })
  serializePlannerDocument(parsed.document)
  try {
    return {
      ...parsed,
      ...(migration ? { migration } : {}),
      issues: [
        ...new Map(
          [...inheritedIssues, ...parsed.issues].map((issue) => [
            `${issue.kind}:${issue.id}`,
            issue,
          ]),
        ).values(),
      ],
      result: simulatePlan(parsed.document.plan),
    }
  } catch {
    return fail('simulation')
  }
}
export function plannerFilename(name: string): string {
  let stem = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 100)
  if (!stem || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = 'action-planner'
  return `${stem}.json`
}
export function referencedIds(plan: SimulationPlan): Set<string> {
  const ids = new Set(participantCatalog(plan).map((p) => p.id))
  for (const event of plan.events) {
    if (event.anchor.kind === 'action' || event.anchor.kind === 'trigger')
      ids.add(event.anchor.participantId)
    for (const op of event.operations) {
      ids.add(op.id)
      ids.add(spawnedParticipantId(op.id))
      ids.add(countdownParticipantId(op.id))
      if (
        op.type !== 'spawnParticipant' &&
        op.type !== 'restoreSkillPoints' &&
        op.target.kind === 'participants'
      )
        op.target.participantIds.forEach((id) => ids.add(id))
    }
  }
  return ids
}
