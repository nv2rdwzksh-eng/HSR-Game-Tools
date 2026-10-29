import type { WorkerFactory } from './protocol'

export const createBrowserWorker: WorkerFactory = () =>
  new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
