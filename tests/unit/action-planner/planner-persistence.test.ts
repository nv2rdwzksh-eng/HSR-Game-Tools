import { describe, expect, it } from 'vitest'
import { effectScope, watch } from 'vue'
import { createI18n } from 'vue-i18n'
import zh from '../../../src/locales/zh-CN.json'
import en from '../../../src/locales/en.json'
import { usePlannerPresentation } from '../../../src/tools/action-planner/composables/usePlannerPresentation'
import {
  createPlannerPersistence,
  STORAGE_KEY,
} from '../../../src/tools/action-planner/model/persistence'
import {
  emptyDocument,
  serializePlannerDocument,
  parsePlannerDocument,
} from '../../../src/tools/action-planner/model/document-file'
import { useActionPlanner } from '../../../src/tools/action-planner/composables/useActionPlanner'
import { syntheticDocument } from '../../fixtures/action-planner/phase-2a-document'

function memory(raw: string | null = null) {
  return {
    raw,
    writes: 0,
    failRead: false,
    failWrite: false,
    getItem(key: string) {
      expect(key).toBe(STORAGE_KEY)
      if (this.failRead) throw new Error('SecurityError')
      return this.raw
    },
    setItem(key: string, value: string) {
      expect(key).toBe(STORAGE_KEY)
      if (this.failWrite) throw new Error('QuotaExceededError')
      this.raw = value
      this.writes++
    },
  }
}
describe('single-document persistence', () => {
  it('restores before watching and saves only shallow committed changes, including names', () => {
    const store = memory(serializePlannerDocument(syntheticDocument()))
    const persistence = createPlannerPersistence(() => store)
    const initial = persistence.initialize()
    const p = useActionPlanner(
      initial.document.plan,
      initial.document.metadata,
      initial.document.name,
    )
    const scope = effectScope()
    scope.run(() => watch(p.document, (doc) => persistence.save(doc), { flush: 'sync' }))
    expect(store.writes).toBe(0)
    p.edit()
    p.draft.value!.percent = 13
    p.view.value = 'queue'
    p.stepQueue(1)
    const language = createI18n({
      legacy: false,
      locale: 'zh-CN',
      fallbackLocale: false,
      messages: { 'zh-CN': zh, en },
    })
    const presentation = usePlannerPresentation(p.document, language.global.locale, (key, params) =>
      language.global.t(key, params ?? {}),
    )
    const label = presentation.label('editor-1')
    language.global.locale.value = 'en'
    expect(presentation.label('editor-1')).not.toBe(label)
    expect(store.writes).toBe(0)
    const result = p.result.value
    p.rename('Renamed')
    expect(store.writes).toBe(1)
    expect(p.result.value).toBe(result)
    p.select({ kind: 'start' })
    p.edit()
    p.draft.value!.selectedIds = ['enemy-1']
    expect(p.submit()).toBe(true)
    expect(store.writes).toBe(2)
    expect(createPlannerPersistence(() => store).initialize().document).toEqual(p.document.value)
    scope.stop()
    p.rename('After dispose')
    expect(store.writes).toBe(2)
  })
  it.each([
    '{',
    JSON.stringify({ format: 'hsr-game-tools/action-planner', version: 99, document: {} }),
  ])('protects unreadable and unsupported storage: %s', (raw) => {
    const store = memory(raw)
    const persistence = createPlannerPersistence(() => store)
    expect(persistence.initialize().document).toEqual(emptyDocument())
    expect(persistence.status).toBe('protected')
    expect(persistence.save(syntheticDocument())).toBe(false)
    expect(store.raw).toBe(raw)
    expect(store.writes).toBe(0)
    const token = persistence.capture()!
    expect(persistence.overwrite(syntheticDocument(), token)).toBe(true)
    expect(persistence.status).toBe('saved')
  })
  it('keeps protection through temporary access failures and exposes read/write failures', () => {
    const store = memory('{')
    const persistence = createPlannerPersistence(() => store)
    persistence.initialize()
    store.failRead = true
    expect(persistence.capture()).toBeUndefined()
    expect(persistence.status).toBe('unavailable')
    store.failRead = false
    expect(persistence.guarded).toBe(true)
    expect(persistence.save(emptyDocument())).toBe(false)
    store.failWrite = true
    expect(persistence.overwrite(emptyDocument(), persistence.capture()!)).toBe(false)
    expect(persistence.status).toBe('failed')
    expect(store.raw).toBe('{')
    store.failWrite = false
    expect(persistence.overwrite(emptyDocument(), persistence.capture()!)).toBe(true)
    const unavailable = createPlannerPersistence(() => {
      throw new Error('SecurityError')
    })
    expect(unavailable.initialize().document).toEqual(emptyDocument())
    expect(unavailable.status).toBe('unavailable')
  })
  it('detects external modifications before writing and requires a current overwrite token', () => {
    const store = memory(serializePlannerDocument(emptyDocument()))
    const persistence = createPlannerPersistence(() => store)
    persistence.initialize()
    const external = serializePlannerDocument(syntheticDocument())
    store.raw = external
    expect(persistence.save(emptyDocument())).toBe(false)
    expect(persistence.status).toBe('external')
    expect(store.raw).toBe(external)
    const token = persistence.capture()!
    store.raw = external + '\n'
    expect(persistence.overwrite(emptyDocument(), token)).toBe(false)
    expect(store.writes).toBe(0)
    expect(persistence.overwrite(emptyDocument(), persistence.capture()!)).toBe(true)
  })
  it('reloads without writing and refuses stale or invalid reloads', () => {
    const store = memory(serializePlannerDocument(emptyDocument()))
    const persistence = createPlannerPersistence(() => store)
    persistence.initialize()
    const p = useActionPlanner()
    store.raw = serializePlannerDocument(syntheticDocument())
    persistence.externalChange(STORAGE_KEY, store.raw)
    const token = persistence.capture()!
    expect(persistence.reload((doc) => p.restoreDocument(doc), token)).toBeTruthy()
    expect(p.document.value).toEqual(syntheticDocument())
    expect(store.writes).toBe(0)
    const previous = p.document.value
    store.raw = '{'
    expect(persistence.reload((doc) => p.restoreDocument(doc), token)).toBe(false)
    expect(p.document.value).toBe(previous)
    expect(persistence.reload((doc) => p.restoreDocument(doc))).toBe(false)
    expect(persistence.guarded).toBe(true)
  })
  it('treats external clearing as a conflict and saves a new empty document without resurrection', () => {
    const store = memory(serializePlannerDocument(syntheticDocument()))
    const persistence = createPlannerPersistence(() => store)
    persistence.initialize()
    store.raw = null
    persistence.externalChange(null, null)
    expect(persistence.save(syntheticDocument())).toBe(false)
    expect(store.raw).toBeNull()
    const p = useActionPlanner()
    const token = persistence.capture()!
    persistence.withoutSaving(() => p.reset())
    persistence.overwrite(p.document.value, token)
    expect(parsePlannerDocument(store.raw!).document).toEqual(emptyDocument())
    expect(createPlannerPersistence(() => store).initialize().document).toEqual(emptyDocument())
  })
})
