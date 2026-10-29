import loadHighs from 'highs'
import wasmUrl from 'highs/runtime?url'
import { createHighsSolver } from '../solve'

// Vite emits a hashed local asset. No CDN, raw-source parsing or Node filesystem access.
export const browserSolver = createHighsSolver(() => loadHighs({ locateFile: () => wasmUrl }))
