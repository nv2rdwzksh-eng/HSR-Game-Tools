import { ordinaryNode } from '../../fixtures/action-planner/ordinary-node'
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createCharacterSearch } from '../../../src/tools/action-planner/model/character-search'
import { formatAV } from '../../../src/tools/action-planner/model/presentation'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { isReactive } from 'vue'
import { createI18n } from 'vue-i18n'
import { cases } from '../../fixtures/action-planner/action-planner-cases'
import type { CharacterRecord } from '../../../src/tools/action-planner/data/schema'

describe('independent tool boundaries', () => {
  it('keeps the engine isolated from UI, loaders and platform APIs', () => {
    const dir = fileURLToPath(new URL('../../../src/tools/action-planner/engine/', import.meta.url))
    for (const file of readdirSync(dir)) {
      const text = readFileSync(dir + '/' + file, 'utf8')
      expect(text).not.toMatch(
        /(?:from\s*|import\s*\()['"](?:vue|vue-router|vue-i18n|node:|\$lib|@\/|.*\.vue)/,
      )
      expect(text).not.toMatch(/\b(?:document|window|localStorage|fetch)\b/)
      for (const match of text.matchAll(/from\s*['"]([^'"]+)['"]/g))
        expect(match[1]).toMatch(/^\.\//)
    }
  })
  it('searches normalized names and classified aliases with deterministic ranking', () => {
    const c = (
      id: string,
      name: string,
      official: string[] = [],
      player: string[] = [],
    ): CharacterRecord => ({
      id,
      names: { 'zh-CN': name, en: name },
      aliases: { 'zh-CN': { official, player }, en: { official, player } },
      form: { pathCode: 'test' },
    })
    const rows = [
      c('1', 'Other', [], ['Trail-Blazer']),
      c('2', 'Trail Blazer'),
      c('3', 'Third', ['Trail Blazer']),
      c('4', 'Trail Blazer Extra'),
    ]
    const search = createCharacterSearch(rows, 'en')
    expect(search('ＴＲＡＩＬ—ＢＬＡＺＥＲ').map((c) => c.id)).toEqual(['2', '3', '1', '4'])
    expect(search('lazer').map((c) => c.id)).toEqual(['2', '4', '3', '1'])
    expect(search('')).toEqual(rows)
    expect(search('missing')).toEqual([])
  })
  it.each(['zh-CN', 'en'] as const)('formats only for display (%s)', (locale) => {
    expect(formatAV(10000 / 134, locale)).toBe(
      new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        10000 / 134,
      ),
    )
    expect(formatAV(-0.0049, locale, true)).toBe('0.00')
    expect(formatAV(-0.005, locale, true)).toBe('-0.01')
  })
  it('owns state per page and language switching does not mutate or recompute its engine result', () => {
    const first = useActionPlanner(cases.natural)
    const second = useActionPlanner(cases.finite)
    const old = first.result.value
    const language = createI18n({
      legacy: false,
      locale: 'zh-CN',
      messages: { 'zh-CN': {}, en: {} },
    })
    language.global.locale.value = 'en'
    expect(first.result.value).toBe(old)
    expect(isReactive(first.result.value)).toBe(false)
    first.replacePlan(cases.post)
    expect(
      first.result.value.records.find(
        (r) => ordinaryNode(r).id === 'a' && r.anchor.kind === 'action' && r.anchor.turn === 2,
      )?.elapsedAV,
    ).toBe(110)
    expect(second.result.value.stopReason).toBe('empty')
  })
})
