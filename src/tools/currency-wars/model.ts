import type { OptimizationRequest, RoleForm, Snapshot } from './types'
import { isEligibleRole, navigatorGrantedTraits } from './rules'
import { completionWeight } from './objective'
import { validateRequest } from './validation'

type Expression = Map<string, number>
export interface BuiltModel {
  lp: string
  roleColumns: Map<string, string>
  emblemColumns: Map<string, Map<number, string>>
  targetColumns: Map<string, Map<string, string>>
  countExpressions: Map<number, Expression>
  taskColumns: Map<string, string>
  columnNames: string[]
  rowCount: number
  constraints: { expression: Expression; relation: '<=' | '>=' | '='; rhs: number }[]
}

/** Build CPLEX LP text using generated column names, never user-controlled identifiers. */
export function buildModel(snapshot: Snapshot, request: OptimizationRequest): BuiltModel {
  validateRequest(snapshot, request)
  const columns: string[] = []
  const rows: string[] = []
  const constraints: BuiltModel['constraints'] = []
  const variable = () => {
    const name = 'v' + columns.length
    columns.push(name)
    return name
  }
  const expression = (...terms: [string, number][]): Expression => new Map(terms)
  function sum(...terms: (Expression | [Expression, number])[]): Expression {
    const result: Expression = new Map()
    for (const term of terms) {
      const [e, multiplier] = Array.isArray(term) ? term : [term, 1]
      for (const [name, coefficient] of e) {
        const value = (result.get(name) ?? 0) + coefficient * multiplier
        if (value) result.set(name, value)
        else result.delete(name)
      }
    }
    return result
  }
  function format(e: Expression) {
    return [...e].map(([name, c]) => `${c < 0 ? '-' : '+'} ${Math.abs(c)} ${name}`).join(' ') || '0'
  }
  function constrain(e: Expression, relation: '<=' | '>=' | '=', rhs: number) {
    // Avoid constant-only rows; detect a contradictory constant rather than emitting a bad LP.
    if (!e.size) {
      if (
        (relation === '<=' && 0 <= rhs) ||
        (relation === '>=' && 0 >= rhs) ||
        (relation === '=' && rhs === 0)
      )
        return
      throw new Error('Contradictory constant constraint')
    }
    constraints.push({ expression: e, relation, rhs })
    rows.push(` r${rows.length}: ${format(e)} ${relation} ${rhs}`)
  }

  const roles = snapshot.roles.filter((r) => isEligibleRole(r, request))
  const roleColumns = new Map(roles.map((r) => [r.id, variable()]))
  const selected = (r: RoleForm) => expression([roleColumns.get(r.id)!, 1])
  const emblemColumns = new Map<string, Map<number, string>>()
  const targetColumns = new Map<string, Map<string, string>>()
  const direct = new Map<string, Map<number, Expression>>()
  const final = new Map<string, Map<number, Expression>>()
  const allEmblems: Expression[] = []
  const objectiveTerms: Expression[] = []
  if (request.objective === 'min-roles')
    objectiveTerms.push(...roles.map((role) => expression([roleColumns.get(role.id)!, -1])))

  constrain(sum(...roles.map(selected)), '<=', request.slots)
  for (const identity of new Set(roles.map((r) => r.identityId)))
    constrain(sum(...roles.filter((r) => r.identityId === identity).map(selected)), '<=', 1)

  for (const role of roles) {
    const emblems = new Map<number, string>()
    const presence = new Map(snapshot.traits.map((t) => [t.id, expression()]))
    for (const trait of role.innateTraits) presence.set(trait, selected(role))
    const equipped: Expression[] = []
    for (const emblem of snapshot.emblems) {
      if (role.innateTraits.includes(emblem.traitId)) continue
      if (
        role.mechanic === 'bronya' &&
        role.bronyaSide === 'tie' &&
        snapshot.rules.bronyaTraitIds.includes(emblem.traitId)
      )
        continue
      const column = variable()
      const z = expression([column, 1])
      emblems.set(emblem.id, column)
      equipped.push(z)
      allEmblems.push(z)
      if (request.objective === 'min-emblems') objectiveTerms.push(expression([column, -1]))
      presence.set(emblem.traitId, sum(presence.get(emblem.traitId)!, z))
    }
    constrain(sum(...equipped, [selected(role), -3]), '<=', 0)
    emblemColumns.set(role.id, emblems)
    direct.set(role.id, presence)
    final.set(role.id, new Map(presence))
  }
  constrain(sum(...allEmblems), '<=', Math.min(request.emblemBudget, 3 * request.slots))

  for (const navigator of roles.filter((r) => r.mechanic === 'navigator')) {
    const targetVars = new Map<string, string>()
    const inherited = new Map<number, Expression[]>()
    for (const target of roles) {
      if (target.identityId === navigator.identityId || target.mechanic === 'bronya') continue
      const train = direct.get(target.id)!.get(snapshot.rules.trainTraitId)!
      if (!train.size) continue
      const qName = variable()
      const q = expression([qName, 1])
      targetVars.set(target.id, qName)
      constrain(sum(q, [train, -1]), '<=', 0)
      // Emblems may qualify the target, but only innate Classes and explicit grants are copied.
      const inheritable = new Set([
        ...target.innateTraits.filter((id) =>
          snapshot.traits.some((t) => t.id === id && t.type === 'class'),
        ),
        ...navigatorGrantedTraits(target),
      ])
      for (const traitId of inheritable)
        inherited.set(traitId, [...(inherited.get(traitId) ?? []), q])
    }
    constrain(
      sum(...[...targetVars.values()].map((v) => expression([v, 1])), [selected(navigator), -1]),
      '<=',
      0,
    )
    for (const [traitId, copies] of inherited)
      final.get(navigator.id)!.set(traitId, sum(direct.get(navigator.id)!.get(traitId)!, ...copies))
    targetColumns.set(navigator.id, targetVars)
  }

  const countExpressions = new Map<number, Expression>()
  for (const trait of snapshot.traits) {
    const terms: Expression[] = []
    for (const role of roles) {
      const presence = final.get(role.id)!.get(trait.id)!
      if (!presence.size) continue
      // Addition rather than OR makes every repeated trait acquisition illegal.
      constrain(sum(presence, [selected(role), -1]), '<=', 0)
      terms.push(presence)
    }
    countExpressions.set(trait.id, sum(...terms))
  }

  for (const role of roles.filter((r) => r.mechanic === 'bronya')) {
    const [a, b] = snapshot.rules.bronyaTraitIds
    const others = roles.filter((r) => r.identityId !== role.identityId)
    const difference = sum(
      ...others.map((r) => final.get(r.id)!.get(a)!),
      ...others.map((r): [Expression, number] => [final.get(r.id)!.get(b)!, -1]),
    )
    const x = selected(role)
    const bigM = request.slots + 1
    if (role.bronyaSide === 'tie') {
      constrain(sum(difference, [x, bigM]), '<=', bigM)
      constrain(sum(difference, [x, -bigM]), '>=', -bigM)
    } else if (role.bronyaSide === a) {
      constrain(sum(difference, [x, -bigM]), '>=', 1 - bigM)
    } else {
      constrain(sum(difference, [x, bigM]), '<=', bigM - 1)
    }
  }

  const taskColumns = new Map<string, string>()
  for (const task of request.tasks) {
    const name = variable()
    taskColumns.set(task.id, name)
    const y = expression([name, 1])
    objectiveTerms.push(expression([name, completionWeight(request)]))
    if (task.requiredCount > request.slots) {
      constrain(y, '=', 0)
      continue
    }
    const count = countExpressions.get(task.traitId)!
    // Both directions make task flags exact even for interrupted incumbent solutions.
    constrain(sum(count, [y, -task.requiredCount]), '>=', 0)
    constrain(
      sum(count, [y, -(request.slots - task.requiredCount + 1)]),
      '<=',
      task.requiredCount - 1,
    )
  }
  // An empty eligible roster still has task columns. The solver orchestrator skips empty task lists.
  const lp = `Maximize\n obj: ${format(sum(...objectiveTerms))}\nSubject To\n${rows.join('\n')}\nBinary\n ${columns.join(' ')}\nEnd\n`
  return {
    lp,
    roleColumns,
    emblemColumns,
    targetColumns,
    countExpressions,
    taskColumns,
    columnNames: columns,
    rowCount: rows.length,
    constraints,
  }
}
