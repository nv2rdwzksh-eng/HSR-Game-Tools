import { mkdir, rename, rm, lstat } from 'node:fs/promises'
import path from 'node:path'
import { inside } from './files'

async function exists(file: string) {
  try {
    const stat = await lstat(file)
    if (stat.isSymbolicLink()) throw new Error('Refuse output symlink')
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
/** Manifest is installed last. Any failed move restores both previous output directories. */
export async function publishSnapshot(
  root: string,
  staging: string,
  runId: string,
  afterAssets?: () => void,
) {
  const backup = inside(root, '.game-data-backup/' + runId)
  const pairs = [
    {
      target: inside(root, 'public/game-assets'),
      source: inside(staging, 'public/game-assets'),
      saved: path.join(backup, 'assets'),
    },
    {
      target: inside(root, 'src/tools/action-planner/data/game'),
      source: inside(staging, 'src/tools/action-planner/data/game'),
      saved: path.join(backup, 'data'),
    },
  ]
  await mkdir(backup, { recursive: true })
  const moved: typeof pairs = []
  const installed: typeof pairs = []
  try {
    for (const p of pairs)
      if (await exists(p.target)) {
        await rename(p.target, p.saved)
        moved.push(p)
      }
    for (const p of pairs) {
      await mkdir(path.dirname(p.target), { recursive: true })
      await rename(p.source, p.target)
      installed.push(p)
      if (p === pairs[0]) afterAssets?.()
    }
  } catch (error) {
    for (const p of installed.reverse()) await rm(p.target, { recursive: true, force: true })
    for (const p of moved.reverse()) await rename(p.saved, p.target)
    throw error
  }
  await rm(backup, { recursive: true, force: true })
}
