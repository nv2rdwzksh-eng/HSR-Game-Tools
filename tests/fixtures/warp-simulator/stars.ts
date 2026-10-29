import sharp from 'sharp'

/** Repeated synthetic alpha diamonds, including alpha=1 edge pixels. No game art. */
export async function starFixture(rarity: number, offset = 0) {
  const width = 640 + offset * 2,
    height = 128 + offset * 2
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < rarity * 128; x++) {
      const distance = Math.abs((x % 128) - 63.5) + Math.abs(y - 63.5)
      const index = ((y + offset) * width + x + offset) * 4
      data[index] = 255
      data[index + 1] = 230
      data[index + 2] = 160
      data[index + 3] = distance <= 64 ? (distance >= 60 ? 1 : 255) : 0
    }
  return sharp(data, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer()
}
