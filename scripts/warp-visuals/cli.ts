import { fileURLToPath } from 'node:url'
import { updateVisuals, validateVisuals } from './pipeline'
const root = fileURLToPath(new URL('../../', import.meta.url))
const args = process.argv.slice(2)
try {
  if (args.join(' ') === '--check') console.log(await validateVisuals(root))
  else if (
    args.length === 4 &&
    args[0] === '--source' &&
    args[1] === 'local' &&
    args[2] === '--root' &&
    args[3]
  )
    console.log(await updateVisuals(root, args[3]))
  else throw new Error('Usage: --check | --source local --root <StarRailRes Git root>')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
