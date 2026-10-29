import { isProxy } from 'vue'
import { describe, expect, it } from 'vitest'
import { createCurrencyWarsSession } from '../../../src/tools/currency-wars/ui/session'
import { resultSummary } from '../../../src/tools/currency-wars/ui/result-summary'
import { loadPageData } from '../../../src/tools/currency-wars/ui/data'
import type {
  WorkerPort,
  SolveMessage,
  ResultMessage,
} from '../../../src/tools/currency-wars/browser/protocol'
import { evaluateLineup } from '../../../src/tools/currency-wars/evaluate'
import type { OptimizationResult } from '../../../src/tools/currency-wars/types'
import { emblem, role, task, toy } from './helpers'
import { summarizeEmblemDemand } from '../../../src/tools/currency-wars/ui/crafting'

class FakeWorker implements WorkerPort {
  onmessage: WorkerPort['onmessage'] = null
  onerror: WorkerPort['onerror'] = null
  onmessageerror: WorkerPort['onmessageerror'] = null
  messages: SolveMessage[] = []
  terminated = false
  postMessage(message: SolveMessage) {
    this.messages.push(message)
  }
  terminate() {
    this.terminated = true
  }
  emit(result: Partial<OptimizationResult>, id = this.messages[0]!.requestId) {
    this.onmessage?.({ data: { requestId: id, result } } as MessageEvent<ResultMessage>)
  }
}
const snapshot = toy([role(1, [2007]), role(2, [2008])])
const tasks = [task(2007, 1), task(2008, 1)]
function setup(testSnapshot = snapshot, selectTasks = true) {
  const workers: FakeWorker[] = []
  const session = createCurrencyWarsSession(testSnapshot, tasks, () => {
    const worker = new FakeWorker()
    workers.push(worker)
    return worker
  })
  if (selectTasks) session.form.taskIds = tasks.map((task) => task.id)
  const good = (index = workers.length - 1): OptimizationResult => {
    const request = workers[index]!.messages[0]!.request
    const lineup = {
      members: [
        { formId: '1', emblemIds: [] },
        { formId: '2', emblemIds: [] },
      ],
    }
    return {
      status: 'optimal',
      request,
      elapsedSeconds: 0.25,
      lineup,
      evaluation: evaluateLineup(testSnapshot, request, lineup),
      solverStatus: 'optimal',
    }
  }
  return { session, workers, good }
}

describe('currency-wars page session', () => {
  it('keeps single-lineup demands through objective edits, errors and cancellation', () => {
    const demandSnapshot = toy(snapshot.roles, [2004])
    const { session, workers, good } = setup(demandSnapshot)
    session.start()
    const result = good()
    result.lineup!.members[0]!.emblemIds = [emblem(2004)]
    result.evaluation = evaluateLineup(demandSnapshot, result.request, result.lineup!)
    workers[0]!.emit(result)
    const displayed = () =>
      summarizeEmblemDemand({ lineup: session.lastValid.value!.result.lineup! })
    expect(displayed()).toEqual([{ emblemId: emblem(2004), count: 1 }])
    session.form.objective = 'min-emblems'
    expect(session.stale.value).toBe(true)
    expect(workers).toHaveLength(1)
    session.start()
    expect(workers[1]!.messages[0]!.request.objective).toBe('min-emblems')
    workers[1]!.emit({ request: good().request, status: 'error', elapsedSeconds: 1 })
    expect(session.historical.value).toBe(true)
    session.start()
    session.cancel()
    expect(displayed()).toEqual([{ emblemId: emblem(2004), count: 1 }])
    expect(session.lastValid.value!.result).toBe(result)
    session.dispose()
  })

  it.each(['objective', 'evaluation', 'proof', 'array', 'lineup'] as const)(
    'rejects inconsistent %s messages and retains history',
    (defect) => {
      const { session, workers, good } = setup()
      session.start()
      workers[0]!.emit(good())
      const previous = session.lastValid.value
      session.start()
      const result = good()
      if (defect === 'objective') result.request = { ...result.request, objective: 'min-emblems' }
      if (defect === 'evaluation') result.evaluation!.objective++
      if (defect === 'proof') result.solverStatus = 'timeLimit'
      if (defect === 'array') Object.assign(result, { solutions: [result.lineup] })
      if (defect === 'lineup') result.lineup!.members[0]!.formId = 'missing'
      workers[1]!.emit(result)
      expect(session.failure.value).toBe('message')
      expect(session.lastValid.value).toBe(previous)
      expect(session.historical.value).toBe(true)
    },
  )

  it('keeps the displayed summary tied to its request through form edits and failed or cancelled runs', () => {
    const { session, workers, good } = setup()
    session.start()
    workers[0]!.emit(good())
    const displayed = () => resultSummary(session.lastValid.value!)
    expect(displayed()).toEqual({ completed: 2, tasks: 2 })
    session.form.taskIds = [tasks[0]!.id]
    session.form.emblemBudget = 20
    expect(session.stale.value).toBe(true)
    session.start()
    session.cancel()
    expect(displayed()).toEqual({ completed: 2, tasks: 2 })
    session.start()
    workers[2]!.emit({
      ...good(),
      status: 'no-result',
      lineup: undefined,
      evaluation: undefined,
      elapsedSeconds: 0.1,
    })
    expect(displayed()).toEqual({ completed: 2, tasks: 2 })
    session.dispose()
  })

  it('reports a new invalid attempt instead of retaining the preceding cancellation notice', () => {
    const { session, workers } = setup()
    session.start()
    session.cancel()
    session.form.taskIds = []
    expect(session.start()).toBe(false)
    expect(session.cancelled.value).toBe(false)
    expect(session.failure.value).toBe('input')
    expect(workers).toHaveLength(1)
  })
  it('preserves the default parameters and stable task IDs', () => {
    const { session } = setup(snapshot, false)
    expect(session.form).toMatchObject({
      objective: 'min-roles',
      slots: 13,
      emblemBudget: 18,
      includeExperts: false,
      taskIds: [],
    })
    session.form.taskIds = []
    expect(session.start()).toBe(false)
    expect(session.errors.value).toContain('taskIds')
    session.form.taskIds = [tasks[1]!.id]
    expect(session.form.taskIds).toEqual([tasks[1]!.id])
    session.dispose()
  })

  it('starts with no tasks selected and permits all/clear using the stable task IDs', () => {
    const data = loadPageData()
    const session = createCurrencyWarsSession(data.snapshot, data.tasks, () => new FakeWorker())
    expect(session.form.taskIds).toEqual([])
    expect(session.start()).toBe(false)
    session.form.taskIds = data.tasks.map((task) => task.id)
    expect(session.form.taskIds).toHaveLength(25)
    session.form.taskIds = session.form.taskIds.filter((id) => id !== data.tasks[0]!.id)
    expect(session.form.taskIds).toHaveLength(24)
    expect(session.errors.value).toEqual([])
    session.form.taskIds = []
    expect(session.start()).toBe(false)
    expect(session.errors.value).toContain('taskIds')
    session.dispose()
  })

  it.each(Array.from({ length: 13 }, (_, index) => index + 1))(
    'submits %i slots with the fixed 60 second page budget',
    (slots) => {
      const { session, workers } = setup()
      session.form.slots = slots
      expect(session.start()).toBe(true)
      expect(workers[0]!.messages[0]!.request).toMatchObject({
        slots,
        timeLimitSeconds: 60,
        emblemBudget: 18,
      })
      expect('timeLimitSeconds' in session.form).toBe(false)
      session.dispose()
    },
  )

  it.each([12, 18, 39])('accepts page emblem budget %i', (emblemBudget) => {
    const { session, workers } = setup()
    session.form.emblemBudget = emblemBudget
    expect(session.start()).toBe(true)
    expect(workers[0]!.messages[0]!.request.emblemBudget).toBe(emblemBudget)
    session.dispose()
  })

  it('copies the exact request and snapshot into one Worker and prevents duplicate starts', () => {
    const { session, workers, good } = setup()
    session.form.slots = 11
    session.form.emblemBudget = 39
    session.form.includeExperts = true
    expect(session.start()).toBe(true)
    expect(session.start()).toBe(false)
    expect(workers).toHaveLength(1)
    const sent = workers[0]!.messages[0]!
    expect(sent.request).toEqual({
      objective: 'min-roles',
      slots: 11,
      emblemBudget: 39,
      includeExperts: true,
      timeLimitSeconds: 60,
      tasks,
    })
    expect(sent.snapshot).toEqual(snapshot)
    expect(sent.snapshot).not.toBe(snapshot)
    expect(isProxy(sent.request)).toBe(false)
    session.form.taskIds = [tasks[0]!.id]
    expect(sent.request.tasks).toHaveLength(2)
    workers[0]!.emit(good())
    expect(session.lastValid.value!.request.tasks).toHaveLength(2)
    expect(session.stale.value).toBe(true)
    expect(workers[0]!.terminated).toBe(true)
    expect(session.busy.value).toBe(false)
  })

  it.each([
    ['slots', 0],
    ['slots', 14],
    ['emblemBudget', 40],
    ['emblemBudget', 11],
    ['emblemBudget', 12.5],
    ['slots', 1.5],
  ] as const)('rejects invalid %s=%s before starting a Worker', (field, value) => {
    const { session, workers } = setup()
    session.form[field] = value
    expect(session.start()).toBe(false)
    expect(workers).toHaveLength(0)
    expect(session.errors.value).toContain(field)
  })

  it('keeps a successful result with its submitted conditions and marks only configuration changes stale', () => {
    const { session, workers, good } = setup()
    session.start()
    workers[0]!.emit(good())
    expect(session.stale.value).toBe(false)
    session.form.taskIds.reverse()
    expect(session.stale.value).toBe(false)
    session.form.emblemBudget = 19
    expect(session.stale.value).toBe(true)
    session.form.emblemBudget = 18
    expect(session.stale.value).toBe(false)
    session.form.emblemBudget = NaN
    expect(session.stale.value).toBe(true)
    expect(session.lastValid.value!.request.emblemBudget).toBe(18)
  })

  it('cancels, releases and restarts while ignoring old and out-of-order responses', () => {
    const { session, workers, good } = setup()
    session.start()
    const late = workers[0]!.onmessage!
    session.cancel()
    expect(workers[0]!.terminated).toBe(true)
    expect(session.cancelled.value).toBe(true)
    session.start()
    late({ data: { requestId: 1, result: good(0) } } as MessageEvent<ResultMessage>)
    expect(session.lastValid.value).toBeUndefined()
    workers[1]!.emit(good(1), 1)
    expect(session.busy.value).toBe(true)
    workers[1]!.emit(good(1))
    expect(session.lastValid.value!.requestId).toBe(2)
    expect(session.cancelled.value).toBe(false)
  })

  it.each(['feasible', 'no-result', 'infeasible', 'error', 'empty'] as const)(
    'preserves status %s and does not replace an earlier valid lineup with an invalid attempt',
    (status) => {
      const { session, workers, good } = setup()
      session.start()
      workers[0]!.emit(good())
      const previous = session.lastValid.value
      session.start()
      workers[1]!.emit(
        status === 'feasible'
          ? { ...good(), status }
          : { ...good(), status, lineup: undefined, evaluation: undefined, elapsedSeconds: 0.1 },
      )
      expect(session.lastAttempt.value!.result.status).toBe(status)
      if (status === 'feasible') expect(session.lastValid.value!.result.status).toBe('feasible')
      else {
        expect(session.lastValid.value).toBe(previous)
        expect(session.historical.value).toBe(true)
      }
    },
  )

  it('handles unavailable Workers, runtime and message errors, malformed results and disposal', () => {
    const unavailable = createCurrencyWarsSession(snapshot, tasks, () => {
      throw new Error('unavailable')
    })
    unavailable.form.taskIds = tasks.map((task) => task.id)
    expect(unavailable.start()).toBe(false)
    expect(unavailable.failure.value).toBe('unavailable')
    for (const kind of ['runtime', 'message', 'malformed'] as const) {
      const { session, workers } = setup()
      session.start()
      if (kind === 'runtime') workers[0]!.onerror!({ preventDefault() {} } as ErrorEvent)
      if (kind === 'message') workers[0]!.onmessageerror!({} as MessageEvent)
      if (kind === 'malformed') workers[0]!.emit({ status: 'optimal', elapsedSeconds: 1 })
      expect(session.failure.value).toBe(kind === 'runtime' ? 'runtime' : 'message')
      expect(session.lastValid.value).toBeUndefined()
      expect(workers[0]!.terminated).toBe(true)
    }
    const { session, workers, good } = setup()
    session.start()
    const late = workers[0]!.onmessage!
    session.dispose()
    late({ data: { requestId: 1, result: good() } } as MessageEvent<ResultMessage>)
    expect(session.lastAttempt.value).toBeUndefined()
    expect(session.start()).toBe(false)
    expect(workers[0]!.terminated).toBe(true)
  })
})
