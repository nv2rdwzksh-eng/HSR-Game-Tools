import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import zhCN from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import {
  rarityColorVariable,
  resultTooltip,
} from '../../../src/tools/warp-simulator/components/result-presentation'
import { contrastRatio } from '../../../src/tools/warp-simulator/model/color'
import { warpVisualTokens } from '../../../src/theme/preset'
import type { ItemPresentation } from '../../../src/tools/warp-simulator/model/presentation'

const character: ItemPresentation = {
  id: 'fixture',
  name: '真珠',
  kind: 'avatar',
  pathName: '欢愉',
  elementName: '冰',
}
describe('Result tooltip and shared rarity presentation', () => {
  it.each(['zh-CN', 'en'])('renders three independent lines in %s', (locale) => {
    const { global } = createI18n({ legacy: false, locale, messages: { 'zh-CN': zhCN, en } })
    const tooltip = resultTooltip(character, 5, global.t)
    const lines = tooltip.split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(locale === 'zh-CN' ? '真珠（欢愉·冰）' : '真珠 (欢愉 · 冰)')
    expect(lines[1]).toBe(global.t('warp.resultTooltip.rarity', { count: 5 }))
    expect(lines[2]).toBe(
      global.t('warp.resultTooltip.kind', { kind: global.t('warp.itemKind.avatar') }),
    )
    const cone = resultTooltip(
      { ...character, name: '舞！舞！舞！', kind: 'light-cone', pathName: '同谐' },
      4,
      global.t,
    )
    expect(cone.split('\n')[0]).toBe(
      locale === 'zh-CN' ? '舞！舞！舞！（同谐）' : '舞！舞！舞！ (同谐)',
    )
    expect(cone).not.toContain('冰')
  })
  it('omits absent metadata and dangling separators while retaining literal untrusted names', () => {
    const { global } = createI18n({ legacy: false, locale: 'zh-CN', messages: { 'zh-CN': zhCN } })
    expect(
      resultTooltip({ ...character, elementName: undefined }, 3, global.t).split('\n')[0],
    ).toBe('真珠（欢愉）')
    expect(resultTooltip({ ...character, pathName: undefined }, 3, global.t).split('\n')[0]).toBe(
      '真珠（冰）',
    )
    const name = '<img src=x onerror=alert(1)> & "name"'
    expect(resultTooltip({ id: 'missing', name }, 3, global.t).split('\n')[0]).toBe(name)
  })
  it('maps card/history colors to the same rarity tokens with readable text contrast', () => {
    for (const rarity of [3, 4, 5] as const) {
      expect(rarityColorVariable(rarity)).toBe(`var(--p-warp-rarity-${rarity})`)
      expect(
        contrastRatio(warpVisualTokens[`rarity${rarity}`], warpVisualTokens.surface),
      ).toBeGreaterThanOrEqual(4.5)
    }
  })
})
