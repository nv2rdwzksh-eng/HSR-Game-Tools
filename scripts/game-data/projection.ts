import type {
  CharacterRecord,
  GameSnapshot,
  PresetRecord,
} from '../../src/tools/action-planner/data/schema'
import { safeRelativePath, validateSnapshot } from '../../src/tools/action-planner/data/schema'
import { locales, type Localized } from '../../src/locales/types'

type Index = Record<string, Record<string, unknown>>
export interface SourceLock {
  repository: string
  commit: string
  reviewedCharacterIds: string[]
  transform: { version: number; maxSize: number; quality: number; alphaQuality: number }
}
export interface Overlays {
  schemaVersion: 1
  provenance: unknown
  names: Record<string, Localized<string>>
  aliases: Record<string, CharacterRecord['aliases']>
}
export interface ProjectionInput {
  gameVersion: string
  characters: Localized<unknown>
  promotions: Localized<unknown>
  relicSets: Localized<unknown>
  lightCones: Localized<unknown>
}
export interface AssetRequest {
  key: string
  sourcePath: string
  outputPath: string
}
const record = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
function index(value: unknown): Index {
  if (!record(value) || !Object.entries(value).every(([id, row]) => record(row) && row.id === id))
    throw new Error('Unsupported upstream index identity')
  return value as Index
}
export function projectGameData(input: ProjectionInput, lock: SourceLock, overlays: Overlays) {
  if (overlays.schemaVersion !== 1) throw new Error('Unsupported overlays')
  const characters = { 'zh-CN': index(input.characters['zh-CN']), en: index(input.characters.en) }
  const promotions = { 'zh-CN': index(input.promotions['zh-CN']), en: index(input.promotions.en) }
  const sets = { 'zh-CN': index(input.relicSets['zh-CN']), en: index(input.relicSets.en) }
  const cones = { 'zh-CN': index(input.lightCones['zh-CN']), en: index(input.lightCones.en) }
  const ids = Object.keys(characters['zh-CN']).sort()
  if (
    JSON.stringify(ids) !== JSON.stringify(Object.keys(characters.en).sort()) ||
    JSON.stringify(ids) !== JSON.stringify([...lock.reviewedCharacterIds].sort())
  )
    throw new Error('Character inventory changed; review source lock before updating')
  const diagnostics: { code: string; id?: string }[] = []
  const requests: AssetRequest[] = []
  function names(id: string, rows: Localized<Record<string, unknown>>): Localized<string> {
    return Object.fromEntries(
      locales.map((locale) => {
        const name = overlays.names[id]?.[locale] ?? rows[locale].name
        if (typeof name !== 'string' || !name.trim()) {
          diagnostics.push({ code: 'missing-name', id })
          return [locale, 'ID ' + id]
        }
        if (/[{}<>]/u.test(name)) throw new Error('Unresolved or unsafe name ' + id)
        return [locale, name]
      }),
    ) as Localized<string>
  }
  function icon(key: string, id: string, rows: Localized<Record<string, unknown>>, folder: string) {
    const sourcePath = rows['zh-CN'].icon
    if (sourcePath !== rows.en.icon) throw new Error('Locale asset mismatch ' + id)
    if (sourcePath === undefined) {
      diagnostics.push({ code: 'missing-icon-path', id })
      return undefined
    }
    if (
      typeof sourcePath !== 'string' ||
      !safeRelativePath(sourcePath) ||
      !sourcePath.startsWith('icon/' + folder + '/')
    )
      throw new Error('Unsafe source asset path ' + id)
    requests.push({ key, sourcePath, outputPath: 'game-assets/' + folder + '/' + id + '.webp' })
    return key
  }
  function speed(id: string): number | undefined {
    const localized: (number | undefined)[] = locales.map((locale) => {
      const values = promotions[locale][id]?.values
      if (!Array.isArray(values) || values.length === 0) return undefined
      const first = values[0]
      if (!record(first) || !record(first.spd)) return undefined
      const base = first.spd.base
      if (
        typeof base !== 'number' ||
        !Number.isFinite(base) ||
        base <= 0 ||
        !values.every((v) => record(v) && record(v.spd) && v.spd.base === base && v.spd.step === 0)
      )
        return undefined
      return base
    })
    if (localized[0] !== localized[1]) throw new Error('Locale speed mismatch ' + id)
    if (localized[0] === undefined) diagnostics.push({ code: 'missing-or-variable-speed', id })
    return localized[0]
  }
  const records: CharacterRecord[] = ids.map((id) => {
    const rows = { 'zh-CN': characters['zh-CN'][id], en: characters.en[id] }
    const pathCode = rows['zh-CN'].path
    if (typeof pathCode !== 'string' || pathCode !== rows.en.path)
      throw new Error('Invalid path ' + id)
    const tag = rows['zh-CN'].tag
    const gender =
      typeof tag === 'string' && tag.startsWith('playerboy')
        ? ('male' as const)
        : typeof tag === 'string' && tag.startsWith('playergirl')
          ? ('female' as const)
          : undefined
    return {
      id,
      names: names(id, rows),
      baseSpeed: speed(id),
      assetKey: icon('character:' + id, id, rows, 'character'),
      aliases: overlays.aliases[id] ?? {
        'zh-CN': { official: [], player: [] },
        en: { official: [], player: [] },
      },
      form: { pathCode, ...(gender ? { gender } : {}) },
    }
  })
  const presets: PresetRecord[] = (
    [
      { id: '308', kind: 'vonwacq', source: sets, folder: 'relic' },
      { id: '110', kind: 'eagle', source: sets, folder: 'relic' },
      { id: '21018', kind: 'dance', source: cones, folder: 'light_cone' },
    ] as const
  ).map((spec) => {
    const rows = { 'zh-CN': spec.source['zh-CN'][spec.id], en: spec.source.en[spec.id] }
    if (!rows['zh-CN'] || !rows.en) throw new Error('Missing preset ' + spec.id)
    return {
      id: spec.id,
      kind: spec.kind,
      names: names(spec.id, rows),
      assetKey: icon('preset:' + spec.kind, spec.id, rows, spec.folder),
    }
  })
  const snapshot: GameSnapshot = {
    schemaVersion: 1,
    gameVersion: input.gameVersion,
    characters: records,
    presets,
    assets: {},
  }
  return { snapshot, requests, diagnostics }
}
export function finalizeProjection(snapshot: GameSnapshot, missingKeys: ReadonlySet<string>) {
  for (const row of [...snapshot.characters, ...snapshot.presets])
    if (row.assetKey && missingKeys.has(row.assetKey)) delete row.assetKey
  validateSnapshot(snapshot)
}
