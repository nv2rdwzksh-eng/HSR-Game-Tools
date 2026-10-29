import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { digest, readJson, validateGameFiles } from './game-data/files'
import type { SourceLock } from './game-data/projection'
const root = fileURLToPath(new URL('../', import.meta.url))
const lock = await readJson<SourceLock>(
  fileURLToPath(new URL('./game-data/source-lock.json', import.meta.url)),
)
const overlaySha256 = digest(await readFile(new URL('./game-data/overlays.json', import.meta.url)))
console.log(await validateGameFiles(root, lock, overlaySha256))
