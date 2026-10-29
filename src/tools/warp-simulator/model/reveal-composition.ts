/** Image center in the single-reveal frame; scale is relative to an aspect-preserving contain. */
export interface RevealComposition {
  readonly x: number
  readonly y: number
  readonly scale: number
}

export interface RevealCompositionProfile {
  readonly desktop: RevealComposition
  readonly compact: RevealComposition
  readonly short: RevealComposition
}

const avatarComposition: RevealCompositionProfile = {
  desktop: { x: 0.5, y: 0.5, scale: 1 },
  compact: { x: 0.5, y: 0.5, scale: 1 },
  short: { x: 0.5, y: 0.5, scale: 1 },
}
const lightConeComposition: RevealCompositionProfile = {
  desktop: { x: 0.5, y: 0.5, scale: 0.56 },
  compact: { x: 0.5, y: 0.5, scale: 0.82 },
  short: { x: 0.5, y: 0.5, scale: 0.7 },
}

// Full-canvas staging, deliberately independent of character identity and head-focus coordinates.
export function revealComposition(_id: string, kind?: 'avatar' | 'light-cone') {
  return kind === 'light-cone' ? lightConeComposition : avatarComposition
}

/** Uses the active source's dimensions, including the actual lightweight fallback. */
export function revealGeometry(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
  profile: RevealCompositionProfile,
  pixelRatio?: number,
) {
  if (![width, height, imageWidth, imageHeight].every((v) => Number.isFinite(v) && v > 0))
    return undefined
  const composition =
    width <= 640 || width / height < 0.85
      ? profile.compact
      : height <= 480
        ? profile.short
        : profile.desktop
  const requested = Math.min(width / imageWidth, height / imageHeight) * composition.scale
  const dpr = pixelRatio && Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1
  const scale = pixelRatio === undefined ? requested : Math.min(requested, 1 / dpr)
  const renderedWidth = imageWidth * scale
  const renderedHeight = imageHeight * scale
  return {
    width: renderedWidth,
    height: renderedHeight,
    left: width * composition.x - renderedWidth / 2,
    top: height * composition.y - renderedHeight / 2,
  }
}
