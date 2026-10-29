import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { toolCatalog } from '../../../src/tools/catalog'

describe('Warp UI feature and route boundaries', () => {
  it('opens the homepage entry through a lazy route without changing the planner route', () => {
    expect(toolCatalog.find((v) => v.id === 'warp')?.route).toBe('/warp-simulator')
    expect(toolCatalog.find((v) => v.id === 'actionOrder')?.route).toBe('/action-planner')
    const router = readFileSync(new URL('../../../src/router/index.ts', import.meta.url), 'utf8')
    expect(router).toMatch(
      /path: '\/warp-simulator',[\s\S]*?component: \(\) => import\('\.\.\/tools\/warp-simulator\/WarpSimulatorPage.vue'\)/,
    )
    expect(router).toMatch(
      /component: \(\) => import\('\.\.\/tools\/action-planner\/ActionPlannerPage.vue'\)/,
    )
    expect(router).toContain("meta: { title: 'warp.title' }")
  })
  it('isolates affinity storage and does not import planner internals, raw sources or another business store', () => {
    const root = fileURLToPath(new URL('../../../src/tools/warp-simulator/', import.meta.url))
    for (const file of readdirSync(root, { recursive: true }).filter(
      (v) => typeof v === 'string' && /\.(?:ts|vue)$/.test(v),
    )) {
      const source = readFileSync(root + file, 'utf8')
      expect(source).not.toMatch(
        /(?:from\s*|import\s*\()['"][^'"]*(?:action-planner|TurnBasedGameData|StarRailRes|pinia|node:)/,
      )
      expect(source).not.toMatch(/\b(?:sessionStorage|indexedDB|fetch)\b/)
      if (file.toString().replaceAll('\\', '/') !== 'model/affinity-persistence.ts')
        expect(source).not.toMatch(/\blocalStorage\b/)
    }
  })
})
