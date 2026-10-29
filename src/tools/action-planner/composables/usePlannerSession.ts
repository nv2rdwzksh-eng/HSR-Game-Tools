import { ref, watch, onScopeDispose } from 'vue'
import {
  createPlannerPersistence,
  type PlannerStorage,
  type SaveStatus,
} from '../model/persistence'
import { useActionPlanner } from './useActionPlanner'

/** Restore before registering a shallow commit watcher; never autosave a startup default. */
export function usePlannerSession(storage: () => PlannerStorage = () => window.localStorage) {
  const saveStatus = ref<SaveStatus>('idle')
  const persistence = createPlannerPersistence(storage, (status) => {
    saveStatus.value = status
  })
  const initial = persistence.initialize()
  const planner = useActionPlanner(
    initial.document.plan,
    initial.document.metadata,
    initial.document.name,
  )
  planner.resourceIssues.value = initial.issues
  planner.migrationNotice.value = initial.migration
  const stop = watch(planner.document, (document) => persistence.save(document), { flush: 'sync' })
  const handleStorage = (event: StorageEvent) => {
    try {
      if (event.storageArea !== window.localStorage) return
    } catch {
      return
    }
    persistence.externalChange(event.key, event.newValue)
  }
  window.addEventListener('storage', handleStorage)
  onScopeDispose(() => {
    stop()
    window.removeEventListener('storage', handleStorage)
  })
  return { planner, persistence, saveStatus }
}
