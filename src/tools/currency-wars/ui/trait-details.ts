import type { Evaluation, TaskEvaluation } from '../types'

/** A single trait row retains every task, independent of task completion and activation. */
export function traitDetails(evaluation: Evaluation) {
  const targets = new Map<number, TaskEvaluation[]>()
  for (const task of evaluation.tasks) {
    const group = targets.get(task.traitId) ?? []
    group.push(task)
    targets.set(task.traitId, group)
  }
  const traits = new Map(evaluation.traits.map((trait) => [trait.traitId, trait]))
  const targetRows = [...targets].map(([traitId, tasks]) => ({ ...traits.get(traitId)!, tasks }))
  return [
    ...targetRows.filter((row) => row.activeThreshold === null),
    ...targetRows.filter((row) => row.activeThreshold !== null),
    ...evaluation.traits
      .filter((trait) => trait.activeThreshold !== null && !targets.has(trait.traitId))
      .map((trait) => ({ ...trait, tasks: [] as TaskEvaluation[] })),
  ]
}
