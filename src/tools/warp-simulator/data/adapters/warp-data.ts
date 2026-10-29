import snapshot from '../runtime/snapshot.json'
import manifest from '../runtime/manifest.json'
import visuals from '../visuals/catalog.json'
import type { WarpSnapshot } from '../schema'
import type { VisualCatalog, VisualDefinitions } from '../../model/visual-catalog'

export const warpSnapshot = snapshot as WarpSnapshot
export const warpManifest = manifest
export const warpVisuals: VisualCatalog = visuals.items

export const warpVisualDefinitions: VisualDefinitions = visuals
