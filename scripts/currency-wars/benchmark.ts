import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHighsSolver, solveCurrencyWars } from '../../src/tools/currency-wars/solve'
import { loadSnapshot, dataDirectory, projectRoot } from './data'
import type { Task } from '../../src/tools/currency-wars/types'

// Separate cold runtimes for each objective, reused for the warm samples; no hard thresholds.
const snapshot = await loadSnapshot()
const tasks = JSON.parse(await readFile(path.join(dataDirectory, 'tasks.json'), 'utf8')) as Task[]
const records = []
const output = path.join(projectRoot, '.cache/currency-wars-objective-benchmark.json')
await mkdir(path.dirname(output), { recursive: true })
for (const emblemBudget of [12, 20]) {
  for (const subset of ['all', 'first-five'] as const) {
    const solvers = { 'min-roles': createHighsSolver(), 'min-emblems': createHighsSolver() }
    for (let repeat = 1; repeat <= 3; repeat++) {
      for (const objective of ['min-roles', 'min-emblems'] as const) {
        const result = await solveCurrencyWars(
          snapshot,
          {
            objective,
            slots: 13,
            emblemBudget,
            includeExperts: false,
            timeLimitSeconds: 30,
            tasks: subset === 'all' ? tasks : tasks.slice(0, 5),
          },
          solvers[objective],
        )
        const record = {
          objective,
          emblemBudget,
          subset,
          repeat,
          initialization: repeat === 1 ? 'cold' : 'warm',
          status: result.status,
          elapsedSeconds: result.elapsedSeconds,
          completed: result.evaluation?.completedCount,
          roles: result.lineup?.members.length,
          emblems: result.evaluation?.emblemCount,
          value: result.evaluation?.objective,
          objectiveBound: result.objectiveBound,
          gap: result.gap,
          message: result.message,
        }
        records.push(record)
        await writeFile(
          output,
          JSON.stringify(
            { timestamp: new Date().toISOString(), node: process.version, records },
            null,
            2,
          ) + '\n',
        )
        console.log(JSON.stringify(record))
      }
    }
  }
}
