import { describe, expect, it } from 'vitest'
import { buildModel } from '../../../src/tools/currency-wars/model'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import { solveCurrencyWars, highsSolver, type Solver } from '../../../src/tools/currency-wars/solve'
import { validateRequest } from '../../../src/tools/currency-wars/validation'
import { emblem, request, role, task, toy } from './helpers'

const snapshot = toy([role(1, [2007]), role(2, [2008]), role(3, [2008])], [2008])
const tasks = [task(2007, 1), task(2008, 2)]

describe('single-lineup lexicographic objectives', () => {
  it.each(['min-roles', 'min-emblems'] as const)(
    'prioritizes completion and minimizes only the chosen cost (%s)',
    async (objective) => {
      const input = request(tasks, { slots: 3, emblemBudget: 3, objective })
      const result = await solveCurrencyWars(snapshot, input)
      expect(result.status, result.message).toBe('optimal')
      expect(result.evaluation!.completedCount).toBe(2)
      expect(result.evaluation).toEqual(evaluateLineup(snapshot, input, result.lineup!))
      if (objective === 'min-roles') {
        expect(result.lineup!.members).toHaveLength(2)
        expect(result.evaluation!.emblemCount).toBeGreaterThanOrEqual(1)
        expect(result.evaluation!.objective).toBe(6)
      } else {
        expect(result.lineup!.members).toHaveLength(3)
        expect(result.evaluation!.emblemCount).toBe(0)
        expect(result.evaluation!.objective).toBe(8)
      }
      expect(result).not.toHaveProperty('solutions')
    },
  )

  it('assigns no emblem penalty in min-roles and no role penalty in min-emblems', () => {
    const lineup = { members: [{ formId: '1', emblemIds: [] as number[] }] }
    const extraEmblem = { members: [{ formId: '1', emblemIds: [emblem(2008)] }] }
    const extraRole = { members: [...lineup.members, { formId: '2', emblemIds: [] }] }
    for (const objective of ['min-roles', 'min-emblems'] as const) {
      const input = request([task(2007, 1)], { slots: 3, objective })
      const other = objective === 'min-roles' ? extraEmblem : extraRole
      const base = evaluateLineup(snapshot, input, lineup)
      const tied = evaluateLineup(snapshot, input, other)
      expect(base.valid && tied.valid).toBe(true)
      expect(tied.objective).toBe(base.objective)
      const built = buildModel(snapshot, input)
      const line = built.lp.split('\n')[1]!
      const penalized =
        objective === 'min-roles'
          ? [...built.roleColumns.values()]
          : [...built.emblemColumns.values()].flatMap((m) => [...m.values()])
      const unpenalized =
        objective === 'min-roles'
          ? [...built.emblemColumns.values()].flatMap((m) => [...m.values()])
          : [...built.roleColumns.values()]
      for (const column of penalized) expect(line.split(' ')).toContain(column)
      for (const column of unpenalized) expect(line.split(' ')).not.toContain(column)
    }
  })

  it.each(['min-roles', 'min-emblems'] as const)(
    'does not fill slots or the budget unnecessarily (%s)',
    async (objective) => {
      const result = await solveCurrencyWars(
        toy([role(1, [2007])]),
        request([task(2007, 1)], { slots: 3, emblemBudget: 12, objective }),
      )
      expect(result.lineup!.members).toHaveLength(1)
      expect(result.evaluation!.emblemCount).toBe(0)
    },
  )

  it.each(['min-roles', 'min-emblems'] as const)(
    'never upgrades an unproven incumbent even when every task is complete (%s)',
    async (objective) => {
      const limited: Solver = async (model, limit) => ({
        ...(await highsSolver(model, limit)),
        status: 'limited',
        solverStatus: 'timeLimit',
      })
      const result = await solveCurrencyWars(
        snapshot,
        request(tasks, { slots: 3, objective }),
        limited,
      )
      expect(result.evaluation!.completedCount).toBe(2)
      expect(result.status).toBe('feasible')
    },
  )

  it('uses one remaining budget and a detached request', async () => {
    const input = request(
      tasks.map((task) => ({ ...task })),
      { slots: 3, timeLimitSeconds: 5 },
    )
    const ticks = [0, 2000, 5000]
    let calls = 0
    const solver: Solver = async (model, limit) => {
      calls++
      expect(limit).toBe(3)
      input.objective = 'min-emblems'
      input.tasks[0]!.requiredCount = 99
      return highsSolver(model, limit)
    }
    const result = await solveCurrencyWars(snapshot, input, solver, () => ticks.shift()!)
    expect(calls).toBe(1)
    expect(result.request.objective).toBe('min-roles')
    expect(result.request.tasks[0]!.requiredCount).toBe(1)
    expect(result.elapsedSeconds).toBe(5)
  })

  it('does not invoke the solver after model-building exhausts the budget', async () => {
    let calls = 0
    const ticks = [0, 6000, 6000]
    const solver: Solver = async () => {
      calls++
      throw new Error('must not run')
    }
    const result = await solveCurrencyWars(snapshot, request([task(2007, 1)]), solver, () =>
      ticks.shift()!,
    )
    expect(result.status).toBe('no-result')
    expect(calls).toBe(0)
  })

  it('returns a structured error for malformed task input without calling a solver', async () => {
    const solver: Solver = async () => {
      throw new Error('must not run')
    }
    const result = await solveCurrencyWars(snapshot, { ...request(), tasks: null } as never, solver)
    expect(result.status).toBe('error')
    expect(result.message).toBe('Tasks must be an array')
  })

  it.each([undefined, '', 'max-roles', 'min-emblem'])(
    'rejects invalid objective %s',
    (objective) => {
      expect(() => validateRequest(snapshot, { ...request(), objective } as never)).toThrow(
        'Invalid optimization objective',
      )
    },
  )
})
