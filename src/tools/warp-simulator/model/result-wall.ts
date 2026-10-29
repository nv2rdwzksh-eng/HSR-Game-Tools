export const wallCard = { width: 360, height: 180, angle: -12 } as const
export const wallLayout = {
  counts: [3, 4, 3],
  offsets: [-40, 0, 40],
  gap: 16,
  rowStep: 212,
  padding: 48,
} as const

function createResultWall() {
  const angle = wallCard.angle
  const radians = (angle * Math.PI) / 180
  const cos = Math.cos(radians),
    sin = Math.sin(radians)
  const rows = wallLayout.counts.map((count, row) => ({
    count,
    start: wallLayout.counts.slice(0, row).reduce((sum, count) => sum + count, 0),
    x: wallLayout.offsets[row]!,
    y: row * wallLayout.rowStep,
    width: count * wallCard.width + (count - 1) * wallLayout.gap,
    zIndex: row + 1,
  }))
  // Bounds follow the same complete-row transform used by the renderer.
  const corners = rows.flatMap((row) =>
    [-1, 1].flatMap((sx) =>
      [-1, 1].map((sy) => ({
        x: row.x + (sx * row.width * cos) / 2 - (sy * wallCard.height * sin) / 2,
        y: row.y + (sx * row.width * sin) / 2 + (sy * wallCard.height * cos) / 2,
      })),
    ),
  )
  const minX = Math.min(...corners.map((c) => c.x)) - wallLayout.padding
  const minY = Math.min(...corners.map((c) => c.y)) - wallLayout.padding
  return {
    angle,
    width: Math.max(...corners.map((c) => c.x)) + wallLayout.padding - minX,
    height: Math.max(...corners.map((c) => c.y)) + wallLayout.padding - minY,
    rows: rows.map((row) => ({
      ...row,
      left: row.x - minX - row.width / 2,
      top: row.y - minY - wallCard.height / 2,
    })),
    slots: rows.flatMap((row, rowIndex) =>
      Array.from({ length: row.count }, (_, column) => {
        const offset = (column - (row.count - 1) / 2) * (wallCard.width + wallLayout.gap)
        return {
          index: row.start + column,
          row: rowIndex,
          column,
          centerX: row.x - minX + offset * cos,
          centerY: row.y - minY + offset * sin,
          rotatedWidth: cos * wallCard.width - sin * wallCard.height,
          rotatedHeight: -sin * wallCard.width + cos * wallCard.height,
          zIndex: row.start + column + 1,
        }
      }),
    ),
  }
}
export const resultWall = createResultWall()
export function fitResultWall(width: number, height: number, wall = resultWall) {
  if (![width, height].every((v) => Number.isFinite(v) && v > 0)) return 0
  return Math.min(width / wall.width, height / wall.height)
}
