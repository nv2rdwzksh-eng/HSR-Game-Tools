import { cpus } from 'node:os'
import { performance } from 'node:perf_hooks'
import { simulatePlan } from '../src/tools/action-planner/engine/engine'
import type { SimulationPlan } from '../src/tools/action-planner/engine/types'

const normal: SimulationPlan = {
  cycleMode: 'none',
  aha: { id: 'aha-instant', baseSpeed: 80, contributorIds: [] },
  actors: [160, 134, 120, 100].map((speed, i) => ({
    id: 'actor:' + i,
    name: 'Actor ' + i,
    kind: 'actor',
    camp: 'ally',
    position: i,
    baseSpeed: 100,
    panelSpeed: speed,
  })),
  events: [],
  maxNodes: 60,
  maxAV: 1000,
}
const dynamic: SimulationPlan = {
  ...normal,
  events: [
    {
      anchor: { kind: 'start' },
      operations: [
        {
          id: 'timed',
          type: 'addSpeedModifier',
          target: { kind: 'allies' },
          mode: 'flat',
          amount: 50,
          duration: { kind: 'countdown', name: 'Timer', speed: 70 },
        },
        {
          id: 'summon',
          type: 'spawnParticipant',
          participant: {
            kind: 'actor',
            name: 'Summon',
            camp: 'ally',
            baseSpeed: 100,
            panelSpeed: 90,
            actionLimit: 5,
          },
        },
      ],
    },
  ],
}
const plans = {
  fourActors: normal,
  dynamicAndCountdown: dynamic,
  highBudget: { ...dynamic, maxNodes: 500, maxAV: 100000 },
}
const results = Object.entries(plans).map(([name, plan]) => {
  for (let i = 0; i < 5; i++) simulatePlan(plan)
  const samples: number[] = []
  let nodes = 0
  for (let i = 0; i < 30; i++) {
    const start = performance.now()
    const result = simulatePlan(plan)
    samples.push(performance.now() - start)
    nodes = result.records.length
  }
  samples.sort((a, b) => a - b)
  return { name, nodes, samples: 30, medianMs: samples[15], p95Ms: samples[28], maxMs: samples[29] }
})
console.log(
  JSON.stringify({ node: process.version, cpu: cpus()[0]?.model, warmups: 5, results }, null, 2),
)
