export function validColor(color: string): boolean {
  return /^#[\da-f]{6}$/i.test(color)
}
function channels(color: string) {
  return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16))
}
function luminance(color: string) {
  const values = channels(color).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722
}
export function contrastRatio(a: string, b: string): number {
  if (!validColor(a) || !validColor(b)) return 0
  const x = luminance(a),
    y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
