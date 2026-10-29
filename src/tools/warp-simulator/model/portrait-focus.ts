import configuration from '../data/portrait-focus.json'

export interface PortraitFocus {
  readonly x: number
  readonly y: number
  readonly scale: number
}

export interface PortraitFocusConfig {
  readonly default: PortraitFocus
  readonly overrides: Readonly<Record<string, PortraitFocus>>
  readonly overviewOverrides: Readonly<Record<string, Partial<PortraitFocus>>>
}
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
export function validPortraitFocus(value: unknown): value is PortraitFocus {
  if (!record(value)) return false
  return (
    [value.x, value.y, value.scale].every(Number.isFinite) &&
    Number(value.x) >= 0 &&
    Number(value.x) <= 1 &&
    Number(value.y) >= 0 &&
    Number(value.y) <= 1 &&
    Number(value.scale) >= 0.1 &&
    Number(value.scale) <= 8
  )
}
export function assertPortraitFocusConfig(value: unknown): asserts value is PortraitFocusConfig {
  if (
    !record(value) ||
    !validPortraitFocus(value.default) ||
    !record(value.overrides) ||
    !record(value.overviewOverrides)
  )
    throw new Error('Invalid portrait focus configuration')
  for (const [id, focus] of Object.entries(value.overrides))
    if (!/^avatar:\d+$/.test(id) || !validPortraitFocus(focus))
      throw new Error('Invalid portrait focus override: ' + id)
  for (const [id, delta] of Object.entries(value.overviewOverrides)) {
    if (
      !/^avatar:\d+$/.test(id) ||
      !record(delta) ||
      Object.keys(delta).some((key) => !['x', 'y', 'scale'].includes(key)) ||
      !validPortraitFocus({
        ...((value.overrides[id] as PortraitFocus) ?? value.default),
        ...delta,
      })
    )
      throw new Error('Invalid portrait overview focus: ' + id)
  }
}
/** Strict validation is also used by tests/export. Runtime keeps cards usable after bad manual edits. */
export function readPortraitFocusConfig(
  value: unknown,
  report: (error: Error) => void = console.error,
): PortraitFocusConfig {
  try {
    assertPortraitFocusConfig(value)
    return value
  } catch (error) {
    report(error instanceof Error ? error : new Error('Invalid portrait focus configuration'))
    return {
      default:
        record(value) && validPortraitFocus(value.default)
          ? value.default
          : { x: 0.5, y: 0.3, scale: 2 },
      overrides: {},
      overviewOverrides: {},
    }
  }
}
export const portraitFocusConfig = readPortraitFocusConfig(configuration)
export const defaultPortraitFocus: PortraitFocus = Object.freeze(portraitFocusConfig.default)

// Coordinates refer to the complete source canvas, never alpha bounds.
export function resolvePortraitFocus(
  config: PortraitFocusConfig,
  id: string,
  overview = false,
): PortraitFocus {
  const base = config.overrides[id] ?? config.default
  const focus =
    overview && config.overviewOverrides[id] ? { ...base, ...config.overviewOverrides[id] } : base
  return validPortraitFocus(focus) ? focus : config.default
}
export function resultPortraitFocus(id: string): PortraitFocus {
  return resolvePortraitFocus(portraitFocusConfig, id, true)
}
/** Unrotated image geometry. The card's outer transform never participates here. */
export function portraitGeometry(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  focus: PortraitFocus,
) {
  if (![width, height, imageWidth, imageHeight].every((v) => Number.isFinite(v) && v > 0))
    return undefined
  const f = validPortraitFocus(focus) ? focus : defaultPortraitFocus
  const k = Math.max(width / imageWidth, height / imageHeight) * f.scale
  return {
    width: imageWidth * k,
    height: imageHeight * k,
    left: width / 2 - k * imageWidth * f.x,
    top: height / 2 - k * imageHeight * f.y,
  }
}
