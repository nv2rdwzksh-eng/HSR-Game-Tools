import { describe, expect, it } from 'vitest'
import { buildModel } from '../../../src/tools/currency-wars/model'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import {
  highsSolver,
  solveCurrencyWars,
  type Solver,
  type SolverOutcome,
} from '../../../src/tools/currency-wars/solve'
import type { Lineup, OptimizationRequest, Snapshot } from '../../../src/tools/currency-wars/types'
import { bronyaForms, navigator, request, role, task, toy } from './helpers'

function subsets<T>(values: T[]): T[][] {
  return Array.from({ length: 2 ** values.length }, (_, mask) =>
    values.filter((_, i) => (mask & (2 ** i)) !== 0),
  )
}

/** Exhaustive search exists only as a small-instance test oracle, never in the production solver. */
function oracle(snapshot: Snapshot, input: OptimizationRequest, ordinaryOnly = false): number {
  let best = -Infinity
  const eligible = snapshot.roles.filter((r) => input.includeExperts || !r.expert)
  for (const selected of subsets(eligible)) {
    if (
      selected.length > input.slots ||
      new Set(selected.map((r) => r.identityId)).size !== selected.length
    )
      continue
    const choices = selected.map((r) =>
      subsets(
        snapshot.emblems.filter((e) => !r.innateTraits.includes(e.traitId)).map((e) => e.id),
      ).filter((ids) => ids.length <= 3),
    )
    function visit(index: number, lineup: Lineup, used: number) {
      if (used > input.emblemBudget) return
      if (index === selected.length) {
        if (ordinaryOnly) {
          // A second, simple counting implementation independent of the production calculator.
          const counts = new Map<number, number>()
          for (const member of lineup.members) {
            const r = selected.find((r) => r.id === member.formId)!
            const ids = [
              ...r.innateTraits,
              ...member.emblemIds.map((id) => snapshot.emblems.find((e) => e.id === id)!.traitId),
            ]
            if (new Set(ids).size !== ids.length) return
            for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
          }
          const completed = input.tasks.filter(
            (t) => (counts.get(t.traitId) ?? 0) >= t.requiredCount,
          ).length
          const bound =
            input.objective === 'min-roles'
              ? input.slots
              : Math.min(input.emblemBudget, 3 * input.slots)
          best = Math.max(
            best,
            (bound + 1) * completed - (input.objective === 'min-roles' ? selected.length : used),
          )
        } else {
          const result = evaluateLineup(snapshot, input, lineup)
          if (result.valid) best = Math.max(best, result.objective)
        }
        return
      }
      const current = selected[index]!
      for (const emblemIds of choices[index]!) {
        const targets =
          current.mechanic === 'navigator'
            ? [undefined, ...selected.filter((r) => r.id !== current.id).map((r) => r.id)]
            : [undefined]
        for (const navigatorTarget of targets)
          visit(
            index + 1,
            {
              members: [
                ...lineup.members,
                { formId: current.id, emblemIds, ...(navigatorTarget ? { navigatorTarget } : {}) },
              ],
            },
            used + emblemIds.length,
          )
      }
    }
    visit(0, { members: [] }, 0)
  }
  return best
}

describe('HiGHS integer optimization', () => {
  it('enforces three emblems per role, one per kind, and a naturally bounded global budget', async () => {
    const s = toy([role(1, [1005])], [2004, 2006, 2007, 2008])
    const input = request([task(2004, 1), task(2006, 1), task(2007, 1), task(2008, 1)], {
      slots: 1,
      emblemBudget: 1000,
    })
    const result = await solveCurrencyWars(s, input)
    expect(result.status, result.message).toBe('optimal')
    expect(result.evaluation!.completedCount).toBe(3)
    expect(result.evaluation!.emblemCount).toBe(3)
    expect(result.evaluation!.objective).toBe(oracle(s, input, true))
  })

  it('matches exhaustive independent ordinary counting across budgets and objectives', async () => {
    const s = toy(
      [role(1, [2007]), role(2, [2008]), role(3, [1008, 2007]), role(4, [1005])],
      [2007, 2008],
    )
    for (const objective of ['min-roles', 'min-emblems'] as const)
      for (const emblemBudget of [0, 1, 2, 3]) {
        const input = request([task(2007, 2), task(2007, 3), task(2008, 2), task(1008, 2)], {
          emblemBudget,
          objective,
        })
        const result = await solveCurrencyWars(s, input)
        expect(result.status, result.message).toBe('optimal')
        expect(result.evaluation!.objective).toBe(oracle(s, input, true))
        expect(result.evaluation!.valid).toBe(true)
      }
  })

  it('uses a non-task train emblem to copy multiple Classes and matches exhaustive search', async () => {
    const s = toy([navigator, role(1218, [1008, 2007, 2008])], [1001])
    const input = request([task(2007, 2), task(2008, 2), task(1008, 2)], { emblemBudget: 1 })
    const result = await solveCurrencyWars(s, input)
    expect(result.status, result.message).toBe('optimal')
    expect(result.evaluation!.completedCount).toBe(2)
    expect(result.evaluation!.emblemCount).toBe(1)
    expect(result.evaluation!.objective).toBe(oracle(s, input))
    expect(result.lineup!.members.find((m) => m.formId === '1510')!.navigatorTarget).toBe('1218')
    expect(result.evaluation!.members.find((m) => m.formId === '1510')!.extraTraits.sort()).toEqual(
      [2007, 2008],
    )
    expect(result.evaluation!.traits.find((t) => t.traitId === 1008)!.count).toBe(1)
  })

  it('cannot complete an extra task by inheriting a target emblem Class', async () => {
    const s = toy([navigator, role(1, [1001, 2007])], [2007, 2008])
    const input = request([task(2007, 2), task(2008, 2)], {
      emblemBudget: 1,
      objective: 'min-emblems',
    })
    const result = await solveCurrencyWars(s, input)
    expect(result.status, result.message).toBe('optimal')
    expect(result.evaluation!.completedCount).toBe(1)
    expect(result.evaluation!.emblemCount).toBe(0)
    expect(result.evaluation!.objective).toBe(2)
    expect(result.lineup!.members.find((m) => m.formId === '1510')!.emblemIds).toEqual([])
    expect(result.lineup!.members.find((m) => m.formId === '1510')!.navigatorTarget).toBe('1')
    expect(result.evaluation!.members.find((m) => m.formId === '1510')!.extraTraits).toEqual([2007])
    expect(result.evaluation!.traits.find((t) => t.traitId === 2007)).toMatchObject({
      count: 2,
      contributors: expect.arrayContaining(['1', '1510']),
    })
    expect(result.evaluation!.tasks.find((t) => t.traitId === 2008)).toMatchObject({
      actualCount: 0,
      completed: false,
    })
    expect(evaluateLineup(s, input, result.lineup!)).toEqual(result.evaluation)
    expect(result.evaluation!.objective).toBe(oracle(s, input))
  })

  it('does not copy camp stars, Xianzhou, or unique traits', async () => {
    const s = toy([navigator, role(1, [1001, 1007, 1010, 3001, 2007])], [1008])
    const result = await solveCurrencyWars(
      s,
      request([task(1007, 2), task(1010, 2), task(3001, 2), task(2007, 2)]),
    )
    expect(result.status, result.message).toBe('optimal')
    expect(result.evaluation!.completedCount).toBe(1)
  })

  it('keeps exclusive forms and minimizes emblems with exclusive forms', async () => {
    const s = toy(
      [
        role(8007, [1001, 2004], { identityId: 8007 }),
        role(8009, [1001, 2012], { identityId: 8007 }),
        role(1, [2004]),
        role(2, [2012]),
      ],
      [2004, 2012],
    )
    const input = request([task(2004, 2), task(2012, 2)], {
      slots: 3,
      emblemBudget: 1,
      objective: 'min-emblems',
    })
    const result = await solveCurrencyWars(s, input)
    expect(result.status, result.message).toBe('optimal')
    expect(result.evaluation!.objective).toBe(oracle(s, input, true))
    expect(result.evaluation!.emblemCount).toBe(1)
    expect(result.lineup!.members.filter((m) => ['8007', '8009'].includes(m.formId))).toHaveLength(
      1,
    )
    const noNeed = await solveCurrencyWars(
      toy([role(1, [2007]), role(2, [2007])], [2007]),
      request([task(2007, 2)]),
    )
    expect(noNeed.evaluation!.emblemCount).toBe(0)
    expect(noNeed.lineup!.members).toHaveLength(2)
  })

  it('matches an oracle with conditional Bronya forms, other-role emblems and conservative ties', async () => {
    const s = toy([...bronyaForms, role(1, [1005]), role(2, [2006])], [1005, 2006])
    for (const tasks of [
      [task(1005, 2), task(3001, 1)],
      [task(2006, 2), task(3001, 1)],
      [task(3001, 1)],
    ]) {
      const input = request(tasks, { slots: 2, emblemBudget: 1 })
      const result = await solveCurrencyWars(s, input)
      expect(result.status, result.message).toBe('optimal')
      expect(result.evaluation!.objective).toBe(oracle(s, input))
    }
    const onlyBronya = toy(bronyaForms, [1005, 2006])
    const result = await solveCurrencyWars(
      onlyBronya,
      request([task(1005, 1), task(2006, 1), task(3001, 1)], { slots: 1 }),
    )
    expect(result.evaluation!.completedCount, result.message).toBe(1)
    expect(result.lineup!.members[0]!.formId).toBe('11011:tie')
    expect(result.evaluation!.emblemCount).toBe(0)
  })

  it('excludes experts by default and handles unachievable traits without inventing emblems', async () => {
    const s = toy([role(1, [1009], { expert: true }), role(2, [2007])])
    const input = request([task(1009, 1), task(2007, 3)])
    expect((await solveCurrencyWars(s, input)).evaluation!.completedCount).toBe(0)
    const included = await solveCurrencyWars(s, { ...input, includeExperts: true })
    expect(included.evaluation!.completedCount).toBe(1)
    expect(included.evaluation!.emblemCount).toBe(0)
  })

  it('returns empty without initializing a solver and handles an empty eligible roster', async () => {
    const unused: Solver = async () => {
      throw new Error('must not run')
    }
    expect((await solveCurrencyWars(toy(), request(), unused)).status).toBe('empty')
    const result = await solveCurrencyWars(toy(), request([task(2007, 1)]))
    expect(result.status, result.message).toBe('optimal')
    expect(result.lineup!.members).toEqual([])
  })
})

describe('termination and verification', () => {
  const snapshot = toy([role(1, [2007]), role(2, [2007])], [2008])
  const input = request([task(2007, 2)])
  const outcome = (extra: Partial<SolverOutcome>): SolverOutcome => ({
    status: 'limited',
    solverStatus: 'timeLimit',
    feasible: false,
    values: {},
    objective: NaN,
    ...extra,
  })

  it('preserves a verified limited incumbent without claiming optimality', async () => {
    const limited: Solver = async (model, limit) => ({
      ...(await highsSolver(model, limit)),
      status: 'limited',
      solverStatus: 'timeLimit',
    })
    const result = await solveCurrencyWars(snapshot, input, limited)
    expect(result.status).toBe('feasible')
    expect(result.evaluation!.completedCount).toBe(1)
  })

  it.each([
    [outcome({}), 'no-result'],
    [outcome({ status: 'infeasible', solverStatus: 'infeasible' }), 'infeasible'],
    [outcome({ status: 'error', solverStatus: 'modelError' }), 'error'],
    [outcome({ status: 'optimal' }), 'error'],
  ] as const)('maps solver status without using unavailable buffers', async (fake, status) => {
    const result = await solveCurrencyWars(snapshot, input, async () => fake)
    expect(result.status).toBe(status)
    expect(result.lineup).toBeUndefined()
  })

  it('handles a real zero-time solve without assuming an incumbent exists', async () => {
    const result = await highsSolver(buildModel(snapshot, input), 0)
    // Presolve can prove a trivial model optimal even with zero search time.
    if (result.feasible) {
      expect(result.status).toBe('optimal')
      expect(Number.isFinite(result.objective)).toBe(true)
    } else {
      expect(result.solverStatus).toBe('timeLimit')
      expect(result.values).toEqual({})
    }
  })

  it('rejects missing, fractional, invalid objective and false task columns', async () => {
    for (const defect of ['missing', 'fractional', 'objective', 'task']) {
      const corrupt: Solver = async (built, limit) => {
        const solved = await highsSolver(built, limit)
        if (defect === 'missing') delete solved.values[built.columnNames[0]!]
        if (defect === 'fractional') solved.values[built.columnNames[0]!] = 0.5
        if (defect === 'objective') solved.objective += 1
        if (defect === 'task') solved.values[built.taskColumns.get(input.tasks[0]!.id)!] = 0
        return solved
      }
      const result = await solveCurrencyWars(snapshot, input, corrupt)
      expect(result.status).toBe('error')
      expect(result.lineup).toBeUndefined()
    }
  })
})
