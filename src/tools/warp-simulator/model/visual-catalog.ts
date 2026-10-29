import type { ToolLocale } from '../../../locales/types'
import type { WarpSnapshot } from '../data/schema'

export interface VisualImage {
  readonly path: string
  readonly width: number
  readonly height: number
}
export interface VisualMetadata {
  readonly path?: string
  readonly element?: string
  readonly portraitPath?: string
  readonly artworkPath?: string
  readonly revealArtwork?: VisualImage
  readonly resultPortrait?: VisualImage
  readonly lightConePreview?: VisualImage
}
export type VisualCatalog = Readonly<Record<string, VisualMetadata>>
export interface VisualDefinition {
  readonly names: Readonly<Record<ToolLocale, string>>
  readonly iconPath?: string
  readonly revealIcon?: VisualImage
}
export interface VisualDefinitions {
  readonly paths: Readonly<Record<string, VisualDefinition>>
  readonly elements: Readonly<Record<string, VisualDefinition & { readonly color: string }>>
  readonly stars: Readonly<Partial<Record<3 | 4 | 5, string>>>
  readonly revealStars?: Readonly<Partial<Record<3 | 4 | 5, VisualImage>>>
  readonly revealStarBig?: VisualImage
  readonly cardStars?: Readonly<Partial<Record<3 | 4 | 5, VisualImage>>>
}
export interface WarpVisualCatalog extends VisualDefinitions {
  readonly schemaVersion: 1
  readonly items: VisualCatalog
}
export const emptyDefinitions: VisualDefinitions = { paths: {}, elements: {}, stars: {} }
export function safeAssetPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.startsWith('game-assets/') &&
    value.endsWith('.webp') &&
    !/[\\:?#%]/.test(value) &&
    value.split('/').every((part) => !!part && part !== '.' && part !== '..')
  )
}
export function visualAssetPaths(catalog: WarpVisualCatalog): string[] {
  return [
    ...new Set(
      [
        ...Object.values(catalog.items).flatMap((item) => [
          item.portraitPath,
          item.artworkPath,
          item.revealArtwork?.path,
          item.resultPortrait?.path,
          item.lightConePreview?.path,
        ]),
        ...Object.values(catalog.paths).flatMap((row) => [row.iconPath, row.revealIcon?.path]),
        ...Object.values(catalog.elements).map((row) => row.iconPath),
        ...Object.values(catalog.stars),
        ...Object.values(catalog.revealStars ?? {}).map((row) => row?.path),
        catalog.revealStarBig?.path,
        ...Object.values(catalog.cardStars ?? {}).map((row) => row?.path),
      ].filter((value): value is string => value !== undefined),
    ),
  ].sort()
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
function assertImage(value: unknown, kind = 'reveal') {
  if (
    !record(value) ||
    !safeAssetPath(value.path) ||
    !Number.isSafeInteger(value.width) ||
    Number(value.width) <= 0 ||
    !Number.isSafeInteger(value.height) ||
    Number(value.height) <= 0
  )
    throw new Error(`Invalid ${kind} image path/dimensions`)
}
/** Checks only the tool-owned projection; never reads upstream data. */
export function assertVisualCatalog(
  value: unknown,
  snapshot: WarpSnapshot,
): asserts value is WarpVisualCatalog {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !record(value.items) ||
    !record(value.paths) ||
    !record(value.elements) ||
    !record(value.stars)
  )
    throw new Error('Invalid Warp visual catalog')
  if (
    JSON.stringify(Object.keys(value.items).sort()) !==
    JSON.stringify(snapshot.items.map((item) => item.id).sort())
  )
    throw new Error('Warp visual item inventory mismatch')
  for (const [group, definitions] of [
    ['paths', value.paths],
    ['elements', value.elements],
  ] as const) {
    for (const definition of Object.values(definitions)) {
      if (
        !record(definition) ||
        !record(definition.names) ||
        !['zh-CN', 'en'].every(
          (locale) =>
            typeof (definition.names as Record<string, unknown>)[locale] === 'string' &&
            !!(definition.names as Record<string, string>)[locale]?.trim(),
        )
      )
        throw new Error('Invalid localized visual definition')
      if (definition.iconPath !== undefined && !safeAssetPath(definition.iconPath))
        throw new Error('Unsafe icon path')
      if (definition.revealIcon !== undefined) {
        if (group !== 'paths') throw new Error('Unexpected element reveal icon')
        assertImage(definition.revealIcon)
      }
      if (
        group === 'elements' &&
        (typeof definition.color !== 'string' || !/^#[\da-f]{6}$/i.test(definition.color))
      )
        throw new Error('Invalid element color')
    }
  }
  for (const item of snapshot.items) {
    const row = value.items[item.id]
    if (
      !record(row) ||
      (row.path !== undefined &&
        (typeof row.path !== 'string' || !Object.hasOwn(value.paths, row.path))) ||
      (row.element !== undefined &&
        (item.kind !== 'avatar' ||
          typeof row.element !== 'string' ||
          !Object.hasOwn(value.elements, row.element)))
    )
      throw new Error('Invalid item visual mapping: ' + item.id)
    for (const field of ['portraitPath', 'artworkPath'])
      if (row[field] !== undefined && !safeAssetPath(row[field]))
        throw new Error('Unsafe item image path')
    if (row.revealArtwork !== undefined) assertImage(row.revealArtwork)
    if (row.resultPortrait !== undefined) {
      if (item.kind !== 'avatar') throw new Error('Unexpected light cone result portrait')
      assertImage(row.resultPortrait, 'result portrait')
    }
    if (row.lightConePreview !== undefined) {
      if (item.kind !== 'light-cone') throw new Error('Unexpected avatar light cone preview')
      assertImage(row.lightConePreview, 'light cone preview')
    }
  }
  for (const [rarity, file] of Object.entries(value.stars))
    if (!['3', '4', '5'].includes(rarity) || !safeAssetPath(file))
      throw new Error('Invalid rarity image')
  if (value.revealStars !== undefined) {
    if (!record(value.revealStars)) throw new Error('Invalid reveal rarity mapping')
    for (const [rarity, image] of Object.entries(value.revealStars)) {
      if (rarity !== '5') throw new Error('Unexpected reveal rarity image')
      assertImage(image)
    }
  }
  if (value.cardStars !== undefined) {
    if (!record(value.cardStars)) throw new Error('Invalid card star mapping')
    for (const [rarity, image] of Object.entries(value.cardStars)) {
      if (!['3', '4', '5'].includes(rarity)) throw new Error('Unexpected card rarity image')
      assertImage(image, 'card star')
    }
  }
  if (value.revealStarBig !== undefined) assertImage(value.revealStarBig, 'identity star')
}
