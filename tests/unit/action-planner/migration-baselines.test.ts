import { describe, it, expect } from 'vitest'
import { simulatePlan } from '../../../src/tools/action-planner/engine/engine'
import { cases, projectResult } from '../../fixtures/action-planner/action-planner-cases'
import expected from '../../fixtures/action-planner/action-planner-expected.json'
describe('fixed develop engine equivalence', () => {
  it.each(Object.entries(cases))('%s', (name, plan) => {
    // The historical contract predates additive immediate-action explanations.
    // Keep every numeric/order/diagnostic field and ordinary trace under comparison.
    const result = projectResult(simulatePlan(plan))
    for (const record of result.records)
      record.actionChanges = record.actionChanges.filter((c) => c.type !== 'immediatelyAct')
    for (const snapshot of result.snapshots)
      for (const entry of snapshot.queue)
        entry.actionChanges = entry.actionChanges.filter((c) => c.type !== 'immediatelyAct')
    expect(JSON.parse(JSON.stringify(result))).toEqual(
      expected.results[name as keyof typeof expected.results],
    )
  })
})
