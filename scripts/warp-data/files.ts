import { createHash, randomUUID } from 'node:crypto'
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { stable, type FileMeta } from './model'

export const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
export const metadata = (bytes: string | Buffer): FileMeta => ({
  bytes: Buffer.byteLength(bytes),
  sha256: digest(bytes),
})
export async function exists(file: string) {
  try {
    await lstat(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false
    throw error
  }
}
/** Reject symlinks in every existing component, including intermediate output directories. */
export async function inside(root: string, relative: string): Promise<string> {
  if (
    !relative ||
    path.isAbsolute(relative) ||
    relative.includes('\\') ||
    relative.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw new Error('Unsafe relative path')
  const base = path.resolve(root)
  let file = base
  for (const part of relative.split('/')) {
    file = path.join(file, part)
    if ((await exists(file)) && (await lstat(file)).isSymbolicLink())
      throw new Error('Refuse symlink: ' + file)
  }
  return file
}
export async function readBytes(root: string, relative: string) {
  return readFile(await inside(root, relative))
}
export async function readJson(root: string, relative: string): Promise<unknown> {
  return JSON.parse((await readBytes(root, relative)).toString('utf8')) as unknown
}
export async function writeJson(root: string, relative: string, value: unknown) {
  const file = await inside(root, relative)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, stable(value), { flag: 'wx' })
}
export async function verifyFiles(
  dir: string,
  inventory: Record<string, FileMeta>,
  extra: string[] = [],
) {
  const actual = (await readdir(dir)).sort()
  const expected = [...Object.keys(inventory), ...extra].sort()
  if (stable(actual) !== stable(expected)) throw new Error('Unexpected file inventory: ' + dir)
  for (const [file, meta] of Object.entries(inventory)) {
    const bytes = await readBytes(dir, file)
    if (stable(metadata(bytes)) !== stable(meta)) throw new Error('Checksum mismatch: ' + file)
  }
}
class RecoveryError extends AggregateError {}
export type PublishHook = (phase: 'after-backup' | 'after-install') => void
export async function publishDirectory(
  root: string,
  relative: string,
  stage: string,
  runId: string,
  hook?: PublishHook,
) {
  const target = await inside(root, relative)
  const backup = await inside(root, '.warp-data-backup/' + runId)
  if (await exists(backup)) throw new Error('Refuse existing backup')
  await mkdir(path.dirname(backup), { recursive: true })
  await mkdir(path.dirname(target), { recursive: true })
  let saved = false,
    installed = false
  try {
    if (await exists(target)) {
      await rename(target, backup)
      saved = true
    }
    hook?.('after-backup')
    await rename(stage, target)
    installed = true
    hook?.('after-install')
  } catch (error) {
    try {
      if (installed) await rm(target, { recursive: true, force: true })
      if (saved) await rename(backup, target)
    } catch (recovery) {
      throw new RecoveryError(
        [error, recovery],
        'Rollback failed; preserve lock, staging and backup for manual recovery',
      )
    }
    throw error
  }
  if (saved) {
    try {
      await rm(backup, { recursive: true, force: true })
    } catch {
      console.warn('Published successfully; old backup requires manual cleanup: ' + backup)
    }
  }
}
export async function transaction<T>(
  root: string,
  operation: (stage: string, runId: string) => Promise<T>,
): Promise<T> {
  const guard = await inside(root, '.warp-data-staging/update.lock')
  await mkdir(path.dirname(guard), { recursive: true })
  const runId = randomUUID()
  await writeFile(guard, runId, { flag: 'wx' })
  const stage = await inside(root, '.warp-data-staging/' + runId)
  let recoveryFailed = false
  try {
    await mkdir(stage)
    return await operation(stage, runId)
  } catch (error) {
    recoveryFailed = error instanceof RecoveryError
    throw error
  } finally {
    if (!recoveryFailed) {
      try {
        await rm(stage, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
        await rm(guard)
      } catch {
        // Publication has already succeeded or rolled back. A cleanup failure must not
        // report a failed generation after successfully replacing a valid snapshot.
        console.warn('Warp cleanup requires manual inspection; preserve run ' + runId)
      }
    }
  }
}
export async function publishSchema(root: string, create: () => Promise<unknown>) {
  return transaction(root, async (stage) => {
    const schema = await create()
    const file = await inside(root, 'scripts/warp-data/schema/banner-config.schema.json')
    await mkdir(path.dirname(file), { recursive: true })
    await writeJson(stage, 'schema.json', schema)
    // Same filesystem: rename replaces the single existing file, or leaves it untouched on failure.
    await rename(path.join(stage, 'schema.json'), file)
    return schema
  })
}
