import { describe, expect, it } from 'vitest'
import {
  resultWall,
  fitResultWall,
  wallCard,
  wallLayout,
} from '../../../src/tools/warp-simulator/model/result-wall'

describe('Complete ordered 3–4–3 wall geometry', () => {
  it('groups ten ordered slots into three parallel rows with non-overlapping card edges', () => {
    expect(resultWall.rows.map((row) => row.count)).toEqual([3, 4, 3])
    expect(resultWall.rows.map((row) => row.start)).toEqual([0, 3, 7])
    expect(resultWall.slots.map((slot) => slot.index)).toEqual(
      Array.from({ length: 10 }, (_, i) => i),
    )
    const radians = (wallCard.angle * Math.PI) / 180
    for (const row of resultWall.rows) {
      const slots = resultWall.slots.slice(row.start, row.start + row.count)
      expect(row.width).toBe(row.count * wallCard.width + (row.count - 1) * wallLayout.gap)
      for (let i = 1; i < slots.length; i++) {
        const dx = slots[i]!.centerX - slots[i - 1]!.centerX
        const dy = slots[i]!.centerY - slots[i - 1]!.centerY
        expect(dy / dx).toBeCloseTo(Math.tan(radians))
        expect(Math.hypot(dx, dy) - wallCard.width).toBeCloseTo(wallLayout.gap)
      }
    }
    for (let i = 1; i < resultWall.rows.length; i++) {
      const a = resultWall.rows[i - 1]!,
        b = resultWall.rows[i]!
      const normalDistance = -(b.x - a.x) * Math.sin(radians) + (b.y - a.y) * Math.cos(radians)
      expect(normalDistance).toBeGreaterThan(wallCard.height + wallLayout.gap)
    }
  })
  it.each([resultWall])('keeps every card and its glow inside the fitted viewport', (wall) => {
    expect(wall.slots).toHaveLength(10)
    expect(wallCard.width / wallCard.height).toBe(2)
    for (const [width, height] of [
      [1872, 980],
      [1552, 800],
      [1318, 668],
      [1232, 580],
      [2512, 960],
    ]) {
      const scale = fitResultWall(width!, height!, wall)
      expect(scale).toBeGreaterThan(0)
      wall.slots.forEach((slot, index) => {
        expect(slot.zIndex).toBe(index + 1)
        expect(
          (slot.centerX - slot.rotatedWidth / 2 - wallLayout.padding) * scale,
        ).toBeGreaterThanOrEqual(-1e-8)
        expect(
          (slot.centerY - slot.rotatedHeight / 2 - wallLayout.padding) * scale,
        ).toBeGreaterThanOrEqual(-1e-8)
        expect(
          (slot.centerX + slot.rotatedWidth / 2 + wallLayout.padding) * scale,
        ).toBeLessThanOrEqual(width! + 1e-8)
        expect(
          (slot.centerY + slot.rotatedHeight / 2 + wallLayout.padding) * scale,
        ).toBeLessThanOrEqual(height! + 1e-8)
      })
    }
  })
  it('fills larger viewports without the old scale cap and rejects unavailable sizes', () => {
    expect(fitResultWall(1872, 980)).toBeGreaterThan(1)
    for (const [w, h] of [
      [0, 10],
      [10, 0],
      [-1, 100],
      [NaN, 100],
      [100, Infinity],
    ])
      expect(fitResultWall(w!, h!)).toBe(0)
  })
})
