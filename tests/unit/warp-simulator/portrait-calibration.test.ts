import { describe, expect, it } from 'vitest'
import {
  assertPortraitFocusConfig,
  portraitFocusConfig,
  defaultPortraitFocus,
  validPortraitFocus,
  portraitGeometry,
  resolvePortraitFocus,
  readPortraitFocusConfig,
  type PortraitFocusConfig,
} from '../../../src/tools/warp-simulator/model/portrait-focus'
import {
  createPortraitCalibration,
  portraitPoint,
} from '../../manual/warp-results/portrait-calibration'

const fixture: PortraitFocusConfig = {
  default: { x: 0.45, y: 0.25, scale: 1.5 },
  overrides: {
    'avatar:900001': { x: 0.3, y: 0.4, scale: 2.5 },
    'avatar:900002': { x: 0.6, y: 0.2, scale: 2 },
  },
  overviewOverrides: {
    'avatar:900001': { scale: 3 },
    'avatar:900003': { x: 0.7 },
  },
}

describe('Portrait configuration and development calibration', () => {
  it('validates the maintained production configuration without pinning calibration values or counts', () => {
    expect(() => assertPortraitFocusConfig(portraitFocusConfig)).not.toThrow()
  })
  it('merges sparse overview fields over character overrides or defaults and leaves the base unchanged', () => {
    expect(resolvePortraitFocus(fixture, 'avatar:900001', true)).toEqual({
      x: 0.3,
      y: 0.4,
      scale: 3,
    })
    expect(resolvePortraitFocus(fixture, 'avatar:900001')).toEqual(
      fixture.overrides['avatar:900001'],
    )
    expect(resolvePortraitFocus(fixture, 'avatar:900003', true)).toEqual({
      x: 0.7,
      y: 0.25,
      scale: 1.5,
    })
    expect(resolvePortraitFocus(fixture, 'avatar:999999', true)).toEqual(fixture.default)
  })
  it.each([
    null,
    {},
    { x: NaN, y: 0, scale: 1 },
    { x: 0.5, y: -1, scale: 2 },
    { x: '0.5', y: 0.5, scale: 2 },
    { x: 0.5, y: 0.5, scale: 0.09 },
    { x: 0.5, y: 0.5, scale: 8.01 },
  ])('rejects invalid focus %j', (value) => {
    expect(validPortraitFocus(value)).toBe(false)
    expect(() =>
      assertPortraitFocusConfig({ ...fixture, overrides: { 'avatar:900001': value } }),
    ).toThrow(/override/)
  })
  it('checks overview deltas and safely falls back for an invalid runtime focus', () => {
    expect(() =>
      assertPortraitFocusConfig({
        ...fixture,
        overviewOverrides: { 'avatar:900001': { scale: Infinity } },
      }),
    ).toThrow(/overview/)
    const fallback = portraitGeometry(360, 180, 2048, 2048, { x: -1, y: 0, scale: 99 })!
    const d = defaultPortraitFocus
    expect(fallback.left + fallback.width * d.x).toBe(180)
    expect(fallback.top + fallback.height * d.y).toBe(90)
    const errors: Error[] = []
    const recovered = readPortraitFocusConfig({ ...fixture, overrides: null }, (error) =>
      errors.push(error),
    )
    expect(errors).toHaveLength(1)
    expect(recovered.default).toEqual(fixture.default)
    expect(resolvePortraitFocus(recovered, 'avatar:900001')).toEqual(recovered.default)
  })
  it('maps the actual image rectangle, ignores letterbox clicks and clamps active drags', () => {
    const box = { left: 20, top: 30, width: 600, height: 300 }
    expect(portraitPoint(320, 180, box, 2048, 2048)).toEqual({ x: 0.5, y: 0.5 })
    expect(portraitPoint(20, 180, box, 2048, 2048)).toBeUndefined()
    expect(portraitPoint(20, 500, box, 2048, 2048, true)).toEqual({ x: 0, y: 1 })
    expect(portraitPoint(320, 30, box, 2048, 1024)).toEqual({ x: 0.5, y: 0 })
    expect(portraitPoint(320, 180, { ...box, height: 0 }, 2048, 2048)).toBeUndefined()
  })
  it('keeps per-character and per-profile drafts, supports reset/restore and exports every configuration', () => {
    const original = structuredClone(fixture)
    const c = createPortraitCalibration(fixture)
    c.selected.value = 'avatar:900001'
    c.setFocus({ x: 0.4, y: 0.6, scale: 3 })
    expect(c.modified.value).toBe(true)
    c.selected.value = 'avatar:900002'
    c.setFocus({ x: 0.2, y: 0.3, scale: 2 })
    c.selected.value = 'avatar:900001'
    expect(c.focus.value).toEqual({ x: 0.4, y: 0.6, scale: 3 })
    c.profile.value = 'default'
    expect(c.focus.value).toEqual(original.overrides['avatar:900001'])
    c.profile.value = 'overview'
    expect(c.setFocus({ x: 1.1, y: 0.5, scale: 3 })).toBe(false)
    const exported = c.exportJson()
    const parsed: unknown = JSON.parse(exported)
    assertPortraitFocusConfig(parsed)
    expect(resolvePortraitFocus(parsed, 'avatar:900002', true)).toEqual({
      x: 0.2,
      y: 0.3,
      scale: 2,
    })
    expect(parsed.overrides).toEqual(original.overrides)
    expect(Object.keys(parsed.overrides)).toEqual(Object.keys(parsed.overrides).sort())
    expect(Object.keys(parsed.default)).toEqual(['x', 'y', 'scale'])
    expect(c.exportJson()).toBe(exported)
    c.reset()
    expect(c.focus.value).toEqual(original.default)
    c.restore()
    expect(c.focus.value).toEqual(resolvePortraitFocus(original, 'avatar:900001', true))
    expect(c.modified.value).toBe(false)
    expect(fixture).toEqual(original)
  })
  it.each([fixture.default, ...Object.values(fixture.overrides)])(
    'maps the head to the unrotated full card center while retaining aspect ratio: %j',
    (f) => {
      for (const [width, height] of [
        [360, 180],
        [620, 310],
      ]) {
        const g = portraitGeometry(width!, height!, 4096, 3072, f)!
        expect(g.left + g.width * f.x).toBeCloseTo(width! / 2)
        expect(g.top + g.height * f.y).toBeCloseTo(height! / 2)
        expect(g.width / g.height).toBeCloseTo(4096 / 3072)
        expect(Object.keys(g).sort()).toEqual(['height', 'left', 'top', 'width'])
      }
    },
  )
  it('keeps equivalent source canvases aligned and rejects unavailable frame dimensions', () => {
    const focus = fixture.overrides['avatar:900001']!
    expect(portraitGeometry(360, 180, 2048, 2048, focus)).toEqual(
      portraitGeometry(360, 180, 768, 768, focus),
    )
    expect(portraitGeometry(0, 180, 2048, 2048, focus)).toBeUndefined()
    expect(portraitGeometry(360, 180, NaN, 2048, focus)).toBeUndefined()
  })
})
