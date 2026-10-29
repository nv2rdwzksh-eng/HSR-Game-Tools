import { describe, expect, it, vi } from 'vitest'
import { useWarpSimulator } from '../../../src/tools/warp-simulator/composables/useWarpSimulator'
import {
  AFFINITY_STORAGE_KEY,
  type AffinityStorage,
} from '../../../src/tools/warp-simulator/model/affinity-persistence'
import {
  fixture,
  multiBannerFixture,
  selectedAvatarIds,
  scripted,
} from '../../fixtures/warp-simulator/fixture'

const serialize = (ids: readonly string[] = selectedAvatarIds) =>
  JSON.stringify({ schemaVersion: 1, selectedAvatarIds: ids })
function memoryStorage(initial: string | null = null) {
  let raw = initial
  return {
    getItem: vi.fn((key: string) => {
      expect(key).toBe(AFFINITY_STORAGE_KEY)
      return raw
    }),
    setItem: vi.fn((key: string, value: string) => {
      expect(key).toBe(AFFINITY_STORAGE_KEY)
      raw = value
    }),
    get raw() {
      return raw
    },
  }
}
function choose(
  simulator: ReturnType<typeof useWarpSimulator>,
  ids: readonly string[] = selectedAvatarIds,
) {
  expect(simulator.openSelection()).toBe(true)
  simulator.setSelectionDraft(ids)
  expect(simulator.confirmSelection()).toBe(true)
}

describe('shared affinity persistence', () => {
  it('uses the default browser adapter, including a throwing localStorage getter', () => {
    const storage = memoryStorage(serialize())
    vi.stubGlobal('window', { localStorage: storage })
    try {
      const simulator = useWarpSimulator({ snapshot: fixture() })
      expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
      choose(simulator, ['avatar:9', ...selectedAvatarIds.slice(1)])
      expect(storage.setItem).toHaveBeenCalledTimes(1)
      expect(useWarpSimulator({ snapshot: fixture() }).selectedAvatarIds.value[0]).toBe('avatar:9')
      vi.stubGlobal(
        'window',
        Object.defineProperty({}, 'localStorage', {
          get() {
            throw new Error('blocked')
          },
        }),
      )
      const blocked = useWarpSimulator({ snapshot: fixture() })
      expect(blocked.storageNotice.value).toBe('unavailable')
      choose(blocked)
      expect(blocked.canPull.value).toBe(true)
      expect(blocked.storageNotice.value).toBe('writeFailed')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('writes only on confirmation and restores choices into a fresh page session', async () => {
    const storage = memoryStorage(),
      rng = scripted([0.99, 0.99, 0])
    const first = useWarpSimulator({ snapshot: multiBannerFixture(), storage: () => storage, rng })
    expect(storage.getItem).toHaveBeenCalledTimes(1)
    expect(storage.setItem).not.toHaveBeenCalled()
    first.openSelection()
    first.setSelectionDraft(selectedAvatarIds)
    expect(storage.setItem).not.toHaveBeenCalled()
    first.cancelSelection()
    expect(first.selectedAvatarIds.value).toEqual([])
    choose(first)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(JSON.parse(storage.raw!)).toEqual({ schemaVersion: 1, selectedAvatarIds })
    await first.draw(1)
    first.openSelection()
    first.setSelectionDraft(['avatar:8', ...selectedAvatarIds.slice(1)])
    first.cancelSelection()
    first.selectKind('fate-avatar')
    expect(first.canPull.value).toBe(true)
    first.selectKind('event-avatar')
    first.selectBanner('gacha:200')
    expect(storage.setItem).toHaveBeenCalledTimes(1)
    expect(storage.getItem).toHaveBeenCalledTimes(1)
    expect(rng.consumed).toBe(3)
    const second = useWarpSimulator({ snapshot: multiBannerFixture(), storage: () => storage })
    expect(second.selectedAvatarIds.value).toEqual(selectedAvatarIds)
    expect(second.canPull.value).toBe(true)
    expect(second.session.value.history).toEqual([])
    expect(
      Object.values(second.session.value.engine.groups).every(
        (group) =>
          group.pullsSinceLast5 === 0 &&
          group.pullsSinceLast4 === 0 &&
          !group.guaranteed5 &&
          !group.guaranteed4,
      ),
    ).toBe(true)
    expect(second.storageNotice.value).toBeUndefined()
  })

  it.each([
    '{',
    'null',
    '[]',
    '{}',
    JSON.stringify({ schemaVersion: 2, selectedAvatarIds }),
    JSON.stringify({ schemaVersion: '1', selectedAvatarIds }),
    JSON.stringify({ schemaVersion: 1, selectedAvatarIds, extra: true }),
    JSON.stringify({ schemaVersion: 1, selectedAvatarIds: 'avatar:1' }),
    serialize([]),
    serialize(selectedAvatarIds.slice(1)),
    serialize([...selectedAvatarIds, 'avatar:8']),
    serialize(['avatar:1', ...selectedAvatarIds.slice(0, 6)]),
    serialize(['light-cone:1', ...selectedAvatarIds.slice(1)]),
    serialize(['avatar:01', ...selectedAvatarIds.slice(1)]),
    JSON.stringify({ schemaVersion: 1, selectedAvatarIds: [1, ...selectedAvatarIds.slice(1)] }),
  ])(
    'keeps invalid stored bytes untouched and requires explicit reconfirmation: %s',
    async (raw) => {
      const storage = memoryStorage(raw),
        rng = scripted([])
      const simulator = useWarpSimulator({ snapshot: fixture(), storage: () => storage, rng })
      expect(simulator.selectedAvatarIds.value).toEqual([])
      expect(simulator.storageNotice.value).toBe('invalid')
      expect(await simulator.draw(1)).toBe(false)
      expect(rng.consumed).toBe(0)
      expect(storage.raw).toBe(raw)
      expect(storage.setItem).not.toHaveBeenCalled()
      choose(simulator)
      expect(storage.raw).toBe(serialize())
      expect(simulator.storageNotice.value).toBeUndefined()
    },
  )

  it('retains stale IDs for manual repair without treating catalog membership as eligibility', () => {
    const stale = ['avatar:999', ...selectedAvatarIds.slice(1)]
    const storage = memoryStorage(serialize(stale)),
      rng = scripted([])
    const simulator = useWarpSimulator({ snapshot: fixture(), storage: () => storage, rng })
    expect(simulator.selectedAvatarIds.value).toEqual(stale)
    expect(simulator.storageNotice.value).toBe('stale')
    expect(simulator.selectionIssue.value).toBe('incompatible')
    expect(simulator.canPull.value).toBe(false)
    expect(simulator.openSelection()).toBe(true)
    expect(simulator.selectionDraft.value).toEqual(stale)
    expect(simulator.confirmSelection()).toBe(false)
    simulator.cancelSelection()
    expect(storage.raw).toBe(serialize(stale))
    choose(simulator)
    expect(simulator.canPull.value).toBe(true)
    expect(rng.consumed).toBe(0)
  })

  it('restores a list valid for another Banner and preserves it when the initial Banner rejects it', () => {
    const snapshot = multiBannerFixture()
    snapshot.sharedPools.push({
      ...snapshot.sharedPools[0]!,
      id: 'restricted',
      fiveStar: [
        'avatar:2',
        'avatar:3',
        'avatar:4',
        'avatar:5',
        'avatar:6',
        'avatar:7',
        'avatar:8',
      ],
    })
    snapshot.banners[0]!.sharedPool = 'restricted'
    const storage = memoryStorage(serialize())
    const simulator = useWarpSimulator({ snapshot, storage: () => storage })
    expect(simulator.storageNotice.value).toBeUndefined()
    expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
    expect(simulator.canPull.value).toBe(false)
    expect(simulator.selectionIssue.value).toBe('incompatible')
    simulator.selectKind('fate-avatar')
    expect(simulator.canPull.value).toBe(true)
    simulator.selectKind('event-avatar')
    simulator.selectBanner('gacha:200')
    expect(simulator.canPull.value).toBe(true)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('requires seven to be compatible together, rather than accepting the union of candidates', () => {
    const snapshot = fixture()
    snapshot.sharedPools[0]!.fiveStar = [
      'avatar:2',
      'avatar:3',
      'avatar:4',
      'avatar:5',
      'avatar:6',
      'avatar:7',
      'avatar:8',
    ]
    snapshot.sharedPools.push({
      ...snapshot.sharedPools[0]!,
      id: 'other',
      fiveStar: [
        'avatar:1',
        'avatar:3',
        'avatar:4',
        'avatar:5',
        'avatar:6',
        'avatar:7',
        'avatar:9',
      ],
    })
    snapshot.banners.find((banner) => banner.kind === 'fate-avatar')!.sharedPool = 'other'
    const simulator = useWarpSimulator({ snapshot, storage: () => memoryStorage(serialize()) })
    expect(simulator.storageNotice.value).toBe('stale')
    expect(simulator.canPull.value).toBe(false)
    simulator.selectKind('fate-avatar')
    expect(simulator.canPull.value).toBe(false)
    expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
  })

  it.each(['source', 'read', 'write', 'absent'] as const)(
    'uses confirmed in-memory selections when storage fails: %s',
    async (failure) => {
      const storage: AffinityStorage = {
        getItem() {
          if (failure === 'read') throw new Error('denied')
          return null
        },
        setItem() {
          if (failure === 'write') throw new Error('quota')
        },
      }
      const source = () => {
        if (failure === 'source') throw new Error('denied')
        return failure === 'absent' ? undefined : storage
      }
      const simulator = useWarpSimulator({
        snapshot: fixture(),
        storage: source,
        rng: { next: () => 0.99 },
      })
      if (failure === 'read' || failure === 'source')
        expect(simulator.storageNotice.value).toBe('unavailable')
      choose(simulator)
      expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
      expect(simulator.storageNotice.value).toBe(
        failure === 'read' ? undefined : failure === 'absent' ? 'unavailable' : 'writeFailed',
      )
      expect(await simulator.draw(1)).toBe(true)
    },
  )

  it('does not rewrite or delete affinity when resetting either session scope', async () => {
    const storage = memoryStorage(serialize())
    const simulator = useWarpSimulator({
      snapshot: fixture(),
      storage: () => storage,
      rng: { next: () => 0.99 },
    })
    await simulator.draw(1)
    for (const scope of ['group', 'all'] as const) {
      simulator.requestReset(scope)
      simulator.confirmReset()
      expect(simulator.selectedAvatarIds.value).toEqual(selectedAvatarIds)
      expect(simulator.canPull.value).toBe(true)
    }
    expect(storage.raw).toBe(serialize())
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.getItem).toHaveBeenCalledTimes(1)
  })
})
