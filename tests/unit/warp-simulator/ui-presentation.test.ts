import { describe, expect, it } from 'vitest'
import { createI18n } from 'vue-i18n'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import zhCN from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import visuals from '../../../src/tools/warp-simulator/data/visuals/catalog.json'
import manifest from '../../../src/tools/warp-simulator/data/visuals/manifest.json'
import sourceLock from '../../../scripts/warp-visuals/source-lock.json'
import {
  warpSnapshot,
  warpManifest,
  warpVisuals,
  warpVisualDefinitions,
} from '../../../src/tools/warp-simulator/data/adapters/warp-data'
import {
  createPresentation,
  pityRows,
  portraitUrl,
} from '../../../src/tools/warp-simulator/model/presentation'
import { createSessionState } from '../../../src/tools/warp-simulator/engine/state'
import { fixture } from '../../fixtures/warp-simulator/fixture'
import type { ToolLocale } from '../../../src/locales/types'

describe('Warp presentation and checked local assets', () => {
  it('covers only reachable items with checked original paths and shared portraits', () => {
    expect(Object.keys(warpVisuals)).toEqual(warpSnapshot.items.map((item) => item.id))
    expect(Object.keys(warpVisuals)).toHaveLength(warpManifest.counts.items)
    expect(manifest.source.commit).toBe(sourceLock.commit)
    expect(manifest.snapshotSha256).toBe(
      createHash('sha256')
        .update(
          readFileSync(
            new URL(
              '../../../src/tools/warp-simulator/data/runtime/snapshot.json',
              import.meta.url,
            ),
          ),
        )
        .digest('hex'),
    )
    expect(manifest.missingAssets).toEqual([])
    for (const metadata of Object.values(warpVisuals)) {
      for (const file of [metadata.portraitPath, metadata.artworkPath].filter(Boolean))
        expect(existsSync(new URL('../../../public/' + file, import.meta.url))).toBe(true)
    }
    expect(Object.keys(visuals.paths)).toHaveLength(9)
    expect(Object.keys(visuals.elements)).toHaveLength(7)
  })
  it('serves every current candidate and UP item through the common adapter with checked resource bytes', () => {
    for (const [file, metadata] of Object.entries(manifest.files)) {
      const bytes = readFileSync(new URL('../../../' + file, import.meta.url))
      expect(bytes.length).toBe(metadata.bytes)
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(metadata.sha256)
    }
    const adapter = createPresentation(warpSnapshot, warpVisuals, '/tools/', warpVisualDefinitions)
    for (const source of warpSnapshot.items) {
      for (const locale of ['zh-CN', 'en'] as const) {
        const item = adapter.item(source.id, locale)
        expect(item.name).toBe(source.names[locale])
        expect(item.artworkUrl).toMatch(/^\/tools\/game-assets\/warp\//)
        expect(item.revealArtwork?.url).toMatch(/^\/tools\/game-assets\/warp\//)
        expect(item.pathName).toBeTruthy()
        expect(item.pathIconUrl).toBeTruthy()
        expect(item.revealPathIcon?.url).toBeTruthy()
        expect(item.starsUrl).toBeTruthy()
        expect(item.cardStars?.url).toBeTruthy()
        if (source.kind === 'avatar') {
          expect(item.portraitUrl).toMatch(/^\/tools\/game-assets\/character\//)
          expect(item.elementName).toBeTruthy()
          expect(item.elementIconUrl).toBeTruthy()
        } else {
          expect(item.element).toBeUndefined()
        }
      }
    }
  })
  it('uses Warp localized names and optional visuals independently of engine identity', () => {
    const adapter = createPresentation(warpSnapshot, warpVisuals, '/tools/', warpVisualDefinitions)
    expect(adapter.item('avatar:1503', 'zh-CN')).toMatchObject({
      id: 'avatar:1503',
      name: '真珠',
      path: 'Elation',
      portraitUrl: '/tools/game-assets/character/1503.webp',
    })
    expect(adapter.item('avatar:1503', 'zh-CN')).toMatchObject({
      element: 'Ice',
      pathName: '欢愉',
      elementName: '冰',
    })
    expect(adapter.item('avatar:1503', 'en').name).toBe(
      warpSnapshot.items.find((v) => v.id === 'avatar:1503')!.names.en,
    )
    expect(adapter.item('light-cone:20000', 'zh-CN')).toMatchObject({
      kind: 'light-cone',
      rarity: 3,
    })
    expect(adapter.item('light-cone:20000', 'zh-CN').artworkUrl).toMatch(
      /^\/tools\/game-assets\/warp\//,
    )
  })
  it('keeps unknown path/element neutral and never shows light-cone elements or invented images', () => {
    const adapter = createPresentation(fixture(), {
      'avatar:1': { path: 'Unknown', element: 'Unknown' },
      'avatar:2': {
        path: 'Mage',
        element: 'Fire',
        portraitPath: 'game-assets/character/1003.webp',
      },
      'light-cone:1': { path: 'Rogue', element: 'Fire' },
    })
    expect(adapter.item('avatar:1', 'en')).toMatchObject({
      path: undefined,
      element: undefined,
      portraitUrl: undefined,
    })
    expect(adapter.item('avatar:2', 'en')).toMatchObject({ path: 'Mage', element: 'Fire' })
    expect(adapter.item('light-cone:1', 'en')).toMatchObject({
      path: 'Rogue',
      element: undefined,
      portraitUrl: undefined,
    })
    expect(adapter.item('avatar:999', 'en')).toMatchObject({
      id: 'avatar:999',
      name: 'avatar:999',
      kind: undefined,
      rarity: undefined,
      path: undefined,
      element: undefined,
      portraitUrl: undefined,
    })
  })
  it.each([
    undefined,
    '',
    'https://example.invalid/image.png',
    '/game-assets/a.webp',
    'game-assets/../a.webp',
    'game-assets/./a.webp',
    'game-assets//a.webp',
    'game-assets/a.webp?x=1',
    'game-assets/%2e%2e/a.webp',
    'game-assets\\a.webp',
  ])('does not construct unsafe or missing image URLs: %s', (path) => {
    expect(portraitUrl(path, '/sub/')).toBeUndefined()
  })
  it('maps root and subpath URLs without changing the resource identity', () => {
    expect(portraitUrl('game-assets/character/1003.webp', '/')).toBe(
      '/game-assets/character/1003.webp',
    )
    expect(portraitUrl('game-assets/character/1003.webp', '/tools')).toBe(
      '/tools/game-assets/character/1003.webp',
    )
  })
  it('searches both languages and stable IDs with normalized case/width', () => {
    const snapshot = fixture()
    snapshot.items[0].names = { 'zh-CN': '合成角色', en: 'Synthetic Character' }
    const adapter = createPresentation(snapshot),
      ids = ['avatar:1', 'avatar:2']
    expect(adapter.search(ids, '合成角色')).toEqual(['avatar:1'])
    expect(adapter.search(ids, 'ＳＹＮＴＨＥＴＩＣ ＣＨＡＲＡＣＴＥＲ')).toEqual(['avatar:1'])
    expect(adapter.search(ids, 'AVATAR:1')).toEqual(['avatar:1'])
    expect(adapter.search(ids, '')).toEqual(ids)
  })
  it('keeps all four pity rows tied to state, with neutral inapplicable guarantees', () => {
    const pity = {
      ...createSessionState().groups['pity:event-avatar'],
      pullsSinceLast5: 73,
      pullsSinceLast4: 9,
      guaranteed5: true,
      guaranteed4: true,
    }
    expect(pityRows(pity, true, true)).toEqual([
      { key: 'fiveCount', count: 73 },
      { key: 'fiveGuarantee', status: 'guaranteed' },
      { key: 'fourCount', count: 9, pending: true },
      { key: 'fourGuarantee', status: 'guaranteed' },
    ])
    expect(
      pityRows({ ...pity, guaranteed5: false, guaranteed4: false }, false, false)[1].status,
    ).toBe('unavailable')
    expect(pityRows({ ...pity, guaranteed4: false }, true, false)[3].status).toBe('unavailable')
  })
  it('renders new messages and metadata labels in both languages without unresolved keys', () => {
    const { global } = createI18n({
      legacy: false,
      locale: 'zh-CN',
      fallbackLocale: false,
      messages: { 'zh-CN': zhCN, en },
    })
    for (const locale of ['zh-CN', 'en'] as ToolLocale[]) {
      global.locale.value = locale
      expect(global.t('warp.title')).toBe(global.t('home.tools.warp.title'))
      for (const [key, params] of [
        ['warp.selection.count', { count: 7 }],
        ['warp.completed', { count: 10 }],
        ['warp.history.page', { current: 1, total: 40 }],
        ['warp.visual.missingImage', { name: 'test' }],
        ['warp.reset.groupConfirm', {}],
        ['warp.reset.allConfirm', {}],
      ] as const)
        expect(global.t(key, params)).not.toMatch(/\{|warp\./)
      expect(global.t('warp.pity.fourPending')).toContain('9+')
      for (const code of Object.keys(zhCN.warp.error))
        expect(global.t(`warp.error.${code}`)).not.toContain('warp.error.')
    }
  })
})
