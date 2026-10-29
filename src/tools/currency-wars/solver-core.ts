import { evaluateLineup } from './evaluate'
import type { BuiltModel } from './model'
import type { Lineup, OptimizationRequest, OptimizationResult, Snapshot } from './types'
import { validateRequest } from './validation'

export interface SolverOutcome {
  status: 'optimal' | 'limited' | 'infeasible' | 'error'
  solverStatus: string
  feasible: boolean
  values: Record<string, number>
  objective: number
  objectiveBound?: number
  gap?: number
}

export type Solver = (model: BuiltModel, timeLimitSeconds: number) => Promise<SolverOutcome>

/** Inject only runtime loading; solver options, statuses and result decoding are shared. */
export function createHighsSolver(
  load: () => ReturnType<typeof import('highs').default> = async () => {
    const { default: loadHighs } = await import('highs')
    return loadHighs()
  },
): Solver {
  let runtime: ReturnType<typeof load> | undefined
  return async (built, timeLimitSeconds) => {
    const deadline = performance.now() + timeLimitSeconds * 1000
    const highs = await (runtime ??= load().catch((error: unknown) => {
      runtime = undefined
      throw error
    }))
    const model = highs.createModel({ format: 'lp', data: built.lp })
    try {
      const remaining = Math.max(0, (deadline - performance.now()) / 1000)
      model.options.set({
        output_flag: false,
        time_limit: remaining,
        mip_rel_gap: 0,
        mip_abs_gap: 0,
        random_seed: 0,
      })
      model.run()
      const status = model.getModelStatus()
      const states = highs.constants.modelStatus
      const feasible =
        model.info.get('primal_solution_status') === highs.constants.solutionStatus.feasible
      const solution = feasible ? model.getSolution().colValue : undefined
      const limitedStates: number[] = [
        states.timeLimit,
        states.iterationLimit,
        states.solutionLimit,
        states.interrupted,
        states.objectiveBound,
        states.objectiveTarget,
      ]
      const modelClass =
        status === states.optimal
          ? 'optimal'
          : status === states.infeasible
            ? 'infeasible'
            : limitedStates.includes(status)
              ? 'limited'
              : 'error'
      return {
        status: modelClass,
        solverStatus:
          Object.entries(states).find(([, code]) => code === status)?.[0] ?? String(status),
        feasible,
        // LP parsing orders columns by first occurrence, not by our declaration order.
        values: solution
          ? Object.fromEntries(
              built.columnNames.map((name) => [name, solution[model.getColByName(name)]!]),
            )
          : {},
        objective: feasible ? model.getObjectiveValue() : NaN,
        objectiveBound: feasible ? Number(model.info.get('mip_dual_bound')) : undefined,
        gap: feasible ? Number(model.info.get('mip_gap')) : undefined,
      }
    } finally {
      model.dispose()
    }
  }
}

export const highsSolver: Solver = createHighsSolver()

export async function solveOneModel(
  snapshot: Snapshot,
  request: OptimizationRequest,
  built: BuiltModel,
  solver: Solver,
  timeLimitSeconds: number,
): Promise<OptimizationResult> {
  const start = performance.now()
  const elapsed = () => (performance.now() - start) / 1000
  try {
    validateRequest(snapshot, request)
    if (!request.tasks.length)
      return { request, status: 'empty', elapsedSeconds: elapsed(), message: 'No tasks selected' }
    const result = await solver(built, timeLimitSeconds)
    const base = {
      request,
      solverStatus: result.solverStatus,
      elapsedSeconds: elapsed(),
      objectiveBound: result.objectiveBound,
      gap: result.gap,
    }
    if (result.status === 'error')
      return { ...base, status: 'error', message: 'Solver model/load/solve error' }
    if (result.status === 'infeasible') return { ...base, status: 'infeasible' }
    if (!result.feasible) {
      if (result.status === 'optimal')
        return { ...base, status: 'error', message: 'Optimal status without feasible solution' }
      return { ...base, status: 'no-result' }
    }
    for (const name of built.columnNames) {
      const value = result.values[name]
      if (
        !Number.isFinite(value) ||
        Math.abs(value - Math.round(value)) > 1e-6 ||
        value < -1e-6 ||
        value > 1 + 1e-6
      )
        throw new Error('Invalid binary solver value: ' + name)
    }
    for (const row of built.constraints) {
      const value = [...row.expression].reduce(
        (n, [column, coefficient]) => n + coefficient * Math.round(result.values[column]!),
        0,
      )
      if (
        (row.relation === '<=' && value > row.rhs) ||
        (row.relation === '>=' && value < row.rhs) ||
        (row.relation === '=' && value !== row.rhs)
      )
        throw new Error('Model constraint mismatch')
    }
    const on = (name: string) => result.values[name] > 0.5
    const lineup: Lineup = { members: [] }
    for (const [formId, column] of built.roleColumns) {
      const emblemIds = [...built.emblemColumns.get(formId)!]
        .filter(([, c]) => on(c))
        .map(([id]) => id)
      const targets = [...(built.targetColumns.get(formId) ?? [])]
        .filter(([, c]) => on(c))
        .map(([id]) => id)
      if (targets.length > 1) throw new Error('Multiple navigator targets')
      if (!on(column)) {
        if (emblemIds.length || targets.length)
          throw new Error('Unselected role has equipment or target')
        continue
      }
      lineup.members.push({
        formId,
        emblemIds,
        ...(targets.length ? { navigatorTarget: targets[0] } : {}),
      })
    }
    const evaluation = evaluateLineup(snapshot, request, lineup)
    if (!evaluation.valid)
      throw new Error('Independent verification failed: ' + evaluation.errors.join('; '))
    for (const trait of evaluation.traits) {
      const predicted = [...built.countExpressions.get(trait.traitId)!].reduce(
        (n, [column, c]) => n + c * Math.round(result.values[column]!),
        0,
      )
      if (predicted !== trait.count) throw new Error('Model trait count mismatch: ' + trait.traitId)
    }
    for (const task of evaluation.tasks)
      if (on(built.taskColumns.get(task.id)!) !== task.completed)
        throw new Error('Model task flag mismatch: ' + task.id)
    if (
      !Number.isFinite(result.objective) ||
      Math.abs(result.objective - evaluation.objective) > 1e-5
    )
      throw new Error('Model objective mismatch')
    return {
      ...base,
      elapsedSeconds: elapsed(),
      status: result.status === 'optimal' ? 'optimal' : 'feasible',
      lineup,
      evaluation,
    }
  } catch (error) {
    return {
      request,
      status: 'error',
      elapsedSeconds: elapsed(),
      message: error instanceof Error ? error.message : String(error),
    }
  }
}
