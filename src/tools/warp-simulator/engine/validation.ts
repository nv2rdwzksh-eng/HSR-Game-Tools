import type { DiagnosticCode, WarpDiagnostic, WarpResult } from './types'

export const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
export const isIdentity = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0

class WarpFault extends Error {
  constructor(readonly diagnostic: WarpDiagnostic) {
    super(diagnostic.code)
  }
}
export function requireInput(
  condition: unknown,
  code: DiagnosticCode,
  path: string,
  params: WarpDiagnostic['params'] = {},
): asserts condition {
  if (!condition) throw new WarpFault({ code, path, params })
}
/** Only expected input/RNG failures are converted; programming errors remain visible. */
export function attempt<T>(action: () => T): WarpResult<T> {
  try {
    return { ok: true, value: action() }
  } catch (error) {
    if (error instanceof WarpFault) return { ok: false, diagnostic: error.diagnostic }
    throw error
  }
}
