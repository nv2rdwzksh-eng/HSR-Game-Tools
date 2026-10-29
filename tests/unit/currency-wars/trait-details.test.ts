import { describe, expect, it } from 'vitest'
import { traitDetails } from '../../../src/tools/currency-wars/ui/trait-details'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import { request, role, task, toy } from './helpers'

it('merges by stable trait ID, preserves all tasks and sorts by actual activation', () => {
  const snapshot = toy([role(1, [1007, 1005, 2007, 1009]), role(2, [1005]), role(3, [1005])])
  const input = request([task(1005, 4), task(1007, 7), task(1007, 3), task(2008, 2)], { slots: 3 })
  const evaluation = evaluateLineup(snapshot, input, {
    members: snapshot.roles.map((r) => ({ formId: r.id, emblemIds: [] })),
  })
  const rows = traitDetails(evaluation)
  expect(rows.map((r) => r.traitId)).toEqual([1007, 2008, 1005, 1009])
  expect(rows[0]).toMatchObject({ count: 1, activeThreshold: null, contributors: ['1'] })
  expect(rows[0]!.tasks.map((t) => [t.requiredCount, t.completed])).toEqual([
    [7, false],
    [3, false],
  ])
  expect(rows[1]).toMatchObject({ count: 0, contributors: [] })
  expect(rows[2]).toMatchObject({ count: 3, activeThreshold: 2 })
  expect(rows[2]!.tasks[0]!.completed).toBe(false)
  expect(rows.some((r) => r.traitId === 2007)).toBe(false)
})

it('keeps active-but-incomplete targets in the active group and handles no inactive targets', () => {
  const snapshot = toy([role(1, [1007, 1009]), role(2, [1007]), role(3, [1007]), role(4, [1007])])
  const evaluation = evaluateLineup(
    snapshot,
    request([task(1007, 3), task(1007, 7)], { slots: 4 }),
    { members: snapshot.roles.map((r) => ({ formId: r.id, emblemIds: [] })) },
  )
  const rows = traitDetails(evaluation)
  expect(rows.map((r) => r.traitId)).toEqual([1007, 1009])
  expect(rows[0]).toMatchObject({ count: 4, activeThreshold: 3 })
  expect(rows[0]!.tasks.map((t) => t.completed)).toEqual([true, false])
})

describe('empty trait details', () => {
  it('allows empty targets and empty lineups', () => {
    expect(traitDetails(evaluateLineup(toy(), request(), { members: [] }))).toEqual([])
  })
})
