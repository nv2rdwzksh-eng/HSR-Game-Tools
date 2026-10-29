import { describe, expect, it } from 'vitest'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import { buildModel } from '../../../src/tools/currency-wars/model'
import { solveCurrencyWars } from '../../../src/tools/currency-wars/solve'
import { loadPageData } from '../../../src/tools/currency-wars/ui/data'
import { createVisuals, sortVisualMembers } from '../../../src/tools/currency-wars/ui/visuals'
import { emblem, navigator, request, role, task, toy } from './helpers'
import type { Snapshot } from '../../../src/tools/currency-wars/types'

describe('Issue 4 special rules', () => {
  it('restricts regular Jing Yuan consistently without editing source forms or costs', async () => {
    const { snapshot, visuals } = loadPageData()
    const input = request([task(1007, 1)])
    const model = buildModel(snapshot, input)
    expect(model.roleColumns.has('1204')).toBe(true)
    for (const formId of ['12041', '12042']) {
      expect(snapshot.roles.some((r) => r.id === formId)).toBe(true)
      expect(model.roleColumns.has(formId)).toBe(false)
      expect(evaluateLineup(snapshot, input, { members: [{ formId, emblemIds: [] }] }).valid).toBe(
        false,
      )
    }
    expect([visuals.costs['1204'], visuals.costs['12041'], visuals.costs['12042']]).toEqual([
      5, 1, 3,
    ])
    const restricted: Snapshot = {
      ...snapshot,
      roles: (snapshot as Snapshot).roles.filter((r) => ['1204', '12041', '12042'].includes(r.id)),
    }
    const result = await solveCurrencyWars(restricted, { ...input, emblemBudget: 0 })
    expect(result.status, result.message).toBe('optimal')
    expect(result.lineup!.members.map((m) => m.formId)).toEqual(['1204'])
  })

  it.each([
    ['8007', 2004, 2012],
    ['8009', 2012, 2004],
  ] as const)(
    'models %s granting both Classes to Himeko while keeping Trailblazer innate traits exclusive',
    async (id, own, other) => {
      const target = role(Number(id), [1001, own], { identityId: 8007 })
      const snapshot = toy([navigator, target])
      const input = request([task(2004, 1), task(2012, 1)], { slots: 2, emblemBudget: 0 })
      const result = await solveCurrencyWars(snapshot, input)
      expect(result.status, result.message).toBe('optimal')
      expect(result.evaluation!.completedCount).toBe(2)
      expect(result.lineup!.members.find((m) => m.formId === navigator.id)!.navigatorTarget).toBe(
        id,
      )
      expect(
        result.evaluation!.members.find((m) => m.formId === navigator.id)!.extraTraits.sort(),
      ).toEqual([2004, 2012])
      const evaluated = result.evaluation!.members.find((m) => m.formId === id)!
      expect(evaluated.finalTraits).toContain(own)
      expect(evaluated.finalTraits).not.toContain(other)
      expect(result.evaluation!.traits.find((t) => t.traitId === own)!.count).toBe(2)
      expect(result.evaluation!.traits.find((t) => t.traitId === other)!.count).toBe(1)
    },
  )

  it.each([8007, 8009])(
    'inherits only the two granted Classes and preserves equipment conflicts for target %s',
    async (id) => {
      const own = id === 8007 ? 2004 : 2012
      const other = id === 8007 ? 2012 : 2004
      const snapshot = toy(
        [navigator, role(id, [1001, own], { identityId: 8007 })],
        [own, other, 2007],
      )
      const input = request([task(other, 2), task(2007, 2)], {
        slots: 2,
        emblemBudget: 2,
        objective: 'min-emblems',
      })
      const lineup = {
        members: [
          { formId: navigator.id, emblemIds: [], navigatorTarget: String(id) },
          { formId: String(id), emblemIds: [emblem(other), emblem(2007)] },
        ],
      }
      const evaluation = evaluateLineup(snapshot, input, lineup)
      expect(evaluation.valid, evaluation.errors.join('; ')).toBe(true)
      expect(evaluation.members.find((m) => m.formId === navigator.id)!.extraTraits.sort()).toEqual(
        [2004, 2012],
      )
      expect(evaluation.members.find((m) => m.formId === String(id))!.finalTraits).toEqual([
        1001,
        own,
        other,
        2007,
      ])
      expect(evaluation.traits.find((t) => t.traitId === 2007)!.contributors).toEqual([String(id)])
      expect(evaluation.traits.find((t) => t.traitId === other)!.count).toBe(2)
      expect(evaluation.completedCount).toBe(1)
      const result = await solveCurrencyWars(snapshot, input)
      expect(result.status, result.message).toBe('optimal')
      expect(result.evaluation!.completedCount).toBe(1)
      expect(result.evaluation!.emblemCount).toBe(1)
      for (const conflict of [own, other]) {
        const bad = {
          members: [{ ...lineup.members[0]!, emblemIds: [emblem(conflict)] }, lineup.members[1]!],
        }
        expect(
          evaluateLineup(snapshot, { ...input, emblemBudget: 3 }, bad).errors.some((e) =>
            e.includes('inherited trait conflict'),
          ),
        ).toBe(true)
      }
      const sharedEmblem = evaluateLineup(
        snapshot,
        { ...input, emblemBudget: 3 },
        {
          members: [{ ...lineup.members[0]!, emblemIds: [emblem(2007)] }, lineup.members[1]!],
        },
      )
      expect(sharedEmblem.valid, sharedEmblem.errors.join('; ')).toBe(true)
      expect(sharedEmblem.completedCount).toBe(2)
      expect(
        sharedEmblem.members.find((m) => m.formId === navigator.id)!.extraTraits.sort(),
      ).toEqual([2004, 2012])
      const innateConflict = toy([
        { ...navigator, innateTraits: [...navigator.innateTraits, other] },
        snapshot.roles[1]!,
      ])
      const blocked = await solveCurrencyWars(
        innateConflict,
        request([task(own, 2)], { slots: 2, emblemBudget: 0 }),
      )
      expect(blocked.evaluation!.completedCount, blocked.message).toBe(0)
    },
  )

  it('preserves identity exclusion and ordinary-target inheritance', async () => {
    const snapshot = toy([
      navigator,
      role(8007, [1001, 2004], { identityId: 8007 }),
      role(8009, [1001, 2012], { identityId: 8007 }),
      role(1, [1001, 2007]),
    ])
    const input = request([task(2004, 1), task(2012, 1)])
    expect(
      evaluateLineup(snapshot, input, {
        members: [
          { formId: '8007', emblemIds: [] },
          { formId: '8009', emblemIds: [] },
        ],
      }).valid,
    ).toBe(false)
    const ordinary = evaluateLineup(snapshot, input, {
      members: [
        { formId: navigator.id, emblemIds: [], navigatorTarget: '1' },
        { formId: '1', emblemIds: [] },
      ],
    })
    expect(ordinary.members.find((m) => m.formId === navigator.id)!.extraTraits).toEqual([2007])
    const result = await solveCurrencyWars(snapshot, input)
    expect(
      result.lineup!.members.filter((m) => ['8007', '8009'].includes(m.formId)).length,
    ).toBeLessThanOrEqual(1)
  })

  it('maps both Trailblazer portraits to Stelle and sorts only a presentation copy', () => {
    const { snapshot, visuals } = loadPageData()
    const view = createVisuals(snapshot, visuals, '/hsr/')
    const lineup = {
      members: ['8009', '1204', '8007', '12041'].map((formId) => ({ formId, emblemIds: [] })),
    }
    const evaluation = evaluateLineup(snapshot, request(), lineup)
    const members = lineup.members.map((m) =>
      view.member(
        m,
        evaluation.members.find((e) => e.formId === m.formId)!,
      ),
    )
    for (const member of members.filter((m) => m.role.identityId === 8007))
      expect(member.portraitUrl).toBe('/hsr/game-assets/character/8008.webp')
    expect(sortVisualMembers(members).map((m) => m.role.id)).toEqual([
      '1204',
      '8007',
      '8009',
      '12041',
    ])
    expect(members.map((m) => m.role.id)).toEqual(['8009', '1204', '8007', '12041'])
    expect(lineup.members.map((m) => m.formId)).toEqual(['8009', '1204', '8007', '12041'])
  })
})
