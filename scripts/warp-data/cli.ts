import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import {
  buildSnapshot,
  generateLocalSchema,
  loadCatalog,
  updateCatalog,
  validateData,
} from './pipeline'
import { findItems } from './model'

const root = fileURLToPath(new URL('../../', import.meta.url))
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: 'string' },
      root: { type: 'string' },
      kind: { type: 'string' },
      rarity: { type: 'string' },
    },
  })
  const [command, ...query] = positionals
  if (command !== 'update-catalog' && (values.source || values.root))
    throw new Error('--source/--root are only available to update:warp-catalog')
  if (command !== 'find' && (query.length || values.kind || values.rarity))
    throw new Error('Unexpected query arguments')
  switch (command) {
    case 'update-catalog':
      if (values.source !== 'local' || !values.root)
        throw new Error(
          'Usage: update:warp-catalog -- --source local --root <TurnBasedGameData Git root>',
        )
      console.log(await updateCatalog(root, values.root))
      break
    case 'generate-schema':
      console.log(await generateLocalSchema(root))
      break
    case 'build':
      console.log(await buildSnapshot(root))
      break
    case 'validate':
      console.log(await validateData(root))
      break
    case 'find': {
      if (values.kind && !['avatar', 'light-cone'].includes(values.kind))
        throw new Error('--kind must be avatar or light-cone')
      if (values.rarity && !['3', '4', '5'].includes(values.rarity))
        throw new Error('--rarity must be 3, 4 or 5')
      if (!query.length && !values.kind && !values.rarity)
        throw new Error('Supply a name/ID query or --kind/--rarity filter')
      const { catalog } = await loadCatalog(root)
      const rows = findItems(
        catalog,
        query.join(' '),
        values.kind,
        values.rarity ? Number(values.rarity) : undefined,
      )
      for (const v of rows)
        console.log(`${v.id}\t${v.rarity}★\t${v.kind}\t${v.names['zh-CN']}\t${v.names.en}`)
      if (!rows.length) console.log('No matching item IDs.')
      break
    }
    default:
      throw new Error('Unknown Warp data command')
  }
} catch (error) {
  console.error((error as Error).message)
  process.exitCode = 1
}
