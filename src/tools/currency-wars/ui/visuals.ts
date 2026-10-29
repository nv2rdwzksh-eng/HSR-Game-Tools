import type { LineupMember, MemberEvaluation, RoleForm, Snapshot } from '../types'

export type RoleCost = 1 | 2 | 3 | 4 | 5
export type RolePosition = 'front' | 'back' | 'both'
export interface VisualCatalog {
  schemaVersion: 1
  costs: Record<string, RoleCost>
  portraits: Record<string, string>
  emblems: Record<string, string>
  traits?: Record<string, string>
  positions?: Record<string, RolePosition>
}

export type VisualMember = ReturnType<ReturnType<typeof createVisuals>['member']>

export function sortVisualMembers(members: VisualMember[]): VisualMember[] {
  return [...members].sort(
    (a, b) => b.cost - a.cost || (a.role.id < b.role.id ? -1 : a.role.id > b.role.id ? 1 : 0),
  )
}

export function assetUrl(path: string | undefined, base: string): string | undefined {
  if (
    !path ||
    !/^game-assets\/(character|emblem|currency-war-traits|currency-war-equipments)\/[0-9]+\.webp$/.test(
      path,
    )
  )
    return undefined
  return base.replace(/\/?$/, '/') + path
}

export function createVisuals(snapshot: Snapshot, catalog: VisualCatalog, base = '/') {
  const roles = new Map(snapshot.roles.map((r) => [r.id, r]))
  const emblems = new Map(snapshot.emblems.map((e) => [e.id, e]))
  const traits = new Map(snapshot.traits.map((t) => [t.id, t]))
  function member(member: LineupMember, evaluated: MemberEvaluation) {
    const role = roles.get(member.formId)!
    return {
      role,
      cost: catalog.costs[role.id],
      position: catalog.positions?.[role.id] ?? role.position,
      portraitUrl: assetUrl(catalog.portraits[String(role.avatarId)], base),
      // Always exactly three slots, regardless of the number of allocated emblems.
      slots: Array.from({ length: 3 }, (_, index) => {
        const emblem = emblems.get(member.emblemIds[index]!)
        return emblem
          ? {
              ...emblem,
              traitName: traits.get(emblem.traitId)!.name,
              url: assetUrl(catalog.emblems[String(emblem.traitId)], base),
            }
          : undefined
      }),
      target: member.navigatorTarget ? roles.get(member.navigatorTarget) : undefined,
      targetCost: member.navigatorTarget ? catalog.costs[member.navigatorTarget] : undefined,
      finalTraits: [...new Set(evaluated.finalTraits)]
        .sort((a, b) => a - b)
        .map((id) => traits.get(id)!),
      innate: evaluated.innateTraits.map((id) => traits.get(id)!),
      extra: evaluated.extraTraits.map((id) => traits.get(id)!),
      bronyaTrait: typeof role.bronyaSide === 'number' ? traits.get(role.bronyaSide) : undefined,
    }
  }
  return {
    member,
    role: (id: string): RoleForm | undefined => roles.get(id),
    portrait: (id: string) => assetUrl(catalog.portraits[String(roles.get(id)?.avatarId)], base),
    trait: (id: number) => traits.get(id)!,
    traitUrl: (id: number) => assetUrl(catalog.traits?.[String(id)], base),
  }
}

export function assertVisualCatalog(
  value: unknown,
  snapshot: Snapshot,
): asserts value is VisualCatalog {
  const c = value as VisualCatalog | undefined
  if (!c || c.schemaVersion !== 1 || !c.costs || !c.portraits || !c.emblems)
    throw new Error('Invalid currency-wars visual catalog')
  for (const role of snapshot.roles)
    if (
      ![1, 2, 3, 4, 5].includes(c.costs[role.id]!) ||
      !assetUrl(c.portraits[String(role.avatarId)], '/')
    )
      throw new Error('Missing or invalid role visual: ' + role.id)
  for (const emblem of snapshot.emblems)
    if (!assetUrl(c.emblems[String(emblem.traitId)], '/'))
      throw new Error('Missing emblem visual: ' + emblem.id)
  if (c.positions !== undefined) {
    if (!c.positions || typeof c.positions !== 'object' || Array.isArray(c.positions))
      throw new Error('Invalid role positions')
    if (Object.keys(c.positions).length !== snapshot.roles.length)
      throw new Error('Role position inventory mismatch')
    for (const role of snapshot.roles) {
      const position = c.positions[role.id]
      if (
        !['front', 'back', 'both'].includes(position!) ||
        (role.position !== undefined && position !== role.position)
      )
        throw new Error('Missing or inconsistent role position: ' + role.id)
    }
  }
  if (c.traits !== undefined) {
    if (!c.traits || typeof c.traits !== 'object' || Array.isArray(c.traits))
      throw new Error('Invalid trait visuals')
    for (const [id, path] of Object.entries(c.traits))
      if (
        !snapshot.traits.some((trait) => String(trait.id) === id) ||
        path !== `game-assets/currency-war-traits/${id}.webp`
      )
        throw new Error('Invalid trait visual: ' + id)
  }
}
