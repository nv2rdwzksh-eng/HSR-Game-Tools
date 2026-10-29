import { describe, expect, it } from 'vitest'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import {
  parseTasks,
  assertSnapshot,
  validateRequest,
} from '../../../src/tools/currency-wars/validation'
import { selectTasks } from '../../../src/tools/currency-wars/presentation'
import { bronyaForms, emblem, navigator, request, role, task, toy } from './helpers'

describe('independent lineup evaluator', () => {
  it('counts one contributor per role and per trait, including the same emblem on different roles', () => {
    const s = toy([role(1, [1008, 2007]), role(2, [2007])], [2008])
    const evaluation = evaluateLineup(s, request([task(2008, 1), task(2008, 2), task(2008, 3)]), {
      members: [
        { formId: '1', emblemIds: [emblem(2008)] },
        { formId: '2', emblemIds: [emblem(2008)] },
      ],
    })
    expect(evaluation.valid).toBe(true)
    expect(evaluation.completedCount).toBe(2)
    expect(evaluation.traits.find((t) => t.traitId === 2008)).toMatchObject({
      count: 2,
      activeThreshold: 2,
      contributors: ['1', '2'],
    })
  })

  it.each([
    ['duplicate emblem', [emblem(2008), emblem(2008)]],
    ['innate trait conflict', [emblem(2007)]],
    ['unknown emblem', [999999]],
    ['too many emblems', [emblem(2008), emblem(1001), emblem(1005), emblem(2006)]],
  ])('rejects %s', (_name, emblemIds) => {
    const s = toy([role(1, [2007])], [2007, 2008, 1001, 1005, 2006])
    expect(
      evaluateLineup(s, request([], { emblemBudget: 10 }), {
        members: [{ formId: '1', emblemIds }],
      }).valid,
    ).toBe(false)
  })

  it('rejects roster overflow, duplicate identities, experts, unknown roles and global budget overflow', () => {
    const s = toy(
      [role(1, [2007]), role(2, [2008], { identityId: 1 }), role(3, [1005], { expert: true })],
      [1001],
    )
    const cases = [
      {
        members: [
          { formId: '1', emblemIds: [] },
          { formId: '2', emblemIds: [] },
        ],
      },
      {
        members: [
          { formId: '1', emblemIds: [] },
          { formId: '1', emblemIds: [] },
        ],
      },
      { members: [{ formId: '3', emblemIds: [] }] },
      { members: [{ formId: 'missing', emblemIds: [] }] },
      { members: [{ formId: '1', emblemIds: [emblem(1001)] }] },
    ]
    for (const lineup of cases)
      expect(evaluateLineup(s, request([], { slots: 1, emblemBudget: 0 }), lineup).valid).toBe(
        false,
      )
  })

  it('inherits every innate Class from an emblem-qualified target, never emblem Classes, Camp or Unique', () => {
    const s = toy([navigator, role(1218, [1008, 2007, 2008, 3001])], [1001, 1007, 2004])
    const evaluation = evaluateLineup(s, request([], { emblemBudget: 3 }), {
      members: [
        { formId: '1510', emblemIds: [], navigatorTarget: '1218' },
        { formId: '1218', emblemIds: [emblem(1001), emblem(1007), emblem(2004)] },
      ],
    })
    expect(evaluation.valid).toBe(true)
    expect(evaluation.members.find((m) => m.formId === '1510')!.extraTraits.sort()).toEqual([
      2007, 2008,
    ])
    for (const traitId of [1008, 1007, 3001])
      expect(evaluation.members.find((m) => m.formId === '1510')!.finalTraits).not.toContain(
        traitId,
      )
    expect(evaluation.traits.find((t) => t.traitId === 1008)!.count).toBe(1)
    expect(evaluation.traits.find((t) => t.traitId === 3001)!.count).toBe(1)
    expect(evaluation.traits.find((t) => t.traitId === 2004)).toMatchObject({
      count: 1,
      contributors: ['1218'],
    })
    expect(evaluation.members.find((m) => m.formId === '1218')!.finalTraits).toEqual(
      expect.arrayContaining([1008, 2007, 2008, 3001, 1001, 1007, 2004]),
    )
  })

  it.each([
    { innate: [1001, 2007], equipped: [2004], inherited: [2007] },
    { innate: [2007], equipped: [1001, 2004], inherited: [2007] },
    { innate: [1001], equipped: [2004], inherited: [] },
    { innate: [1008], equipped: [1001, 2004], inherited: [] },
    { innate: [1001, 2007, 2008], equipped: [2004], inherited: [2007, 2008] },
  ])(
    'copies only innate Classes: $innate with emblems $equipped',
    ({ innate, equipped, inherited }) => {
      const snapshot = toy([navigator, role(1, innate)], equipped)
      const evaluation = evaluateLineup(snapshot, request(), {
        members: [
          { formId: navigator.id, emblemIds: [], navigatorTarget: '1' },
          { formId: '1', emblemIds: equipped.map(emblem) },
        ],
      })
      expect(evaluation.valid, evaluation.errors.join('; ')).toBe(true)
      expect(evaluation.members.find((m) => m.formId === navigator.id)!.extraTraits).toEqual(
        inherited,
      )
      expect(evaluation.members.find((m) => m.formId === '1')!.finalTraits).toEqual([
        ...innate,
        ...equipped,
      ])
      expect(evaluation.traits.find((t) => t.traitId === 2004)!.contributors).toEqual(['1'])
    },
  )

  it('rejects missing train qualification, self/missing targets, ordinary-role targets and duplicate inheritance', () => {
    const s = toy([navigator, role(1, [2007]), role(2, [1001, 2007])], [2007])
    for (const target of ['1510', 'missing', '1'])
      expect(
        evaluateLineup(s, request(), {
          members: [
            { formId: '1510', emblemIds: [], navigatorTarget: target },
            { formId: '1', emblemIds: [] },
          ],
        }).valid,
      ).toBe(false)
    expect(
      evaluateLineup(s, request(), {
        members: [
          { formId: '1510', emblemIds: [emblem(2007)], navigatorTarget: '2' },
          { formId: '2', emblemIds: [] },
        ],
      }).valid,
    ).toBe(false)
    expect(
      evaluateLineup(s, request(), {
        members: [{ formId: '2', emblemIds: [], navigatorTarget: '1510' }],
      }).valid,
    ).toBe(false)
  })

  it('permits a Trailblazer to gain its inactive Class via an emblem, but not both forms', () => {
    const s = toy(
      [
        role(8007, [1001, 2004], { identityId: 8007, position: 'front' }),
        role(8009, [1001, 2012], { identityId: 8007, position: 'back' }),
      ],
      [2004, 2012],
    )
    const evaluation = evaluateLineup(s, request(), {
      members: [{ formId: '8007', emblemIds: [emblem(2012)] }],
    })
    expect(evaluation.valid).toBe(true)
    expect(evaluation.members[0]!.finalTraits).toEqual([1001, 2004, 2012])
    expect(
      evaluateLineup(s, request(), {
        members: [
          { formId: '8007', emblemIds: [] },
          { formId: '8009', emblemIds: [] },
        ],
      }).valid,
    ).toBe(false)
  })

  it('selects Bronya from other-role and emblem counts; ties are conservative and equipment-safe', () => {
    const s = toy([...bronyaForms, role(1, [1005])], [2006, 1005, 1001])
    const lineup = {
      members: [
        { formId: '11011', emblemIds: [] },
        { formId: '1', emblemIds: [] },
      ],
    }
    expect(evaluateLineup(s, request(), lineup).valid).toBe(true)
    expect(
      evaluateLineup(s, request(), {
        members: [
          { formId: '11012', emblemIds: [] },
          { formId: '1', emblemIds: [] },
        ],
      }).valid,
    ).toBe(false)
    const tied = {
      members: [
        { formId: '11011:tie', emblemIds: [] },
        { formId: '1', emblemIds: [emblem(2006)] },
      ],
    }
    const result = evaluateLineup(s, request(), tied)
    expect(result.valid).toBe(true)
    expect(result.warnings).toContain('bronya-tie-conservative-lower-bound')
    expect(result.traits.find((t) => t.traitId === 1005)!.count).toBe(1)
    expect(
      evaluateLineup(s, request(), {
        members: [{ formId: '11011:tie', emblemIds: [emblem(1005)] }],
      }).valid,
    ).toBe(false)
    expect(
      evaluateLineup(toy([...bronyaForms, navigator], [1001]), request(), {
        members: [
          { formId: '11011:tie', emblemIds: [emblem(1001)] },
          { formId: '1510', emblemIds: [], navigatorTarget: '11011:tie' },
        ],
      }).errors,
    ).toContain('Bronya navigator target is unsupported in V1')
  })

  it('includes navigator inheritance in Bronya comparisons without a feedback loop', () => {
    const s = toy([...bronyaForms, navigator, role(1, [1001, 2006]), role(2, [1005])])
    const evaluation = evaluateLineup(s, request([], { slots: 4 }), {
      members: [
        { formId: '11012', emblemIds: [] },
        { formId: '1510', emblemIds: [], navigatorTarget: '1' },
        { formId: '1', emblemIds: [] },
        { formId: '2', emblemIds: [] },
      ],
    })
    expect(evaluation.valid).toBe(true)
    expect(evaluation.traits.find((t) => t.traitId === 2006)!.count).toBe(3)
  })
})

describe('tasks, requests and snapshots', () => {
  it('validates IDs, counts and typed traits; selects by number or ID and deduplicates', () => {
    const s = toy()
    const tasks = [task(2007, 2, 'a'), task(2007, 4, 'b')]
    expect(parseTasks(tasks, s)).toEqual(tasks)
    expect(selectTasks(tasks, '1,a,b')).toEqual(tasks)
    for (const invalid of [
      [...tasks, tasks[0]],
      [task(99999, 2)],
      [task(2007, 0)],
      [task(2007, 1.5)],
      [{ ...tasks[0], unexpected: true }],
    ])
      expect(() => parseTasks(invalid, s)).toThrow()
    expect(() => selectTasks(tasks, 'missing')).toThrow()
    expect(() => selectTasks(tasks, '')).toThrow()
    expect(() =>
      assertSnapshot({ ...s, traits: [{ ...s.traits[0], type: 'something' }] }),
    ).toThrow()
  })

  it('keeps public limits out of tiny test requests, and accepts unbounded user budgets naturally', () => {
    const s = toy()
    expect(() => validateRequest(s, request(), false)).not.toThrow()
    expect(() => validateRequest(s, request(), true)).toThrow()
    for (const slots of Array.from({ length: 13 }, (_, index) => index + 1))
      for (const emblemBudget of [12, 20, Number.MAX_SAFE_INTEGER])
        expect(() => validateRequest(s, request([], { slots, emblemBudget }), true)).not.toThrow()
    for (const slots of [0, 14, 1.5, Infinity])
      expect(() => validateRequest(s, request([], { slots, emblemBudget: 18 }), true)).toThrow()
    for (const emblemBudget of [-1, 11, 12.5, Infinity])
      expect(() => validateRequest(s, request([], { slots: 13, emblemBudget }), true)).toThrow()
  })
})
