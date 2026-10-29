import { describe, expect, it } from 'vitest'
import {
  revealComposition,
  revealGeometry,
} from '../../../src/tools/warp-simulator/model/reveal-composition'

describe('Single-reveal composition', () => {
  it.each([1, 2, 3])('keeps a complete light-cone preview inside its frame at DPR %i', (dpr) => {
    for (const [w, h] of [
      [1920, 1080],
      [1440, 900],
      [1024, 768],
      [390, 633],
      [844, 390],
    ]) {
      const g = revealGeometry(
        w!,
        h!,
        348,
        408,
        revealComposition('light-cone:23003', 'light-cone'),
        dpr,
      )!
      expect(g.width / g.height).toBeCloseTo(348 / 408)
      expect(g.width).toBeLessThanOrEqual(348 / dpr)
      expect(g.height).toBeLessThanOrEqual(408 / dpr)
      expect(g.left + g.width / 2).toBeCloseTo(w! / 2)
      expect(g.top + g.height / 2).toBeCloseTo(h! / 2)
      expect(g.left).toBeGreaterThanOrEqual(0)
      expect(g.top).toBeGreaterThanOrEqual(0)
      expect(g.left + g.width).toBeLessThanOrEqual(w!)
      expect(g.top + g.height).toBeLessThanOrEqual(h!)
    }
  })

  it('fits complete character canvases to the viewport without overflow or distortion on every screen shape', () => {
    for (const id of ['avatar:1415', 'avatar:1001', 'avatar:1101', 'avatar:1107'])
      for (const [width, height] of [
        [1920, 1080],
        [1440, 900],
        [1024, 768],
        [390, 633],
        [844, 390],
      ]) {
        for (const [iw, ih] of [
          [2048, 2048],
          [1000, 1600],
          [1600, 1000],
          [768, 768],
        ]) {
          const g = revealGeometry(width!, height!, iw!, ih!, revealComposition(id, 'avatar'))!
          expect(g.left + g.width / 2).toBeCloseTo(width! / 2)
          expect(g.top + g.height / 2).toBeCloseTo(height! / 2)
          expect(g.width / g.height).toBeCloseTo(iw! / ih!)
          expect(g.left).toBeGreaterThanOrEqual(-1e-8)
          expect(g.top).toBeGreaterThanOrEqual(-1e-8)
          expect(g.left + g.width).toBeLessThanOrEqual(width! + 1e-8)
          expect(g.top + g.height).toBeLessThanOrEqual(height! + 1e-8)
          expect(Math.max(g.width / width!, g.height / height!)).toBeCloseTo(1)
        }
      }
  })

  it('uses the fallback source dimensions and adapts the composition to narrow and short frames', () => {
    const cone = revealComposition('light-cone:23003', 'light-cone')
    const fallback = revealGeometry(1920, 1080, 300, 600, cone, 2)!
    expect(fallback.width).toBe(150)
    expect(fallback.height).toBe(300)
    const avatar = revealComposition('avatar:1415', 'avatar')
    const compact = revealGeometry(390, 633, 2048, 2048, avatar)!
    expect(compact.width).toBeCloseTo(390 * avatar.compact.scale)
    expect(compact.left + compact.width / 2).toBe(195)
    const short = revealGeometry(844, 390, 2048, 2048, avatar)!
    expect(short.height).toBe(390 * avatar.short.scale)
    expect(revealGeometry(0, 0, 2048, 2048, avatar)).toBeUndefined()
  })
})
