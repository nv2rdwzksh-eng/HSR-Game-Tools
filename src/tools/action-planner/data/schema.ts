import { locales, type Localized } from '../../../locales/types'

export interface CharacterRecord {
  id: string
  names: Localized<string>
  baseSpeed?: number
  assetKey?: string
  aliases: Localized<{ official: string[]; player: string[] }>
  form: { pathCode: string; gender?: 'male' | 'female' }
}
export interface PresetRecord {
  id: string
  kind: 'vonwacq' | 'eagle' | 'dance'
  names: Localized<string>
  assetKey?: string
}
export interface AssetRecord {
  path: string
  width: number
  height: number
}
export interface GameSnapshot {
  schemaVersion: 1
  gameVersion: string
  characters: CharacterRecord[]
  presets: PresetRecord[]
  assets: Record<string, AssetRecord>
}
export interface GameManifest {
  schemaVersion: 1
  gameVersion: string
  source: { repository: string; commit: string }
  generatedAt: string
  transform: {
    version: number
    maxSize: number
    quality: number
    alphaQuality: number
    sharpVersion: string
  }
  overlaySha256: string
  files: Record<string, { sha256: string; bytes: number }>
  missingAssets: { key: string; sourcePath: string }[]
  diagnostics: { code: string; id?: string }[]
}
const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
export function safeRelativePath(value: string): boolean {
  return (
    !value.includes('\\') &&
    !value.includes(':') &&
    !value.startsWith('/') &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  )
}
export function validateSnapshot(value: unknown): asserts value is GameSnapshot {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !text(value.gameVersion) ||
    !Array.isArray(value.characters) ||
    !Array.isArray(value.presets) ||
    !object(value.assets)
  )
    throw new Error('Unsupported game snapshot')
  const ids = new Set<string>()
  for (const row of value.characters) {
    if (
      !object(row) ||
      !text(row.id) ||
      ids.has(row.id) ||
      !object(row.names) ||
      !object(row.aliases) ||
      !object(row.form) ||
      !text(row.form.pathCode) ||
      (row.form.gender !== undefined && row.form.gender !== 'male' && row.form.gender !== 'female')
    )
      throw new Error('Invalid character identity or form')
    ids.add(row.id)
    if (
      row.baseSpeed !== undefined &&
      (typeof row.baseSpeed !== 'number' || !Number.isFinite(row.baseSpeed) || row.baseSpeed <= 0)
    )
      throw new Error('Invalid base speed')
    for (const locale of locales) {
      const aliases = row.aliases[locale]
      if (
        !text(row.names[locale]) ||
        /\{[^}]+\}/u.test(row.names[locale] as string) ||
        !object(aliases) ||
        !Array.isArray(aliases.official) ||
        !aliases.official.every(text) ||
        !Array.isArray(aliases.player) ||
        !aliases.player.every(text)
      )
        throw new Error('Invalid localized character')
    }
    if (
      row.assetKey !== undefined &&
      (!text(row.assetKey) || !Object.hasOwn(value.assets, row.assetKey))
    )
      throw new Error('Missing character asset mapping')
  }
  const kinds = new Set<string>()
  for (const row of value.presets) {
    const names = object(row) ? row.names : undefined
    if (
      !object(row) ||
      !text(row.id) ||
      !['vonwacq', 'eagle', 'dance'].includes(String(row.kind)) ||
      kinds.has(String(row.kind)) ||
      !object(names) ||
      !locales.every((l) => text(names[l]))
    )
      throw new Error('Invalid preset metadata')
    kinds.add(String(row.kind))
    if (
      row.assetKey !== undefined &&
      (!text(row.assetKey) || !Object.hasOwn(value.assets, row.assetKey))
    )
      throw new Error('Missing preset asset mapping')
  }
  if (kinds.size !== 3) throw new Error('Incomplete preset metadata')
  const paths = new Set<string>()
  for (const asset of Object.values(value.assets)) {
    if (
      !object(asset) ||
      !text(asset.path) ||
      !safeRelativePath(asset.path) ||
      !asset.path.startsWith('game-assets/') ||
      paths.has(asset.path) ||
      !Number.isSafeInteger(asset.width) ||
      Number(asset.width) <= 0 ||
      !Number.isSafeInteger(asset.height) ||
      Number(asset.height) <= 0
    )
      throw new Error('Invalid asset mapping')
    paths.add(asset.path)
  }
}
export function validateManifest(value: unknown): asserts value is GameManifest {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !text(value.gameVersion) ||
    !object(value.source) ||
    !text(value.source.repository) ||
    typeof value.source.commit !== 'string' ||
    !/^[a-f0-9]{40}$/.test(value.source.commit) ||
    !text(value.generatedAt) ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    typeof value.overlaySha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.overlaySha256) ||
    !object(value.transform) ||
    !Number.isSafeInteger(value.transform.version) ||
    Number(value.transform.version) < 1 ||
    !Number.isSafeInteger(value.transform.maxSize) ||
    Number(value.transform.maxSize) < 1 ||
    !Number.isInteger(value.transform.quality) ||
    Number(value.transform.quality) < 1 ||
    Number(value.transform.quality) > 100 ||
    !Number.isInteger(value.transform.alphaQuality) ||
    Number(value.transform.alphaQuality) < 1 ||
    Number(value.transform.alphaQuality) > 100 ||
    !text(value.transform.sharpVersion) ||
    !object(value.files) ||
    !Array.isArray(value.missingAssets) ||
    !Array.isArray(value.diagnostics)
  )
    throw new Error('Invalid game manifest')
  for (const meta of Object.values(value.files))
    if (
      !object(meta) ||
      typeof meta.sha256 !== 'string' ||
      !/^[a-f0-9]{64}$/.test(meta.sha256) ||
      !Number.isSafeInteger(meta.bytes) ||
      Number(meta.bytes) < 0
    )
      throw new Error('Invalid manifest checksum')
  for (const missing of value.missingAssets)
    if (
      !object(missing) ||
      !text(missing.key) ||
      !text(missing.sourcePath) ||
      !safeRelativePath(missing.sourcePath)
    )
      throw new Error('Invalid missing asset diagnostic')
  for (const diagnostic of value.diagnostics)
    if (
      !object(diagnostic) ||
      !text(diagnostic.code) ||
      (diagnostic.id !== undefined && !text(diagnostic.id))
    )
      throw new Error('Invalid data diagnostic')
}
