import {
  emptyDocument,
  parsePlannerDocument,
  serializePlannerDocument,
  PlannerFileError,
} from './document-file'
import type { PlannerDocument } from './editor'

export const STORAGE_KEY = 'hsr-game-tools/action-planner/current'
export interface PlannerStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
export type SaveStatus = 'idle' | 'saved' | 'failed' | 'unavailable' | 'protected' | 'external'
export interface StorageToken {
  raw: string | null
}

/** Storage ownership only: the planner remains the sole owner of the edited document. */
export function createPlannerPersistence(
  storage: () => PlannerStorage,
  notify: (status: SaveStatus) => void = () => {},
) {
  let baseline: string | null | undefined
  let status: SaveStatus = 'idle'
  let paused = false
  let blocked = false
  let failure: string | undefined
  const setStatus = (next: SaveStatus, reason?: string) => {
    status = next
    failure = reason
    notify(next)
  }
  function read(): StorageToken | undefined {
    try {
      return { raw: storage().getItem(STORAGE_KEY) }
    } catch {
      setStatus('unavailable')
      return undefined
    }
  }
  function initialize() {
    const token = read()
    if (!token) return { document: emptyDocument(), issues: [], migration: undefined }
    baseline = token.raw
    if (token.raw === null) return { document: emptyDocument(), issues: [], migration: undefined }
    try {
      const parsed = parsePlannerDocument(token.raw)
      setStatus('saved')
      return parsed
    } catch (error) {
      blocked = true
      setStatus('protected', error instanceof PlannerFileError ? error.code : 'json')
      return { document: emptyDocument(), issues: [], migration: undefined }
    }
  }
  function write(document: PlannerDocument, token: StorageToken) {
    try {
      const source = serializePlannerDocument(document)
      const latest = read()
      if (!latest) return false
      if (latest.raw !== token.raw) {
        blocked = true
        setStatus('external')
        return false
      }
      storage().setItem(STORAGE_KEY, source)
      baseline = source
      blocked = false
      setStatus('saved')
      return true
    } catch {
      setStatus('failed')
      return false
    }
  }
  function save(document: PlannerDocument) {
    if (paused || blocked) return false
    const current = read()
    if (!current) return false
    if (baseline === undefined || current.raw !== baseline) {
      blocked = true
      setStatus('external')
      return false
    }
    return write(document, current)
  }
  function externalChange(key: string | null, raw: string | null) {
    if ((key === STORAGE_KEY || key === null) && raw !== baseline) {
      blocked = true
      setStatus('external')
    }
  }
  function withoutSaving<T>(action: () => T): T {
    const previous = paused
    paused = true
    try {
      return action()
    } finally {
      paused = previous
    }
  }
  function reload(restore: (document: PlannerDocument) => boolean, expected?: StorageToken) {
    const current = read()
    if (!current) return false
    if (expected && current.raw !== expected.raw) {
      blocked = true
      setStatus('external')
      return false
    }
    try {
      const parsed =
        current.raw === null
          ? { document: emptyDocument(), issues: [], migration: undefined }
          : parsePlannerDocument(current.raw)
      if (!withoutSaving(() => restore(parsed.document))) return false
      baseline = current.raw
      blocked = false
      setStatus(current.raw === null ? 'idle' : 'saved')
      return parsed
    } catch (error) {
      blocked = true
      setStatus('protected', error instanceof PlannerFileError ? error.code : 'json')
      return false
    }
  }
  function capture() {
    const token = read()
    if (token && baseline !== undefined && token.raw !== baseline) {
      blocked = true
      setStatus('external')
    }
    return token
  }
  return {
    initialize,
    save,
    externalChange,
    withoutSaving,
    reload,
    capture,
    overwrite: write,
    get status() {
      return status
    },
    get failure() {
      return failure
    },
    get guarded() {
      return blocked || baseline === undefined
    },
  }
}
