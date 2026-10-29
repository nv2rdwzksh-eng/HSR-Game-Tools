import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('isolates the Warp engine from UI, loaders, raw JSON and other tools', () => {
  const dir = fileURLToPath(new URL('../../../src/tools/warp-simulator/engine/', import.meta.url))
  for (const file of readdirSync(dir).filter((v) => v.endsWith('.ts'))) {
    const source = readFileSync(`${dir}/${file}`, 'utf8')
    expect(source).not.toMatch(
      /\b(?:window|document|localStorage|fetch|require)\b|\.json['"]|import\s*\(/,
    )
    for (const match of source.matchAll(
      /\bimport\s+(type\s+)?(?:[^'"]*?\bfrom\s*)?['"]([^'"]+)['"]/g,
    )) {
      const [, typeOnly, path] = match
      if (path === '../data/schema') expect(typeOnly).toBe('type ')
      else expect(path).toMatch(/^\.\/[\w-]+$/)
    }
  }
})
