import { computed, reactive, ref, shallowRef } from 'vue'
import type { OptimizationRequest, OptimizationResult, Snapshot, Task } from '../types'
import { evaluateLineup } from '../evaluate'
import type { WorkerFactory, WorkerFailure, WorkerPort } from '../browser/protocol'
import { validateRequest } from '../validation'

export interface SolverForm {
  objective: OptimizationRequest['objective']
  slots: number
  emblemBudget: number
  includeExperts: boolean
  taskIds: string[]
}
export type FormField = 'slots' | 'emblemBudget' | 'taskIds' | 'objective'
export interface SolvedAttempt {
  requestId: number
  request: OptimizationRequest
  result: OptimizationResult
}
export function formErrors(form: SolverForm, tasks: Task[]): FormField[] {
  const errors: FormField[] = []
  if (!['min-roles', 'min-emblems'].includes(form.objective)) errors.push('objective')
  if (!Number.isSafeInteger(form.slots) || form.slots < 1 || form.slots > 13) errors.push('slots')
  if (!Number.isSafeInteger(form.emblemBudget) || form.emblemBudget < 12 || form.emblemBudget > 39)
    errors.push('emblemBudget')
  if (
    !form.taskIds.length ||
    new Set(form.taskIds).size !== form.taskIds.length ||
    form.taskIds.some((id) => !tasks.some((t) => t.id === id))
  )
    errors.push('taskIds')
  return errors
}
export function requestFingerprint(request: OptimizationRequest) {
  return JSON.stringify([
    request.objective,
    request.slots,
    request.emblemBudget,
    request.timeLimitSeconds,
    request.includeExperts,
    request.tasks
      .map((t) => [t.id, t.traitId, t.requiredCount])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  ])
}

// Compare wire data independent of object property order, without trusting a valid flag.
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (Array.isArray(a))
    return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]))
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const left = a as Record<string, unknown>
    const right = b as Record<string, unknown>
    return (
      Object.keys(left).length === Object.keys(right).length &&
      Object.keys(left).every(
        (key) => Object.hasOwn(right, key) && sameValue(left[key], right[key]),
      )
    )
  }
  return false
}

/** Page-owned state; only a detached request and plain snapshot cross the Worker boundary. */
export function createCurrencyWarsSession(
  snapshot: Snapshot,
  tasks: Task[],
  createWorker: WorkerFactory,
) {
  const form = reactive<SolverForm>({
    objective: 'min-roles',
    slots: 13,
    emblemBudget: 18,
    includeExperts: false,
    taskIds: [],
  })
  const busy = ref(false)
  const attempted = ref(false)
  const cancelled = ref(false)
  const failure = shallowRef<WorkerFailure | 'input' | 'data'>()
  const lastAttempt = shallowRef<SolvedAttempt>()
  const lastValid = shallowRef<SolvedAttempt>()
  const runningRequest = shallowRef<OptimizationRequest>()
  const errors = computed(() => formErrors(form, tasks))
  let sequence = 0
  let activeId: number | undefined
  let worker: WorkerPort | undefined
  let disposed = false
  const request = (): OptimizationRequest => ({
    objective: form.objective,
    slots: form.slots,
    emblemBudget: form.emblemBudget,
    timeLimitSeconds: 60,
    includeExperts: form.includeExperts,
    tasks: tasks.filter((t) => form.taskIds.includes(t.id)).map((t) => ({ ...t })),
  })
  const stale = computed(
    () =>
      !!lastValid.value &&
      (errors.value.length > 0 ||
        requestFingerprint(lastValid.value.request) !== requestFingerprint(request())),
  )
  const historical = computed(
    () =>
      !!lastValid.value &&
      (busy.value ||
        cancelled.value ||
        !!failure.value ||
        lastAttempt.value?.requestId !== lastValid.value.requestId),
  )

  function release() {
    if (worker) {
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
      worker = undefined
    }
    activeId = undefined
    busy.value = false
    runningRequest.value = undefined
  }
  function fail(id: number, code: WorkerFailure) {
    if (disposed || activeId !== id) return
    failure.value = code
    release()
  }
  function start() {
    if (disposed || busy.value) return false
    attempted.value = true
    cancelled.value = false
    if (errors.value.length) {
      failure.value = 'input'
      return false
    }
    const submitted = request()
    try {
      validateRequest(snapshot, submitted, true)
    } catch {
      failure.value = 'data'
      return false
    }
    const id = ++sequence
    busy.value = true
    activeId = id
    failure.value = undefined
    runningRequest.value = submitted
    try {
      worker = createWorker()
      worker.onmessage = (event) => {
        if (disposed || activeId !== id || event.data?.requestId !== id) return
        const result = event.data.result
        try {
          validateRequest(snapshot, result.request, true)
          const solved = result.status === 'optimal' || result.status === 'feasible'
          if (
            !['optimal', 'feasible', 'no-result', 'infeasible', 'error', 'empty'].includes(
              result.status,
            ) ||
            !Number.isFinite(result.elapsedSeconds) ||
            result.elapsedSeconds < 0 ||
            'solutions' in result ||
            requestFingerprint(result.request) !== requestFingerprint(submitted) ||
            (result.status === 'optimal' && result.solverStatus !== 'optimal') ||
            (solved
              ? !result.lineup || result.evaluation?.valid !== true
              : result.lineup !== undefined || result.evaluation !== undefined)
          )
            throw new Error('Invalid result message')
          if (solved) {
            const verified = evaluateLineup(snapshot, submitted, result.lineup!)
            if (!verified.valid || !sameValue(verified, result.evaluation))
              throw new Error('Inconsistent result evaluation')
          }
        } catch {
          fail(id, 'message')
          return
        }
        const attempt: SolvedAttempt = { requestId: id, request: submitted, result }
        lastAttempt.value = attempt
        if (result.status === 'optimal' || result.status === 'feasible') {
          lastValid.value = attempt
        }
        release()
      }
      worker.onerror = (event) => {
        event.preventDefault()
        fail(id, 'runtime')
      }
      worker.onmessageerror = () => fail(id, 'message')
      // JSON conversion also removes Vue reactive proxies without transferring business state.
      worker.postMessage(
        JSON.parse(JSON.stringify({ requestId: id, snapshot, request: submitted })),
      )
    } catch {
      fail(id, 'unavailable')
      return false
    }
    return true
  }
  function cancel() {
    if (!busy.value) return
    cancelled.value = true
    release()
  }
  function dispose() {
    disposed = true
    release()
  }
  return {
    form,
    busy,
    attempted,
    errors,
    failure,
    cancelled,
    lastAttempt,
    lastValid,
    runningRequest,
    stale,
    historical,
    start,
    cancel,
    dispose,
  }
}
