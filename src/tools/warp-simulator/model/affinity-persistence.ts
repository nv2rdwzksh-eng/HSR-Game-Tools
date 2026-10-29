export const AFFINITY_STORAGE_KEY = 'hsr-game-tools:warp-affinity:v1'
export interface AffinityStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}
export type AffinityStorageSource = () => AffinityStorage | undefined
export type AffinityStorageNotice = 'unavailable' | 'invalid' | 'stale' | 'writeFailed'

const emptySelection: readonly string[] = Object.freeze([])
function browserStorage(): AffinityStorage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

/** Only explicitly confirmed affinity is stored. Sessions and drafts never enter this boundary. */
export function createAffinityPersistence(
  acceptsSelection: (ids: readonly string[]) => boolean,
  source: AffinityStorageSource = browserStorage,
) {
  function restore(): {
    selectedAvatarIds: readonly string[]
    notice?: AffinityStorageNotice
  } {
    let raw: string | null
    try {
      const storage = source()
      if (!storage) return { selectedAvatarIds: emptySelection }
      raw = storage.getItem(AFFINITY_STORAGE_KEY)
    } catch {
      return { selectedAvatarIds: emptySelection, notice: 'unavailable' }
    }
    if (raw === null) return { selectedAvatarIds: emptySelection }
    try {
      const value: unknown = JSON.parse(raw)
      if (
        typeof value !== 'object' ||
        value === null ||
        Array.isArray(value) ||
        Object.keys(value).length !== 2 ||
        !('schemaVersion' in value) ||
        value.schemaVersion !== 1 ||
        !('selectedAvatarIds' in value) ||
        !Array.isArray(value.selectedAvatarIds) ||
        value.selectedAvatarIds.length !== 7 ||
        !value.selectedAvatarIds.every(
          (id: unknown) => typeof id === 'string' && /^avatar:[1-9][0-9]*$/.test(id),
        ) ||
        new Set(value.selectedAvatarIds).size !== 7
      )
        return { selectedAvatarIds: emptySelection, notice: 'invalid' }
      const ids: readonly string[] = Object.freeze([...value.selectedAvatarIds])
      return {
        selectedAvatarIds: ids,
        notice: acceptsSelection(ids) ? undefined : 'stale',
      }
    } catch {
      return { selectedAvatarIds: emptySelection, notice: 'invalid' }
    }
  }
  function save(ids: readonly string[]): AffinityStorageNotice | undefined {
    try {
      const storage = source()
      if (!storage) return 'unavailable'
      storage.setItem(
        AFFINITY_STORAGE_KEY,
        JSON.stringify({ schemaVersion: 1, selectedAvatarIds: ids }),
      )
      return undefined
    } catch {
      return 'writeFailed'
    }
  }
  return { restore, save }
}
