import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFile, realpath, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { RoleForm, Snapshot, TraitType } from '../../src/tools/currency-wars/types'
import { assertSnapshot, record } from '../../src/tools/currency-wars/validation'
import lock from './source-lock.json'

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
export const dataDirectory = path.join(projectRoot, 'data/currency-wars')
const sourceFiles = [
  'GridFightRoleBasicInfo',
  'GridFightTraitBasicInfo',
  'GridFightEquipment',
  'GridFightTraitLayer',
  'GridFightRoleSwitchConfig',
  'GridFightTraitEffect',
  'GridFightItems',
  'AvatarConfig',
  'AvatarConfigLD',
]
  .map((name) => 'ExcelOutput/' + name + '.json')
  .concat('TextMap/TextMapCHS.json')
const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + '\n'

export function parseSource(text: string): unknown {
  return JSON.parse(text, (key: string, value: unknown, context?: { source: string }) => {
    if (key !== 'Hash') return value
    if (!context || !/^(0|[1-9][0-9]*)$/.test(context.source))
      throw new Error('Hash requires an exact integer lexeme and Node 24')
    return context.source
  }) as unknown
}

interface NameReference {
  Hash: string
}
interface RawRole {
  ID: number
  AvatarID: number
  TraitList: number[]
  IsInPool?: boolean
  IsExpert?: number
  SeasonID: number
  FrontBackType?: 'Front' | 'Back'
}
interface RawTrait {
  ID: number
  TraitType?: string
  TraitName: NameReference
  SeasonID: number
  ActivationType: string
}
interface RawEquipment {
  ID: number
  EquipCategory: string
  EquipFunc: string
  EquipFuncParamList: number[]
  DressRule: string
  DressRuleParamList: number[]
}
interface RawSwitch {
  RoleID: number
  BaseRoleID: number
  Condition: string
  ParamList: number[]
}

export function projectSnapshot(input: Record<string, unknown>): Snapshot {
  function rows<T>(name: string): T[] {
    const value = input['ExcelOutput/' + name + '.json']
    if (!Array.isArray(value)) throw new Error('Expected source array: ' + name)
    return value as T[]
  }
  const rawTextMap = input['TextMap/TextMapCHS.json']
  if (!record(rawTextMap)) throw new Error('Missing Chinese TextMap')
  const textMap = rawTextMap
  function name(ref: NameReference | undefined) {
    const raw = ref && textMap[ref.Hash]
    if (typeof raw !== 'string' || !raw.trim())
      throw new Error('Missing official name: ' + ref?.Hash)
    const clean = raw.replace(/<\/?unbreak>/g, '').trim()
    if (clean === '{NICKNAME}') return '开拓者'
    if (/[<>{}]/.test(clean)) throw new Error('Unsupported name markup: ' + clean)
    return clean
  }
  const avatars = new Map(
    [
      ...rows<{ AvatarID: number; AvatarName: NameReference }>('AvatarConfig'),
      ...rows<{ AvatarID: number; AvatarName: NameReference }>('AvatarConfigLD'),
    ].map((a) => [a.AvatarID, a.AvatarName]),
  )
  const items = new Map(
    rows<{ ID: number; ItemName: NameReference }>('GridFightItems').map((i) => [i.ID, i.ItemName]),
  )
  const rawRoles = rows<RawRole>('GridFightRoleBasicInfo').filter(
    (r) => r.SeasonID === lock.seasonId && r.IsInPool,
  )
  const switches = rows<RawSwitch>('GridFightRoleSwitchConfig')
  const parents = new Map(rawRoles.map((r) => [r.ID, r.ID]))
  function find(id: number): number {
    const parent = parents.get(id)
    if (parent === undefined) throw new Error('Switch references missing role: ' + id)
    return parent === id ? id : find(parent)
  }
  function union(a: number, b: number) {
    const x = find(a),
      y = find(b)
    parents.set(Math.max(x, y), Math.min(x, y))
  }
  for (const a of rawRoles)
    for (const b of rawRoles) if (a.AvatarID === b.AvatarID) union(a.ID, b.ID)
  for (const s of switches) union(s.RoleID, s.BaseRoleID)
  const thresholds = rows<{ TraitID: number; Layer: number }>('GridFightTraitLayer')
  const traits = rows<RawTrait>('GridFightTraitBasicInfo')
    .filter((t) => t.SeasonID === lock.seasonId)
    .map((t) => {
      let type: TraitType
      if (t.TraitType === 'Class') type = 'class'
      else if (t.TraitType === 'Unique') type = 'unique'
      else if (t.TraitType === undefined && lock.campTraitIds.includes(t.ID)) type = 'camp'
      else throw new Error('Unreviewed trait type: ' + t.ID + ' / ' + t.TraitType)
      if (t.ActivationType !== 'GreaterEqualThan') throw new Error('Unsupported activation rule')
      return {
        id: t.ID,
        name: name(t.TraitName),
        type,
        thresholds: [
          ...new Set(thresholds.filter((l) => l.TraitID === t.ID).map((l) => l.Layer)),
        ].sort((a, b) => a - b),
      }
    })
    .sort((a, b) => a.id - b.id)
  const roles: RoleForm[] = rawRoles.map((r) => ({
    id: String(r.ID),
    roleId: r.ID,
    avatarId: r.AvatarID,
    identityId: find(r.ID),
    name: name(avatars.get(r.AvatarID)),
    innateTraits: [...r.TraitList],
    expert: r.IsExpert === 1,
    ...(r.FrontBackType
      ? { position: r.FrontBackType === 'Front' ? ('front' as const) : ('back' as const) }
      : {}),
    ...(r.TraitList.includes(3007) ? { mechanic: 'navigator' as const } : {}),
  }))
  for (const s of switches) {
    const base = roles.find((r) => r.roleId === s.BaseRoleID)!
    const alternate = roles.find((r) => r.roleId === s.RoleID)!
    if (
      s.Condition === 'ByPlacedInBackRegion' &&
      s.BaseRoleID === 8007 &&
      s.RoleID === 8009 &&
      s.ParamList.join() === '2012,2004'
    ) {
      if (base.position !== 'front' || alternate.position !== 'back')
        throw new Error('Unexpected Trailblazer positions')
      base.innateTraits = base.innateTraits.filter((id) => id !== 2012)
      alternate.innateTraits = alternate.innateTraits.filter((id) => id !== 2004)
    } else if (
      s.Condition === 'ByMaxTrait' &&
      s.BaseRoleID === 11011 &&
      s.RoleID === 11012 &&
      s.ParamList.join() === '2006,1005'
    ) {
      base.mechanic = alternate.mechanic = 'bronya'
      base.bronyaSide = 1005
      alternate.bronyaSide = 2006
      roles.push({
        ...base,
        id: base.id + ':tie',
        innateTraits: base.innateTraits.filter((id) => id !== 1005),
        bronyaSide: 'tie',
      })
    } else throw new Error('Unreviewed switch rule: ' + s.RoleID)
  }
  const emblems = rows<RawEquipment>('GridFightEquipment')
    .filter((e) => e.EquipCategory === 'Emblem')
    .map((e) => {
      if (
        !['OriginEmblem', 'ClassEmblem'].includes(e.EquipFunc) ||
        e.DressRule !== 'DressRuleUniqueAndExclusiveTrait' ||
        e.EquipFuncParamList.length !== 1 ||
        e.DressRuleParamList.length !== 1 ||
        e.DressRuleParamList[0] !== e.EquipFuncParamList[0]
      )
        throw new Error('Unreviewed emblem rule: ' + e.ID)
      return { id: e.ID, name: name(items.get(e.ID)), traitId: e.EquipFuncParamList[0]! }
    })
    .sort((a, b) => a.id - b.id)
  const snapshot: Snapshot = {
    schemaVersion: 1,
    traits,
    roles: roles.sort((a, b) => a.id.localeCompare(b.id, 'en')),
    emblems,
    rules: {
      trainTraitId: 1001,
      bronyaTraitIds: [1005, 2006],
      bronyaTie: 'neither',
      allowBronyaNavigatorTarget: false,
    },
  }
  assertSnapshot(snapshot)
  return snapshot
}

export async function loadSnapshot(): Promise<Snapshot> {
  const bytes = await readFile(path.join(dataDirectory, 'snapshot.json'))
  const manifest: unknown = JSON.parse(
    await readFile(path.join(dataDirectory, 'manifest.json'), 'utf8'),
  )
  if (
    !record(manifest) ||
    manifest.commit !== lock.commit ||
    manifest.repository !== lock.repository ||
    manifest.transformVersion !== lock.transformVersion ||
    manifest.gameVersion !== lock.gameVersion ||
    manifest.seasonId !== lock.seasonId ||
    manifest.snapshotSha256 !== digest(bytes)
  )
    throw new Error('Currency-wars snapshot provenance/hash mismatch')
  const snapshot: unknown = JSON.parse(bytes.toString('utf8'))
  assertSnapshot(snapshot)
  return snapshot
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 1 && args[0] === '--check') {
    const snapshot = await loadSnapshot()
    console.log(
      `货币战争快照有效：${snapshot.roles.length} 个形态，${snapshot.traits.length} 种羁绊，${snapshot.emblems.length} 种星徽。`,
    )
    return
  }
  if (args.length !== 2 || args[0] !== '--root')
    throw new Error('Usage: data.ts --root <local-source> | --check')
  const sourceRoot = await realpath(path.resolve(args[1]!))
  const git = (...params: string[]) =>
    execFileSync('git', ['-C', sourceRoot, ...params], { encoding: 'utf8' }).trim()
  if (
    path.resolve(git('rev-parse', '--show-toplevel')).toLowerCase() !== sourceRoot.toLowerCase() ||
    git('rev-parse', 'HEAD') !== lock.commit ||
    git('status', '--porcelain')
  )
    throw new Error('Source must be a clean Git root at locked commit ' + lock.commit)
  const input: Record<string, unknown> = {}
  const inputSha256: Record<string, string> = {}
  for (const file of sourceFiles) {
    const bytes = await readFile(path.join(sourceRoot, file))
    inputSha256[file] = digest(bytes)
    input[file] = parseSource(bytes.toString('utf8'))
  }
  const snapshot = projectSnapshot(input)
  const output = serialize(snapshot)
  const manifest = {
    repository: lock.repository,
    commit: lock.commit,
    gameVersion: lock.gameVersion,
    seasonId: lock.seasonId,
    transformVersion: lock.transformVersion,
    inputSha256,
    snapshotSha256: digest(output),
    counts: {
      sourceRoleConfigs: snapshot.roles.filter((r) => r.bronyaSide !== 'tie').length,
      normalizedForms: snapshot.roles.length,
      identities: new Set(snapshot.roles.map((r) => r.identityId)).size,
      nonExpertIdentities: new Set(snapshot.roles.filter((r) => !r.expert).map((r) => r.identityId))
        .size,
      traits: snapshot.traits.length,
      emblems: snapshot.emblems.length,
    },
    ruleNotes: [
      'Missing TraitType maps to camp only for the reviewed source-lock camp IDs.',
      'Trailblazer front/back innate Class traits are exclusive; emblems may add the other Class.',
      'Navigator copies all Class traits only; its selected target must have the train camp trait.',
      'Bronya ties contribute to neither compared trait; equipment must be legal in either possible form.',
      'Bronya cannot be a navigator target in V1.',
      'Only trait headcounts are modeled, not combat effects, copied equipment or encounter/module modifiers.',
    ],
  }
  await mkdir(dataDirectory, { recursive: true })
  await writeFile(path.join(dataDirectory, 'snapshot.json'), output)
  await writeFile(path.join(dataDirectory, 'manifest.json'), serialize(manifest))
  console.log(JSON.stringify(manifest.counts))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 2
  })
