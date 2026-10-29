import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  projectGameData,
  finalizeProjection,
  type ProjectionInput,
  type SourceLock,
  type Overlays,
} from '../../../scripts/game-data/projection'
import { acquireUpdateLock, validateGameFiles, digest } from '../../../scripts/game-data/files'
import { publishSnapshot } from '../../../scripts/game-data/publish'
import { validateSnapshot } from '../../../src/tools/action-planner/data/schema'

const temps: string[] = []
afterEach(async () => {
  for (const temp of temps.splice(0))
    await rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})
const lock: SourceLock = {
  repository: 'synthetic',
  commit: 'a'.repeat(40),
  reviewedCharacterIds: ['1'],
  transform: { version: 2, maxSize: 256, quality: 85, alphaQuality: 100 },
}
const overlays: Overlays = {
  schemaVersion: 1,
  provenance: { fixture: true },
  names: {},
  aliases: {},
}
function fixture(): ProjectionInput {
  const char = {
    id: '1',
    name: 'Synthetic',
    path: 'Test',
    tag: 'unit',
    max_sp: 999,
    icon: 'icon/character/1.png',
  }
  const promotion = { id: '1', values: [{ spd: { base: 101, step: 0 } }] }
  const sets = {
    '110': { id: '110', name: 'Set A', icon: 'icon/relic/110.png' },
    '308': { id: '308', name: 'Set B', icon: 'icon/relic/308.png' },
  }
  const cones = { '21018': { id: '21018', name: 'Cone', icon: 'icon/light_cone/21018.png' } }
  return {
    gameVersion: 'test',
    characters: { 'zh-CN': { 1: { ...char } }, en: { 1: { ...char } } },
    promotions: {
      'zh-CN': { 1: structuredClone(promotion) },
      en: { 1: structuredClone(promotion) },
    },
    relicSets: { 'zh-CN': structuredClone(sets), en: structuredClone(sets) },
    lightCones: { 'zh-CN': structuredClone(cones), en: structuredClone(cones) },
  }
}
describe('small independent game-data contract', () => {
  it('validates the complete fixed snapshot, checksum inventory and actual WebP metadata', async () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url))
    expect(await validateGameFiles(root)).toMatchObject({
      characters: 98,
      presets: 3,
      assets: 101,
      missing: 0,
      diagnostics: 0,
    })
  })
  it('projects SPD rather than max_sp and records missing/variable speed without inventing a number', () => {
    const input = fixture()
    expect(projectGameData(input, lock, overlays).snapshot.characters[0].baseSpeed).toBe(101)
    input.promotions = { 'zh-CN': {}, en: {} }
    const missing = projectGameData(input, lock, overlays)
    expect(missing.snapshot.characters[0].baseSpeed).toBeUndefined()
    expect(missing.diagnostics).toContainEqual({ code: 'missing-or-variable-speed', id: '1' })
    input.promotions = {
      'zh-CN': { 1: { id: '1', values: [{ spd: { base: 101, step: 1 } }] } },
      en: { 1: { id: '1', values: [{ spd: { base: 101, step: 1 } }] } },
    }
    expect(projectGameData(input, lock, overlays).snapshot.characters[0].baseSpeed).toBeUndefined()
  })
  it('requires reviewed identities, matching locales and safe real asset paths', () => {
    const input = fixture()
    input.characters.en = {}
    expect(() => projectGameData(input, lock, overlays)).toThrow(/inventory/)
    const unsafe = fixture()
    unsafe.characters = {
      'zh-CN': {
        1: { id: '1', name: 'X', path: 'Test', icon: 'icon/character/../../outside.png' },
      },
      en: { 1: { id: '1', name: 'X', path: 'Test', icon: 'icon/character/../../outside.png' } },
    }
    expect(() => projectGameData(unsafe, lock, overlays)).toThrow(/Unsafe/)
    const speedMismatch = fixture()
    speedMismatch.promotions.en = { 1: { id: '1', values: [{ spd: { base: 102, step: 0 } }] } }
    expect(() => projectGameData(speedMismatch, lock, overlays)).toThrow(/speed mismatch/)
  })
  it('resolves placeholders through reviewed overlays and omits missing image references', () => {
    const input = fixture()
    input.characters = {
      'zh-CN': { 1: { id: '1', name: '{NICKNAME}', path: 'Test' } },
      en: { 1: { id: '1', name: '{NICKNAME}', path: 'Test' } },
    }
    expect(() => projectGameData(input, lock, overlays)).toThrow(/Unresolved/)
    const output = projectGameData(input, lock, {
      ...overlays,
      names: { 1: { 'zh-CN': 'Synthetic CN', en: 'Synthetic EN' } },
    })
    finalizeProjection(output.snapshot, new Set(output.requests.map((r) => r.key)))
    expect(output.snapshot.characters[0].assetKey).toBeUndefined()
    expect(output.snapshot.presets.every((p) => p.assetKey === undefined)).toBe(true)
    expect(() =>
      validateSnapshot({
        ...output.snapshot,
        assets: { bad: { path: '../escape.webp', width: 1, height: 1 } },
      }),
    ).toThrow()
  })
  it('detects changed bytes and isolates Currency Wars material assets without accepting unknown assets', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-data-corruption-'))
    temps.push(root)
    const output = projectGameData(fixture(), lock, overlays)
    finalizeProjection(output.snapshot, new Set(output.requests.map((r) => r.key)))
    await mkdir(path.join(root, 'src/tools/action-planner/data/game'), { recursive: true })
    await mkdir(path.join(root, 'public/game-assets'), { recursive: true })
    const bytes = JSON.stringify(output.snapshot)
    await writeFile(path.join(root, 'src/tools/action-planner/data/game/catalog.json'), bytes + ' ')
    await writeFile(
      path.join(root, 'src/tools/action-planner/data/game/manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        gameVersion: 'test',
        source: { commit: lock.commit, repository: 'synthetic' },
        generatedAt: new Date().toISOString(),
        overlaySha256: digest('overlay'),
        transform: { ...lock.transform, sharpVersion: 'test' },
        missingAssets: [],
        diagnostics: [],
        files: {
          'src/tools/action-planner/data/game/catalog.json': {
            sha256: digest(bytes),
            bytes: Buffer.byteLength(bytes),
          },
        },
      }),
    )
    await expect(validateGameFiles(root)).rejects.toThrow(/Checksum/)
    await writeFile(path.join(root, 'src/tools/action-planner/data/game/catalog.json'), bytes)
    await mkdir(path.join(root, 'public/game-assets/currency-war-equipments'), { recursive: true })
    await writeFile(
      path.join(root, 'public/game-assets/currency-war-equipments/350601.webp'),
      'owned by craft catalog',
    )
    await expect(validateGameFiles(root)).resolves.toMatchObject({ assets: 0 })
    await writeFile(path.join(root, 'public/game-assets/unknown.webp'), 'unexpected')
    await expect(validateGameFiles(root)).rejects.toThrow(/Unexpected or missing asset/)
  })
  it('restores both previous output directories after an injected publish failure', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-data-rollback-'))
    temps.push(root)
    const staging = path.join(root, '.game-data-staging/run')
    for (const base of [root, staging]) {
      await mkdir(path.join(base, 'src/tools/action-planner/data/game'), { recursive: true })
      await mkdir(path.join(base, 'public/game-assets'), { recursive: true })
      await writeFile(
        path.join(base, 'src/tools/action-planner/data/game/manifest.json'),
        base === root ? 'old-data' : 'new-data',
      )
      await writeFile(
        path.join(base, 'public/game-assets/image.webp'),
        base === root ? 'old-image' : 'new-image',
      )
    }
    await expect(
      publishSnapshot(root, staging, 'test', () => {
        throw new Error('Injected failure')
      }),
    ).rejects.toThrow('Injected failure')
    expect(
      await readFile(path.join(root, 'src/tools/action-planner/data/game/manifest.json'), 'utf8'),
    ).toBe('old-data')
    expect(await readFile(path.join(root, 'public/game-assets/image.webp'), 'utf8')).toBe(
      'old-image',
    )
  })
  it('rejects a concurrent update without replacing its owner lock', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'hsr-data-lock-'))
    temps.push(root)
    const guard = await acquireUpdateLock(root, 'owner')
    await expect(acquireUpdateLock(root, 'second')).rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(guard, 'utf8')).toBe('owner')
  })
})
