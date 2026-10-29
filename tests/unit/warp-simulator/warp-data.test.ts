import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import runtimeSnapshot from '../../../src/tools/warp-simulator/data/runtime/snapshot.json'
import runtimeManifest from '../../../src/tools/warp-simulator/data/runtime/manifest.json'
import {
  assertLock,
  assertSchema,
  findItems,
  generateSchema,
  inputFiles,
  kinds,
  parseConfig,
  parseSource,
  projectCatalog,
  snapshot,
  stable,
  validateCatalog,
  validateConfig,
  type BannerConfig,
  type Catalog,
  type CatalogManifest,
  type GachaIndex,
  type SourceLock,
} from '../../../scripts/warp-data/model'
import {
  metadata,
  publishDirectory,
  transaction,
  writeJson,
} from '../../../scripts/warp-data/files'
import {
  buildSnapshot,
  generateLocalSchema,
  loadCatalog,
  updateCatalog,
  validateData,
} from '../../../scripts/warp-data/pipeline'

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url))
const temps: string[] = []
afterEach(async () => {
  for (const dir of temps.splice(0))
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
})
async function temp() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'hsr-warp-'))
  temps.push(dir)
  return dir
}
const lock: SourceLock = {
  schemaVersion: 1,
  repository: 'https://example.invalid/synthetic',
  commit: 'a'.repeat(40),
  transformVersion: 1,
}
const item = (
  kind: 'avatar' | 'light-cone',
  rarity: 3 | 4 | 5,
  id: number,
  name = 'Same name',
) => ({ id: kind + ':' + id, kind, rarity, names: { 'zh-CN': name, en: name } })
const catalog: Catalog = {
  schemaVersion: 1,
  items: [
    item('avatar', 5, 1),
    item('avatar', 5, 2),
    item('avatar', 4, 11),
    item('avatar', 4, 12),
    item('avatar', 4, 13),
    item('light-cone', 5, 1),
    item('light-cone', 4, 21),
    item('light-cone', 4, 22),
    item('light-cone', 4, 23),
    item('light-cone', 3, 31),
  ],
}
const index: GachaIndex = {
  schemaVersion: 1,
  banners: kinds.map((kind, i) => ({ gachaId: String(100 + i), kind })),
}
function config(): BannerConfig {
  return {
    $schema: './schema/banner-config.schema.json',
    schemaVersion: 1,
    sourceCommit: lock.commit,
    sharedPools: [
      {
        id: 'avatars',
        fiveStarType: 'avatar',
        threeStar: ['light-cone:31'],
        fourStar: ['avatar:11', 'light-cone:21'],
        fiveStar: ['avatar:1'],
        evidence: ['synthetic fixture'],
      },
      {
        id: 'cones',
        fiveStarType: 'light-cone',
        threeStar: ['light-cone:31'],
        fourStar: ['avatar:11'],
        fiveStar: ['light-cone:1'],
        evidence: ['synthetic fixture'],
      },
      {
        id: 'ordinary',
        fiveStarType: 'mixed',
        threeStar: ['light-cone:31'],
        fourStar: ['light-cone:21'],
        fiveStar: ['avatar:1', 'light-cone:1'],
        evidence: ['synthetic fixture'],
      },
    ],
    banners: kinds.map((kind, i) => ({
      gachaId: String(100 + i),
      kind,
      pityGroup: 'pity:' + kind,
      sharedPool: kind === 'ordinary' ? 'ordinary' : kind.endsWith('avatar') ? 'avatars' : 'cones',
      evidence: ['synthetic fixture'],
      ...(kind === 'ordinary'
        ? {}
        : { up5: kind.endsWith('avatar') ? 'avatar:2' : 'light-cone:1' }),
      ...(kind.startsWith('event-')
        ? {
            up4: kind.endsWith('avatar')
              ? ['avatar:11', 'avatar:12', 'avatar:13']
              : ['light-cone:21', 'light-cone:22', 'light-cone:23'],
          }
        : {}),
    })),
    pending: [],
  }
}
const checked = (v: unknown) => validateConfig(parseConfig(stable(v)), catalog, index, lock)
function manifestFor(c = catalog, i = index): CatalogManifest {
  return {
    schemaVersion: 1,
    generatorVersion: 1,
    source: lock,
    sourceFiles: Object.fromEntries(inputFiles.map((f) => [f, metadata('synthetic')])),
    origins: c.items.map((v) => ({
      id: v.id,
      file: v.kind === 'avatar' ? inputFiles[0] : inputFiles[2],
      recordKey: v.id.split(':')[1]!,
      nameHash: '9007199254740993',
    })),
    files: { 'catalog.json': metadata(stable(c)), 'gacha-index.json': metadata(stable(i)) },
  }
}
async function maintenanceRoot() {
  const root = await temp()
  await writeJson(root, 'scripts/warp-data/source-lock.json', lock)
  await writeJson(root, 'scripts/warp-data/generated/catalog.json', catalog)
  await writeJson(root, 'scripts/warp-data/generated/gacha-index.json', index)
  await writeJson(root, 'scripts/warp-data/generated/manifest.json', manifestFor())
  await writeJson(root, 'scripts/warp-data/banners.jsonc', config())
  await generateLocalSchema(root)
  return root
}
function rawFixture() {
  const row = (id: number, hash: string) =>
    parseSource(
      `{"AvatarID":${id},"AvatarName":{"Hash":${hash}},"Rarity":"CombatPowerAvatarRarityType5"}`,
    )
  return {
    [inputFiles[0]]: [row(1, '9007199254740992'), row(2, '9007199254740993')],
    [inputFiles[1]]: [],
    [inputFiles[2]]: [
      parseSource(
        '{"EquipmentID":1,"EquipmentName":{"Hash":18446744073709551615},"Rarity":"CombatPowerLightconeRarity5"}',
      ),
    ],
    [inputFiles[3]]: [{ GachaID: 100, GachaType: 'AvatarUp' }],
    [inputFiles[4]]: {
      '9007199254740992': '同名',
      '9007199254740993': '同名',
      '18446744073709551615': '<unbreak>光锥</unbreak>',
    },
    [inputFiles[5]]: {
      '9007199254740992': 'Same',
      '9007199254740993': 'Same',
      '18446744073709551615': 'Cone',
    },
  }
}

describe('Warp catalog and canonical identities', () => {
  it('preserves adjacent unsafe hashes, same names, and the same numeric ID across types', () => {
    const result = projectCatalog(rawFixture())
    expect(result.origins.map((v) => v.nameHash)).toEqual([
      '9007199254740992',
      '9007199254740993',
      '18446744073709551615',
    ])
    expect(result.catalog.items.map((v) => v.id)).toEqual(['avatar:1', 'avatar:2', 'light-cone:1'])
    expect(result.catalog.items.at(-1)?.names['zh-CN']).toBe('光锥')
    expect(findItems(result.catalog, '同名').map((v) => v.id)).toEqual(['avatar:1', 'avatar:2'])
    expect(findItems(result.catalog, 'ＣＯＮＥ', 'light-cone', 5)).toHaveLength(1)
  })
  it('rejects a duplicate canonical identity rather than merging names', () => {
    const raw = rawFixture()
    raw[inputFiles[1]].push(raw[inputFiles[0]][0] as never)
    expect(() => projectCatalog(raw)).toThrow(/Duplicate/)
  })
  it('is deterministic under table and TextMap ordering changes', () => {
    const raw = rawFixture(),
      first = projectCatalog(raw)
    raw[inputFiles[0]].reverse()
    raw[inputFiles[4]] = Object.fromEntries(
      Object.entries(raw[inputFiles[4]]).reverse(),
    ) as (typeof raw)[(typeof inputFiles)[4]]
    expect(stable(projectCatalog(raw))).toBe(stable(first))
  })
  it('rejects missing names, unknown rarity, lossy pre-parsed hashes and unknown source types', () => {
    const missing = rawFixture()
    delete (missing[inputFiles[5]] as Record<string, string>)['9007199254740993']
    expect(() => projectCatalog(missing)).toThrow(/Missing TextMap/)
    const rarity = rawFixture()
    ;(rarity[inputFiles[0]][0] as any).Rarity = 'guess'
    expect(() => projectCatalog(rarity)).toThrow(/rarity/)
    const lossy = rawFixture()
    ;(lossy[inputFiles[0]][0] as any).AvatarName.Hash = 9007199254740993
    expect(() => projectCatalog(lossy)).toThrow(/identity/)
    const type = rawFixture()
    type[inputFiles[3]][0]!.GachaType = 'Unknown'
    expect(() => projectCatalog(type)).toThrow(/type/)
  })
  it('checks source lock, origin inventory and source file inventory', () => {
    const m = manifestFor()
    expect(() => validateCatalog(catalog, index, m, lock)).not.toThrow()
    expect(() => assertLock({ ...lock, commit: 'latest' })).toThrow()
    expect(() =>
      validateCatalog(catalog, index, { ...m, source: { ...lock, commit: 'b'.repeat(40) } }, lock),
    ).toThrow(/source lock/)
    expect(() => validateCatalog(catalog, index, { ...m, origins: [] }, lock)).toThrow()
    expect(() => validateCatalog(catalog, index, { ...m, sourceFiles: {} }, lock)).toThrow()
  })
})

describe('JSONC, schema and manual Banner rules', () => {
  it('accepts comments/trailing commas and rejects duplicate keys with a source location', () => {
    expect(parseConfig('{ // comment\n "value": [1,], }').value).toEqual({ value: [1] })
    expect(() => parseConfig('{"x":1, "x":2}', 'input.jsonc')).toThrow(
      /input.jsonc:1:9.*Duplicate key/,
    )
    expect(() => parseConfig('{"x":', 'input.jsonc')).toThrow(/input.jsonc:1:/)
    expect(() => parseConfig('{"o":{"id":1,"id":2}}')).toThrow(/Duplicate key/)
  })
  it('accepts all five kinds and keeps UP separate from candidate membership', () => {
    const c = checked(config()),
      s = snapshot(c, catalog)
    expect(s.banners).toHaveLength(5)
    expect(s.banners[0]!.id).toBe('gacha:100')
    expect(s.sharedPools.find((p) => p.id === 'avatars')!.fiveStar).toEqual(['avatar:1'])
    expect(s.items.some((v) => v.id === 'avatar:2')).toBe(true)
    const overlap = config()
    overlap.sharedPools[0]!.fiveStar.push('avatar:2')
    expect(() => checked(overlap)).not.toThrow()
    expect(s.sharedPools[0]).not.toHaveProperty('evidence')
  })
  it.each([
    [
      'missing five-star UP',
      (c: BannerConfig) => {
        delete c.banners[0]!.up5
      },
    ],
    [
      'unknown ID',
      (c: BannerConfig) => {
        c.banners[0]!.up5 = 'avatar:999'
      },
    ],
    [
      'type collision',
      (c: BannerConfig) => {
        c.banners[0]!.up5 = 'light-cone:1'
      },
    ],
    [
      'wrong rarity',
      (c: BannerConfig) => {
        c.banners[0]!.up5 = 'avatar:11'
      },
    ],
    [
      'duplicate UP',
      (c: BannerConfig) => {
        c.banners[0]!.up4 = ['avatar:11', 'avatar:11', 'avatar:13']
      },
    ],
    [
      'missing UP',
      (c: BannerConfig) => {
        delete c.banners[0]!.up4
      },
    ],
    [
      'excess UP',
      (c: BannerConfig) => {
        c.banners[0]!.up4!.push('avatar:11')
      },
    ],
    [
      'Fate up4',
      (c: BannerConfig) => {
        c.banners[2]!.up4 = ['avatar:11', 'avatar:12', 'avatar:13']
      },
    ],
    [
      'Ordinary up5',
      (c: BannerConfig) => {
        c.banners[4]!.up5 = 'avatar:1'
      },
    ],
    [
      'empty pool',
      (c: BannerConfig) => {
        c.sharedPools[0]!.threeStar = []
      },
    ],
    [
      'invalid pool item',
      (c: BannerConfig) => {
        c.sharedPools[0]!.threeStar = ['avatar:11']
      },
    ],
    [
      'duplicate pool member',
      (c: BannerConfig) => {
        c.sharedPools[0]!.fiveStar.push('avatar:1')
      },
    ],
    [
      'invalid reference',
      (c: BannerConfig) => {
        c.banners[0]!.sharedPool = 'unknown'
      },
    ],
    [
      'wrong pool type',
      (c: BannerConfig) => {
        c.banners[0]!.sharedPool = 'cones'
      },
    ],
    [
      'Gacha type mismatch',
      (c: BannerConfig) => {
        c.banners[0]!.gachaId = '101'
      },
    ],
    [
      'unknown GachaID',
      (c: BannerConfig) => {
        c.banners[0]!.gachaId = '999'
      },
    ],
    [
      'incompatible pity group',
      (c: BannerConfig) => {
        c.banners[0]!.pityGroup = 'gacha:100'
      },
    ],
    [
      'duplicate GachaID',
      (c: BannerConfig) => {
        c.banners.push(c.banners[0]!)
      },
    ],
    [
      'duplicate pool ID',
      (c: BannerConfig) => {
        c.sharedPools.push(c.sharedPools[0]!)
      },
    ],
    [
      'missing evidence',
      (c: BannerConfig) => {
        c.sharedPools[0]!.evidence = []
      },
    ],
    [
      'unknown field',
      (c: BannerConfig) => {
        ;(c.banners[0] as any).probability = 0.5
      },
    ],
    [
      'wrong source',
      (c: BannerConfig) => {
        c.sourceCommit = 'b'.repeat(40)
      },
    ],
    [
      'wrong schema version',
      (c: BannerConfig) => {
        ;(c as any).schemaVersion = 2
      },
    ],
    [
      'mixed pool missing kind',
      (c: BannerConfig) => {
        c.sharedPools[2]!.fiveStar = ['avatar:1']
      },
    ],
  ])('rejects %s', (_, change) => {
    const c = config()
    change(c)
    expect(() => checked(c)).toThrow(/banners.jsonc:\d+:\d+/)
  })
  it('creates valid local Draft-07 with descriptions, filtered IDs and all templates', () => {
    const s = generateSchema(catalog, index, lock, config())
    assertSchema({ $ref: 'http://json-schema.org/draft-07/schema#' }, s, 'meta')
    expect(s.allowComments).toBe(true)
    expect(s.allowTrailingCommas).toBe(true)
    const avatars = s.definitions['avatar-5'] as any
    expect(avatars.enum).toEqual(['avatar:1', 'avatar:2'])
    expect(avatars.markdownEnumDescriptions[0]).toContain('Same name')
    expect(avatars.markdownEnumDescriptions[0]).toContain('5★')
    const bannerSchema = s.properties.banners as {
      items: { oneOf: { defaultSnippets: { body: { kind: string } }[] }[] }
    }
    expect(bannerSchema.items.oneOf.map((v) => v.defaultSnippets[0]!.body.kind)).toEqual(kinds)
  })
  it('emits only reachable records and is stable under maintenance ordering', () => {
    const c = config()
    c.banners = [c.banners[0]!]
    const first = stable(snapshot(checked(c), catalog))
    c.sharedPools.reverse()
    c.sharedPools.forEach((p) => {
      p.threeStar.reverse()
      p.fourStar.reverse()
      p.fiveStar.reverse()
    })
    c.banners[0]!.up4!.reverse()
    const reordered = Object.fromEntries(Object.entries(c).reverse())
    expect(stable(snapshot(checked(reordered), catalog))).toBe(first)
    expect(snapshot(checked(c), catalog).sharedPools).toHaveLength(1)
  })
})

describe('Warp file pipeline and failure recovery', () => {
  it('validates the real committed artifacts entirely inside this repository', async () => {
    const state = await loadCatalog(projectRoot)
    expect(state.catalog.items.map((item) => item.id).sort()).toEqual(
      state.manifest.origins.map((origin) => origin.id).sort(),
    )
    expect(await validateData(projectRoot)).toEqual({
      status: runtimeManifest.configurationStatus,
      items: runtimeSnapshot.items.length,
      sharedPools: runtimeSnapshot.sharedPools.length,
      readyBanners: runtimeSnapshot.banners.length,
      pending: runtimeManifest.counts.pending,
    })
  })
  it('builds, validates, detects stale schema/config/checksums and preserves previous output', async () => {
    const root = await maintenanceRoot()
    await buildSnapshot(root)
    expect((await validateData(root)).readyBanners).toBe(5)
    const before = await readFile(
      path.join(root, 'src/tools/warp-simulator/data/runtime/snapshot.json'),
    )
    const changed = config()
    changed.banners[0]!.up5 = 'avatar:999'
    await writeFile(path.join(root, 'scripts/warp-data/banners.jsonc'), stable(changed))
    await expect(buildSnapshot(root)).rejects.toThrow()
    expect(
      await readFile(path.join(root, 'src/tools/warp-simulator/data/runtime/snapshot.json')),
    ).toEqual(before)
    await writeFile(path.join(root, 'scripts/warp-data/banners.jsonc'), '{')
    await expect(buildSnapshot(root)).rejects.toThrow(/banners.jsonc/)
    expect(
      await readFile(path.join(root, 'src/tools/warp-simulator/data/runtime/snapshot.json')),
    ).toEqual(before)
    await writeFile(path.join(root, 'scripts/warp-data/banners.jsonc'), stable(config()))
    await writeFile(path.join(root, 'scripts/warp-data/schema/banner-config.schema.json'), '{}')
    await expect(buildSnapshot(root)).rejects.toThrow(/Stale Warp Schema/)
    await generateLocalSchema(root)
    await writeFile(
      path.join(root, 'scripts/warp-data/generated/catalog.json'),
      stable(catalog) + ' ',
    )
    await expect(buildSnapshot(root)).rejects.toThrow(/Checksum/)
    expect(
      await readFile(path.join(root, 'src/tools/warp-simulator/data/runtime/snapshot.json')),
    ).toEqual(before)
  })
  it.each(['after-backup', 'after-install'] as const)(
    'rolls back a runtime publish failure %s',
    async (phase) => {
      const root = await maintenanceRoot()
      await buildSnapshot(root)
      const dir = path.join(root, 'src/tools/warp-simulator/data/runtime')
      const before = await Promise.all((await readdir(dir)).map((f) => readFile(path.join(dir, f))))
      await expect(
        buildSnapshot(root, (p) => {
          if (p === phase) throw new Error('injected')
        }),
      ).rejects.toThrow('injected')
      expect(
        await Promise.all((await readdir(dir)).map((f) => readFile(path.join(dir, f)))),
      ).toEqual(before)
      expect((await validateData(root)).readyBanners).toBe(5)
    },
  )
  it('rejects a valid maintenance edit until an explicit rebuild and detects runtime corruption', async () => {
    const root = await maintenanceRoot()
    await buildSnapshot(root)
    const changed = config()
    changed.banners.pop()
    await writeFile(path.join(root, 'scripts/warp-data/banners.jsonc'), stable(changed))
    await expect(validateData(root)).rejects.toThrow(/Runtime snapshot or Manifest/)
    await buildSnapshot(root)
    expect((await validateData(root)).readyBanners).toBe(4)
    await writeFile(path.join(root, 'src/tools/warp-simulator/data/runtime/snapshot.json'), '{}')
    await expect(validateData(root)).rejects.toThrow(/Runtime snapshot or Manifest/)
  })
  it('does not replace another process lock', async () => {
    const root = await temp()
    await mkdir(path.join(root, '.warp-data-staging'))
    await writeFile(path.join(root, '.warp-data-staging/update.lock'), 'owner')
    await expect(transaction(root, async () => {})).rejects.toThrow()
    expect(await readFile(path.join(root, '.warp-data-staging/update.lock'), 'utf8')).toBe('owner')
  })
  it('rolls back a first publish without leaving a partial formal snapshot', async () => {
    const root = await temp()
    await expect(
      transaction(root, async (stage, id) => {
        await writeJson(stage, 'new.json', {})
        await publishDirectory(
          root,
          'src/tools/warp-simulator/data/runtime',
          stage,
          id,
          (phase) => {
            if (phase === 'after-install') throw new Error('injected')
          },
        )
      }),
    ).rejects.toThrow('injected')
    await expect(
      readFile(path.join(root, 'src/tools/warp-simulator/data/runtime/new.json')),
    ).rejects.toThrow()
  })
  it('updates only from a clean locked local source and preserves old output on source failure', async () => {
    const root = await temp(),
      source = await temp(),
      raw = rawFixture()
    for (const file of inputFiles) await writeJson(source, file, raw[file])
    // Serialize upstream Hash fields as numeric lexemes, just like the real source.
    for (const file of inputFiles.slice(0, 3)) {
      const f = path.join(source, file)
      await writeFile(f, (await readFile(f, 'utf8')).replace(/"Hash": "(\d+)"/g, '"Hash": $1'))
    }
    const git = (args: string[]) =>
      execFileSync(
        'git',
        [
          '-c',
          'core.autocrlf=false',
          '-c',
          'commit.gpgSign=false',
          '-c',
          'core.hooksPath=' + path.join(source, '.no-hooks'),
          '-C',
          source,
          ...args,
        ],
        {
          encoding: 'utf8',
        },
      ).trim()
    git(['init', '--quiet'])
    git(['add', '.'])
    git([
      '-c',
      'user.name=Synthetic Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '--quiet',
      '-m',
      'synthetic test source',
    ])
    const sourceLock = { ...lock, commit: git(['rev-parse', 'HEAD']) }
    await writeJson(root, 'scripts/warp-data/source-lock.json', sourceLock)
    await updateCatalog(root, source)
    const before = await readFile(path.join(root, 'scripts/warp-data/generated/manifest.json'))
    await expect(
      updateCatalog(root, source, () => {
        throw new Error('injected')
      }),
    ).rejects.toThrow('injected')
    expect(await readFile(path.join(root, 'scripts/warp-data/generated/manifest.json'))).toEqual(
      before,
    )
    await writeFile(path.join(source, inputFiles[0]), '[]')
    await expect(updateCatalog(root, source)).rejects.toThrow(/clean Git root/)
    expect(await readFile(path.join(root, 'scripts/warp-data/generated/manifest.json'))).toEqual(
      before,
    )
    expect(git(['rev-parse', 'HEAD'])).toBe(sourceLock.commit)
    expect(git(['diff', '--name-only'])).toBe(inputFiles[0])
  })
})
