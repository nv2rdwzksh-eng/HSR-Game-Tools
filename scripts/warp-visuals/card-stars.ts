import sharp from 'sharp'
import { digest } from '../warp-data/files'

export interface StarCrop {
  left: number
  top: number
  width: number
  height: number
}
export interface CardStarSettings {
  method: string
  threshold: number
  contentHeight: number
  padding: number
  quality: number
}

/** Explicit updater only. Threshold zero retains even the faintest alpha glow. */
export async function inspectStarCrop(bytes: Buffer, rarity: number) {
  const original = await sharp(bytes).metadata()
  if (!original.hasAlpha || original.channels !== 4) throw new Error('Star image needs RGBA alpha')
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let left = info.width,
    top = info.height,
    right = -1,
    bottom = -1
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3]! > 0) {
        left = Math.min(left, x)
        top = Math.min(top, y)
        right = Math.max(right, x)
        bottom = Math.max(bottom, y)
      }
    }
  const crop = { left, top, width: right - left + 1, height: bottom - top + 1 }
  if (crop.height <= 0 || crop.width !== rarity * crop.height)
    throw new Error('Invalid star content proportions or empty alpha')
  const trimmed = await sharp(bytes)
    .trim({ threshold: 0 })
    .raw()
    .toBuffer({ resolveWithObject: true })
  if (
    trimmed.info.width !== crop.width ||
    trimmed.info.height !== crop.height ||
    Math.abs(trimmed.info.trimOffsetLeft ?? 0) !== crop.left ||
    Math.abs(trimmed.info.trimOffsetTop ?? 0) !== crop.top
  )
    throw new Error('Star trim would discard visible alpha')
  // Alpha bounds prove all discarded pixels are transparent. Also verify the
  // star cells repeat exactly, so rarity cannot change the individual star scale.
  const tile = Buffer.alloc(crop.height * crop.height * 4)
  for (let y = 0; y < crop.height; y++) {
    const row = trimmed.data.subarray(y * crop.width * 4, (y * crop.width + crop.height) * 4)
    row.copy(tile, y * crop.height * 4)
    for (let index = 1; index < rarity; index++) {
      const other = trimmed.data.subarray(
        (y * crop.width + index * crop.height) * 4,
        (y * crop.width + (index + 1) * crop.height) * 4,
      )
      if (!row.equals(other)) throw new Error('Inconsistent star cells')
    }
  }
  return { crop, starHash: digest(tile) }
}

export function validStarCrop(
  crop: StarCrop | undefined,
  width: number,
  height: number,
  rarity: number,
): crop is StarCrop {
  return (
    !!crop &&
    [3, 4, 5].includes(rarity) &&
    [crop.left, crop.top, crop.width, crop.height].every(Number.isSafeInteger) &&
    crop.left >= 0 &&
    crop.top >= 0 &&
    crop.height > 0 &&
    crop.width === rarity * crop.height &&
    crop.left + crop.width <= width &&
    crop.top + crop.height <= height
  )
}
export function cardStarDimensions(crop: StarCrop, settings: CardStarSettings) {
  const scale = Math.min(1, settings.contentHeight / crop.height)
  return {
    width: Math.round(crop.width * scale) + settings.padding * 2,
    height: Math.round(crop.height * scale) + settings.padding * 2,
  }
}
export function cardStarKey(
  hash: string,
  crop: StarCrop,
  settings: CardStarSettings,
  alphaQuality: number,
) {
  return JSON.stringify({
    sourceSha256: hash,
    recipe: 'card-stars-v1',
    method: settings.method,
    threshold: settings.threshold,
    crop: { left: crop.left, top: crop.top, width: crop.width, height: crop.height },
    contentHeight: settings.contentHeight,
    padding: settings.padding,
    quality: settings.quality,
    alphaQuality,
  })
}
