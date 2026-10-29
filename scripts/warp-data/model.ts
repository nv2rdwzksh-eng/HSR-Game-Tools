import Ajv, { type ErrorObject } from 'ajv'
import {
  parseTree,
  getNodeValue,
  findNodeAtLocation,
  printParseErrorCode,
  type Node,
  type ParseError,
} from 'jsonc-parser'
import type {
  WarpBanner,
  WarpBannerKind,
  WarpItem,
  WarpItemKind,
  WarpPool,
  WarpSnapshot,
} from '../../src/tools/warp-simulator/data/schema'

export const VERSION = 1
export const kinds: WarpBannerKind[] = [
  'event-avatar',
  'event-light-cone',
  'fate-avatar',
  'fate-light-cone',
  'ordinary',
]
export const inputFiles = [
  'ExcelOutput/AvatarConfig.json',
  'ExcelOutput/AvatarConfigLD.json',
  'ExcelOutput/EquipmentConfig.json',
  'ExcelOutput/GachaBasicInfo.json',
  'TextMap/TextMapCHS.json',
  'TextMap/TextMapEN.json',
] as const
export const sourceTypes: Record<string, WarpBannerKind | 'unsupported'> = {
  Normal: 'ordinary',
  Newbie: 'unsupported',
  AvatarUp: 'event-avatar',
  WeaponUp: 'event-light-cone',
  CollaborationAvatarUp: 'fate-avatar',
  CollaborationWeaponUp: 'fate-light-cone',
}
export interface SourceLock {
  schemaVersion: 1
  repository: string
  commit: string
  transformVersion: 1
}
export interface Catalog {
  schemaVersion: 1
  items: WarpItem[]
}
export interface GachaIndex {
  schemaVersion: 1
  banners: { gachaId: string; kind: WarpBannerKind | 'unsupported' }[]
}
export interface Origin {
  id: string
  file: string
  recordKey: string
  nameHash: string
}
export interface FileMeta {
  bytes: number
  sha256: string
}
export interface CatalogManifest {
  schemaVersion: 1
  generatorVersion: 1
  source: SourceLock
  sourceFiles: Record<string, FileMeta>
  origins: Origin[]
  files: Record<string, FileMeta>
}
export interface BannerConfig {
  $schema: string
  schemaVersion: 1
  sourceCommit: string
  sharedPools: (WarpPool & { evidence: string[] })[]
  banners: (Omit<WarpBanner, 'id'> & { evidence: string[] })[]
  pending: { kind: WarpBannerKind; reason: string }[]
}
export const object = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v)
const decimal = { type: 'string', pattern: '^[1-9][0-9]*$' }
const sha = { type: 'string', pattern: '^[a-f0-9]{64}$' }
const commit = { type: 'string', pattern: '^[a-f0-9]{40}$' }
const text = { type: 'string', minLength: 1, pattern: '\\S' }
const fileMeta = strictObject({ bytes: { type: 'integer', minimum: 0 }, sha256: sha })
export function strictObject(
  properties: Record<string, unknown>,
  required = Object.keys(properties),
) {
  return { type: 'object', properties, required, additionalProperties: false }
}
export const lockSchema = strictObject({
  schemaVersion: { const: VERSION },
  repository: { type: 'string', pattern: '^https://[^\\s]+$' },
  commit,
  transformVersion: { const: VERSION },
})
const itemSchema = {
  ...strictObject({
    id: { type: 'string' },
    kind: { enum: ['avatar', 'light-cone'] },
    rarity: { enum: [3, 4, 5] },
    names: strictObject({ 'zh-CN': text, en: text }),
  }),
  oneOf: [
    {
      properties: {
        kind: { const: 'avatar' },
        id: { pattern: '^avatar:[1-9][0-9]*$' },
        rarity: { enum: [4, 5] },
      },
    },
    { properties: { kind: { const: 'light-cone' }, id: { pattern: '^light-cone:[1-9][0-9]*$' } } },
  ],
}
const catalogSchema = strictObject({
  schemaVersion: { const: VERSION },
  items: { type: 'array', minItems: 1, items: itemSchema },
})
const indexSchema = strictObject({
  schemaVersion: { const: VERSION },
  banners: {
    type: 'array',
    minItems: 1,
    items: strictObject({ gachaId: decimal, kind: { enum: [...kinds, 'unsupported'] } }),
  },
})
const manifestSchema = strictObject({
  schemaVersion: { const: VERSION },
  generatorVersion: { const: VERSION },
  source: lockSchema,
  sourceFiles: {
    type: 'object',
    properties: Object.fromEntries(inputFiles.map((f) => [f, fileMeta])),
    required: [...inputFiles],
    additionalProperties: false,
  },
  origins: {
    type: 'array',
    minItems: 1,
    items: strictObject({
      id: text,
      file: { enum: inputFiles.slice(0, 3) },
      recordKey: decimal,
      nameHash: decimal,
    }),
  },
  files: strictObject({ 'catalog.json': fileMeta, 'gacha-index.json': fileMeta }),
})
const ajv = new Ajv({ allErrors: true, strict: false, ownProperties: true })
export function assertSchema(schema: object, value: unknown, label: string): void {
  const check = ajv.compile(schema)
  if (!check(value))
    throw new Error(label + ': ' + ajv.errorsText(check.errors, { separator: '; ' }))
}
export function assertLock(value: unknown): asserts value is SourceLock {
  assertSchema(lockSchema, value, 'source-lock')
}
export function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error('Duplicate ' + label)
}
export function validateCatalog(
  catalog: unknown,
  index: unknown,
  manifest: unknown,
  lock: SourceLock,
): asserts catalog is Catalog {
  assertLock(lock)
  assertSchema(catalogSchema, catalog, 'catalog')
  assertSchema(indexSchema, index, 'gacha-index')
  assertSchema(manifestSchema, manifest, 'catalog manifest')
  const c = catalog as Catalog,
    i = index as GachaIndex,
    m = manifest as CatalogManifest
  if (stable(m.source) !== stable(lock)) throw new Error('Catalog source lock mismatch')
  unique(
    c.items.map((v) => v.id),
    'item ID',
  )
  unique(
    i.banners.map((v) => v.gachaId),
    'GachaID',
  )
  unique(
    m.origins.map((v) => v.id),
    'origin ID',
  )
  if (stable(c.items.map((v) => v.id).sort()) !== stable(m.origins.map((v) => v.id).sort()))
    throw new Error('Origin inventory mismatch')
  for (const origin of m.origins) {
    const item = c.items.find((v) => v.id === origin.id)!
    if (
      item.id !== item.kind + ':' + origin.recordKey ||
      (item.kind === 'avatar'
        ? !inputFiles.slice(0, 2).includes(origin.file as (typeof inputFiles)[0])
        : origin.file !== inputFiles[2])
    )
      throw new Error('Origin identity mismatch: ' + item.id)
  }
}

export function stable(value: unknown): string {
  function sort(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(sort)
    if (object(v))
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, sort(v[k])]),
      )
    return v
  }
  return JSON.stringify(sort(value), null, 2) + '\n'
}
export function parseSource(text: string): unknown {
  return JSON.parse(text, (key: string, value: unknown, context?: { source: string }) => {
    if (key !== 'Hash') return value
    if (!context || !/^[1-9][0-9]*$/.test(context.source))
      throw new Error('Hash requires an exact positive integer lexeme and Node 24')
    return context.source
  }) as unknown
}
export function normalizeName(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Missing TextMap name')
  const name = value
    .replace(/<\/?unbreak>/g, '')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!name || /[<>]/u.test(name)) throw new Error('Unsupported name markup: ' + name)
  return name
}
export function projectCatalog(raw: Record<string, unknown>): {
  catalog: Catalog
  index: GachaIndex
  origins: Origin[]
} {
  const zh = raw[inputFiles[4]],
    en = raw[inputFiles[5]]
  if (!object(zh) || !object(en)) throw new Error('Invalid TextMap')
  const items: WarpItem[] = [],
    origins: Origin[] = []
  for (const file of inputFiles.slice(0, 3)) {
    const rows = raw[file]
    if (!Array.isArray(rows)) throw new Error('Invalid source table: ' + file)
    const kind: WarpItemKind = file === inputFiles[2] ? 'light-cone' : 'avatar'
    for (const row of rows) {
      if (!object(row)) throw new Error('Invalid row: ' + file)
      const key = row[kind === 'avatar' ? 'AvatarID' : 'EquipmentID']
      const nameRef = row[kind === 'avatar' ? 'AvatarName' : 'EquipmentName']
      if (
        !Number.isSafeInteger(key) ||
        (key as number) <= 0 ||
        !object(nameRef) ||
        typeof nameRef.Hash !== 'string'
      )
        throw new Error('Invalid source identity: ' + file)
      const rarityMap: Record<string, 3 | 4 | 5> =
        kind === 'avatar'
          ? { CombatPowerAvatarRarityType4: 4, CombatPowerAvatarRarityType5: 5 }
          : {
              CombatPowerLightconeRarity3: 3,
              CombatPowerLightconeRarity4: 4,
              CombatPowerLightconeRarity5: 5,
            }
      const rarity = typeof row.Rarity === 'string' ? rarityMap[row.Rarity] : undefined
      if (!rarity) throw new Error('Unsupported rarity: ' + String(row.Rarity))
      const id = kind + ':' + String(key)
      items.push({
        id,
        kind,
        rarity,
        names: { 'zh-CN': normalizeName(zh[nameRef.Hash]), en: normalizeName(en[nameRef.Hash]) },
      })
      origins.push({ id, file, recordKey: String(key), nameHash: nameRef.Hash })
    }
  }
  const rows = raw[inputFiles[3]]
  if (!Array.isArray(rows)) throw new Error('Invalid GachaBasicInfo')
  const banners = rows.map((row) => {
    if (
      !object(row) ||
      !Number.isSafeInteger(row.GachaID) ||
      (row.GachaID as number) <= 0 ||
      typeof row.GachaType !== 'string' ||
      !Object.hasOwn(sourceTypes, row.GachaType)
    )
      throw new Error('Unsupported Gacha identity/type')
    return { gachaId: String(row.GachaID), kind: sourceTypes[row.GachaType]! }
  })
  unique(
    items.map((v) => v.id),
    'source item ID',
  )
  unique(
    banners.map((v) => v.gachaId),
    'source GachaID',
  )
  items.sort((a, b) => a.id.localeCompare(b.id, 'en'))
  origins.sort((a, b) => a.id.localeCompare(b.id, 'en'))
  banners.sort((a, b) => a.gachaId.localeCompare(b.gachaId, 'en'))
  return { catalog: { schemaVersion: 1, items }, index: { schemaVersion: 1, banners }, origins }
}

export interface ConfigDocument {
  value: unknown
  tree: Node
  text: string
  file: string
}
export function configError(doc: ConfigDocument, pointer: string, message: string): never {
  const parts = pointer
    .split('/')
    .slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((p) => (/^(0|[1-9][0-9]*)$/.test(p) ? Number(p) : p))
  const node = findNodeAtLocation(doc.tree, parts) ?? doc.tree
  throw new Error(
    position(doc.text, node.offset, doc.file) + ' ' + (pointer || '/') + ': ' + message,
  )
}
function position(text: string, offset: number, file: string): string {
  const before = text.slice(0, offset).split('\n')
  return `${file}:${before.length}:${before.at(-1)!.length + 1}`
}
export function parseConfig(text: string, file = 'banners.jsonc'): ConfigDocument {
  const errors: ParseError[] = []
  const tree = parseTree(text, errors, { allowTrailingComma: true, disallowComments: false })
  if (errors.length || !tree) {
    const error = errors[0]
    throw new Error(
      position(text, error?.offset ?? 0, file) +
        ': ' +
        (error ? printParseErrorCode(error.error) : 'Empty JSONC'),
    )
  }
  function visit(node: Node) {
    if (node.type === 'object') {
      const seen = new Set<string>()
      for (const p of node.children ?? []) {
        const key = String(p.children![0]!.value)
        if (seen.has(key))
          throw new Error(position(text, p.offset, file) + ': Duplicate key ' + key)
        seen.add(key)
      }
    }
    for (const child of node.children ?? []) visit(child)
  }
  visit(tree)
  return { value: getNodeValue(tree) as unknown, tree, text, file }
}
const evidence = { type: 'array', minItems: 1, uniqueItems: true, items: text }
const poolId = { type: 'string', pattern: '^[a-z][a-z0-9-]*$' }
function enumIds(ids: string[], descriptions?: string[]) {
  return ids.length
    ? {
        type: 'string',
        enum: ids,
        ...(descriptions ? { markdownEnumDescriptions: descriptions } : {}),
      }
    : {
        type: 'string',
        not: {},
        markdownDescription: '尚无兼容条目；请先维护共享候选池并重新生成 Schema。',
      }
}
export function generateSchema(
  catalog: Catalog,
  index: GachaIndex,
  lock: SourceLock,
  config: unknown,
) {
  const definitions: Record<string, unknown> = {}
  for (const kind of ['avatar', 'light-cone', 'mixed'] as const)
    for (const rarity of [3, 4, 5]) {
      const items = catalog.items.filter(
        (v) => v.rarity === rarity && (kind === 'mixed' || v.kind === kind),
      )
      definitions[`${kind}-${rarity}`] = enumIds(
        items.map((v) => v.id),
        items.map(
          (v) =>
            `**${v.names['zh-CN']} · ${v.names.en}** — ${v.kind === 'avatar' ? '角色 / Avatar' : '光锥 / Light Cone'} · ${v.rarity}★ · \`${v.id}\``,
        ),
      )
    }
  const ref = (kind: string, rarity: number) => ({ $ref: '#/definitions/' + kind + '-' + rarity })
  const list = (kind: string, rarity: number) => ({
    type: 'array',
    minItems: 1,
    uniqueItems: true,
    items: ref(kind, rarity),
  })
  const declared =
    object(config) && Array.isArray(config.sharedPools) ? config.sharedPools.filter(object) : []
  const poolBranches = (['avatar', 'light-cone', 'mixed'] as const).map((type) => ({
    ...strictObject({
      id: poolId,
      fiveStarType: { const: type },
      threeStar: list('light-cone', 3),
      fourStar: list('mixed', 4),
      fiveStar: list(type, 5),
      evidence,
    }),
    defaultSnippets: [
      {
        label: `共享候选池 (${type})`,
        body: {
          id: '${1:reviewed-pool}',
          fiveStarType: type,
          threeStar: ['${2}'],
          fourStar: ['${3}'],
          fiveStar: ['${4}'],
          evidence: ['${5}'],
        },
      },
    ],
    ...(type === 'mixed'
      ? {
          properties: {
            id: poolId,
            fiveStarType: { const: type },
            threeStar: list('light-cone', 3),
            fourStar: list('mixed', 4),
            fiveStar: {
              ...list(type, 5),
              allOf: [{ contains: ref('avatar', 5) }, { contains: ref('light-cone', 5) }],
            },
            evidence,
          },
        }
      : {}),
  }))
  const bannerBranches = kinds.map((kind) => {
    const type =
      kind === 'ordinary' ? 'mixed' : kind.endsWith('light-cone') ? 'light-cone' : 'avatar'
    const props: Record<string, unknown> = {
      gachaId: enumIds(index.banners.filter((v) => v.kind === kind).map((v) => v.gachaId)),
      kind: { const: kind },
      pityGroup: { const: 'pity:' + kind },
      sharedPool: enumIds(
        [
          ...new Set(
            declared
              .filter((p) => p.fiveStarType === type && typeof p.id === 'string')
              .map((p) => p.id as string),
          ),
        ].sort(),
      ),
      evidence,
    }
    const body: Record<string, unknown> = {
      gachaId: '${1}',
      kind,
      pityGroup: 'pity:' + kind,
      sharedPool: '${2}',
      evidence: ['${3}'],
    }
    if (kind !== 'ordinary') {
      props.up5 = ref(type, 5)
      body.up5 = '${4}'
    }
    if (kind.startsWith('event-')) {
      props.up4 = { ...list(type, 4), minItems: 3, maxItems: 3 }
      body.up4 = ['${5}', '${6}', '${7}']
    }
    return {
      ...strictObject(props),
      defaultSnippets: [{ label: kind + '（待填写真实 ID）', body }],
    }
  })
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    allowComments: true,
    allowTrailingCommas: true,
    title: 'Warp Banner Config',
    ...strictObject({
      $schema: { const: './schema/banner-config.schema.json' },
      schemaVersion: { const: VERSION },
      sourceCommit: { const: lock.commit },
      sharedPools: { type: 'array', items: { oneOf: poolBranches } },
      banners: { type: 'array', items: { oneOf: bannerBranches } },
      pending: { type: 'array', items: strictObject({ kind: { enum: kinds }, reason: text }) },
    }),
    definitions,
  }
}
export function validateConfig(
  doc: ConfigDocument,
  catalog: Catalog,
  index: GachaIndex,
  lock: SourceLock,
): BannerConfig {
  const check = ajv.compile(generateSchema(catalog, index, lock, doc.value))
  if (!check(doc.value)) {
    const errors = check.errors as ErrorObject[]
    const messages = errors.map((e) => {
      try {
        configError(doc, e.instancePath, `${e.message}; ${JSON.stringify(e.params)}`)
      } catch (error) {
        return (error as Error).message
      }
    })
    throw new Error(messages.join('\n'))
  }
  const config = doc.value as unknown as BannerConfig
  const poolIds = new Set<string>(),
    bannerIds = new Set<string>()
  for (const [i, pool] of config.sharedPools.entries()) {
    if (poolIds.has(pool.id)) configError(doc, `/sharedPools/${i}/id`, 'Duplicate pool ID')
    poolIds.add(pool.id)
  }
  for (const [i, banner] of config.banners.entries()) {
    if (bannerIds.has(banner.gachaId))
      configError(doc, `/banners/${i}/gachaId`, 'Duplicate GachaID')
    bannerIds.add(banner.gachaId)
  }
  if (!config.banners.length && !config.pending.length)
    configError(doc, '/pending', 'Empty configuration must explicitly record pending work')
  return config
}
export function snapshot(config: BannerConfig, catalog: Catalog): WarpSnapshot {
  const usedPools = new Set(config.banners.map((v) => v.sharedPool)),
    usedItems = new Set<string>()
  const sharedPools = config.sharedPools
    .filter((v) => usedPools.has(v.id))
    .map((v) => {
      const p: WarpPool = {
        id: v.id,
        fiveStarType: v.fiveStarType,
        threeStar: [...v.threeStar].sort(),
        fourStar: [...v.fourStar].sort(),
        fiveStar: [...v.fiveStar].sort(),
      }
      for (const id of [...p.threeStar, ...p.fourStar, ...p.fiveStar]) usedItems.add(id)
      return p
    })
    .sort((a, b) => a.id.localeCompare(b.id, 'en'))
  const banners = config.banners
    .map((v) => {
      const b: WarpBanner = {
        id: 'gacha:' + v.gachaId,
        gachaId: v.gachaId,
        kind: v.kind,
        pityGroup: v.pityGroup,
        sharedPool: v.sharedPool,
      }
      if (v.up5) {
        b.up5 = v.up5
        usedItems.add(v.up5)
      }
      if (v.up4) {
        b.up4 = [...v.up4].sort()
        for (const id of v.up4) usedItems.add(id)
      }
      return b
    })
    .sort((a, b) => a.gachaId.localeCompare(b.gachaId, 'en'))
  return {
    schemaVersion: 1,
    items: catalog.items.filter((v) => usedItems.has(v.id)),
    sharedPools,
    banners,
  }
}
export function findItems(
  catalog: Catalog,
  query: string,
  kind?: string,
  rarity?: number,
): WarpItem[] {
  const q = query.normalize('NFKC').toLocaleLowerCase('en').trim()
  return catalog.items.filter(
    (v) =>
      (!kind || v.kind === kind) &&
      (!rarity || v.rarity === rarity) &&
      [v.id, v.names['zh-CN'], v.names.en].some((s) =>
        s.normalize('NFKC').toLocaleLowerCase('en').includes(q),
      ),
  )
}
