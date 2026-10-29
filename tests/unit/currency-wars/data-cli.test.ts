import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  dataDirectory,
  loadSnapshot,
  parseSource,
  projectSnapshot,
  projectRoot,
} from '../../../scripts/currency-wars/data'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import { solveCurrencyWars } from '../../../src/tools/currency-wars/solve'
import { formatResult } from '../../../src/tools/currency-wars/presentation'
import { parseTasks } from '../../../src/tools/currency-wars/validation'
import { request, task } from './helpers'

describe('checked-in game snapshot', () => {
  it('projects source fields explicitly and refuses unknown trait types and emblem mappings', () => {
    const traits = [
      { ID: 1001 },
      { ID: 1005 },
      { ID: 2006, TraitType: 'Class' },
      { ID: 2007, TraitType: 'Class' },
      { ID: 3007, TraitType: 'Unique' },
    ].map((t) => ({
      ...t,
      SeasonID: 1,
      ActivationType: 'GreaterEqualThan',
      TraitName: { Hash: String(t.ID) },
    }))
    const input = {
      'ExcelOutput/GridFightRoleBasicInfo.json': [
        { ID: 1, AvatarID: 1, SeasonID: 1, IsInPool: true, TraitList: [2007] },
      ],
      'ExcelOutput/GridFightRoleSwitchConfig.json': [],
      'ExcelOutput/GridFightTraitBasicInfo.json': traits,
      'ExcelOutput/GridFightTraitLayer.json': traits.map((t) => ({ TraitID: t.ID, Layer: 1 })),
      'ExcelOutput/AvatarConfig.json': [{ AvatarID: 1, AvatarName: { Hash: '1' } }],
      'ExcelOutput/AvatarConfigLD.json': [],
      'ExcelOutput/GridFightItems.json': [{ ID: 50, ItemName: { Hash: '50' } }],
      'ExcelOutput/GridFightEquipment.json': [
        {
          ID: 50,
          EquipCategory: 'Emblem',
          EquipFunc: 'OriginEmblem',
          EquipFuncParamList: [1001],
          DressRule: 'DressRuleUniqueAndExclusiveTrait',
          DressRuleParamList: [1001],
        },
      ],
      'TextMap/TextMapCHS.json': Object.fromEntries([
        ...traits.map((t) => [String(t.ID), '羁绊' + t.ID]),
        ['1', '角色'],
        ['50', '星徽'],
      ]),
    }
    expect(projectSnapshot(input).traits.find((t) => t.id === 2007)!.type).toBe('class')
    expect(projectSnapshot(input).traits.find((t) => t.id === 1001)!.type).toBe('camp')
    expect(() =>
      projectSnapshot({
        ...input,
        'ExcelOutput/GridFightTraitBasicInfo.json': traits.map((t) => ({
          ...t,
          TraitType: 'Unknown',
        })),
      }),
    ).toThrow('Unreviewed trait type')
    expect(() =>
      projectSnapshot({
        ...input,
        'ExcelOutput/GridFightEquipment.json': [
          { ...input['ExcelOutput/GridFightEquipment.json'][0], DressRuleParamList: [2007] },
        ],
      }),
    ).toThrow('Unreviewed emblem rule')
  })

  it('preserves exact integer hashes before TextMap lookups', () => {
    expect(parseSource('{"Hash":18446744073709551615}')).toEqual({ Hash: '18446744073709551615' })
    expect(() => parseSource('{"Hash":18446744073709551615.0}')).toThrow()
    expect(() => parseSource('{"Hash":1e19}')).toThrow()
  })

  it('has pinned provenance, official types, all names, and mutually exclusive identities', async () => {
    const snapshot = await loadSnapshot()
    const manifest = JSON.parse(readFileSync(path.join(dataDirectory, 'manifest.json'), 'utf8'))
    expect(manifest.commit).toBe('312b4597691e0a29cf9828a15b592757dba86949')
    expect(manifest.snapshotSha256).toBe(
      createHash('sha256')
        .update(readFileSync(path.join(dataDirectory, 'snapshot.json')))
        .digest('hex'),
    )
    expect(manifest.counts).toEqual({
      sourceRoleConfigs: 77,
      normalizedForms: 78,
      identities: 71,
      nonExpertIdentities: 62,
      traits: 33,
      emblems: 22,
    })
    expect(snapshot.traits.filter((t) => t.type === 'camp')).toHaveLength(14)
    expect(snapshot.traits.filter((t) => t.type === 'class')).toHaveLength(12)
    expect(snapshot.traits.filter((t) => t.type === 'unique')).toHaveLength(7)
    for (const id of [2007, 2008])
      expect(snapshot.traits.find((t) => t.id === id)!.type).toBe('class')
    for (const id of [1001, 1007, 1010])
      expect(snapshot.traits.find((t) => t.id === id)!.type).toBe('camp')
    expect(snapshot.roles.find((r) => r.id === '1508')!.name).toBe('远坂凛')
    expect(snapshot.roles.find((r) => r.id === '8007')!.innateTraits).toEqual([1001, 2004])
    expect(snapshot.roles.find((r) => r.id === '8009')!.innateTraits).toEqual([1001, 2012])
    for (const ids of [
      ['8007', '8009'],
      ['11011', '11012', '11011:tie'],
      ['15061', '15062', '15063'],
      ['1204', '12041', '12042'],
    ])
      expect(
        new Set(ids.map((id) => snapshot.roles.find((r) => r.id === id)!.identityId)).size,
      ).toBe(1)
    expect(snapshot.emblems.some((e) => e.traitId === 1009)).toBe(false)
    expect(
      snapshot.emblems.some(
        (e) => snapshot.traits.find((t) => t.id === e.traitId)!.type === 'unique',
      ),
    ).toBe(false)
    expect(() =>
      parseTasks(
        JSON.parse(readFileSync(path.join(dataDirectory, 'tasks.json'), 'utf8')),
        snapshot,
      ),
    ).not.toThrow()
  })

  it('independently verifies the real Jiaoqiu navigator example and does not copy camp emblems', async () => {
    const snapshot = await loadSnapshot()
    const result = evaluateLineup(snapshot, request([], { emblemBudget: 3 }), {
      members: [
        { formId: '1510', emblemIds: [], navigatorTarget: '1218' },
        { formId: '1218', emblemIds: [35051001, 35051007, 35051010] },
      ],
    })
    expect(result.valid, result.errors.join(';')).toBe(true)
    expect(result.members.find((m) => m.formId === '1510')!.extraTraits).toEqual([2007, 2008])
    for (const camp of [1007, 1008, 1010])
      expect(result.traits.find((t) => t.traitId === camp)!.count).toBe(1)
  })

  it.each([11, 12, 13])(
    'solves real data with %i slots, multiple budgets and an independent result check',
    async (slots) => {
      const snapshot = await loadSnapshot()
      for (const emblemBudget of [12, 18]) {
        const input = request([task(1001, 6), task(2007, 4), task(2008, 4), task(1009, 3)], {
          slots,
          emblemBudget,
          timeLimitSeconds: 5,
        })
        const result = await solveCurrencyWars(snapshot, input)
        expect(['optimal', 'feasible'], result.message).toContain(result.status)
        expect(result.evaluation!.completedCount).toBe(4)
        const independent = evaluateLineup(snapshot, input, result.lineup!)
        expect(independent).toEqual(result.evaluation)
        expect(
          result.lineup!.members.every(
            (m) => !snapshot.roles.find((r) => r.id === m.formId)!.expert,
          ),
        ).toBe(true)
        expect(formatResult(snapshot, input, result)).toContain('任务统计')
      }
    },
    20000,
  )
})

describe('console entrypoint', () => {
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', 'tsx', 'scripts/currency-wars/cli.ts', ...args], {
      cwd: projectRoot,
      encoding: 'utf8',
      timeout: 20000,
    })

  it('handles empty official tasks, help, invalid budget, unknown selection and malformed options', () => {
    const empty = run(
      '--non-interactive',
      '--tasks',
      'tests/fixtures/currency-wars/empty-tasks.json',
    )
    expect(empty.status, empty.stderr).toBe(0)
    expect(empty.stdout).toContain('任务列表为空')
    expect(run('--help').stdout).toContain('--select')
    expect(run('--non-interactive', '--emblems', '11').status).toBe(2)
    expect(run('--non-interactive', '--select', 'missing').status).toBe(2)
    expect(run('--unknown').status).toBe(2)
  })

  it.each(['min-roles', 'min-emblems'] as const)('accepts CLI objective %s', (objective) => {
    const result = run(
      '--non-interactive',
      '--select',
      '1',
      '--objective',
      objective,
      '--time-limit',
      '5',
    )
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(result.stdout).toContain('[' + objective + ']')
    expect(result.stdout).toContain('完成任务：1 / 1')
    expect(run('--non-interactive', '--objective', 'max-roles').status).toBe(2)
    expect(run('--help').stdout).toContain('--objective')
  })

  it('runs a selected demo subset with every required output section and no upstream reads', () => {
    const result = run(
      '--non-interactive',
      '--tasks',
      'tests/fixtures/currency-wars/demo-tasks.json',
      '--select',
      '1,demo-dot-4',
      '--time-limit',
      '5',
    )
    expect(result.status, result.stderr + result.stdout).toBe(0)
    for (const text of ['求解状态', '完成任务：2 / 2', '上场阵容', '已激活羁绊', '任务统计'])
      expect(result.stdout).toContain(text)
    expect(result.stdout).not.toContain('demo-debuff-6：')
    expect(result.stdout).toContain('[min-roles]')
    const out = execFileSync(
      process.execPath,
      ['--import', 'tsx', 'scripts/currency-wars/data.ts', '--check'],
      { cwd: projectRoot, encoding: 'utf8' },
    )
    expect(out).toContain('快照有效')
  })

  it('does not import CLI, raw data or Node filesystem into model/calculator modules', () => {
    for (const file of [
      'types.ts',
      'validation.ts',
      'evaluate.ts',
      'model.ts',
      'presentation.ts',
      'solve.ts',
    ]) {
      const text = readFileSync(path.join(projectRoot, 'src/tools/currency-wars', file), 'utf8')
      expect(text).not.toMatch(
        /from ['"](?:node:|vue|.*scripts\/)|TurnBasedGameData|ExcelOutput|fetch\(/,
      )
    }
    const snapshot = JSON.parse(readFileSync(path.join(dataDirectory, 'snapshot.json'), 'utf8'))
    const demo = JSON.parse(
      readFileSync(path.join(projectRoot, 'tests/fixtures/currency-wars/demo-tasks.json'), 'utf8'),
    )
    expect(parseTasks(demo, snapshot)).toHaveLength(12)
  })
})
