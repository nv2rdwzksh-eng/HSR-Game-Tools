/** Explicit offline experiment; excluded from ordinary Vitest runs. Retains at most ten events. */
import { pullTen } from '../../src/tools/warp-simulator/engine/gacha'
import { PROBABILITY_MODEL } from '../../src/tools/warp-simulator/engine/probability'
import { createSessionState } from '../../src/tools/warp-simulator/engine/state'
import { poolFor, seeded, unwrap } from '../fixtures/warp-simulator/fixture'
import { theoreticalRates } from '../fixtures/warp-simulator/oracle'

const sessions = 20,
  pullsPerSession = 50000
function summarize(values: number[]) {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const sd = Math.sqrt(
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1),
  )
  return { mean, sessionStandardDeviation: sd, standardErrorOfMean: sd / Math.sqrt(values.length) }
}
for (const cone of [false, true]) {
  const kind = cone ? 'event-light-cone' : 'event-avatar'
  const pool = poolFor(kind),
    firstSeed = cone ? 24303 : 24302
  const samples = [],
    seeds = []
  let rngCalls = 0
  for (let batch = 0; batch < sessions; batch++) {
    const seed = firstSeed + batch * 997,
      rng = seeded(seed)
    seeds.push(seed)
    let state = createSessionState(),
      five = 0,
      four = 0,
      upFive = 0
    for (let i = 0; i < pullsPerSession; i += 10) {
      const result = unwrap(pullTen(pool, state, rng))
      state = result.nextState
      for (const event of result.events) {
        if (event.rarity === 5) {
          five++
          if (event.isUp) upFive++
        }
        if (event.rarity === 4) four++
      }
    }
    rngCalls += rng.consumed
    samples.push({
      five: five / pullsPerSession,
      four: four / pullsPerSession,
      upFive: upFive / pullsPerSession,
    })
  }
  const oracle = theoreticalRates(cone),
    fiveStar = summarize(samples.map((v) => v.five)),
    fourStar = summarize(samples.map((v) => v.four))
  const q = cone ? 0.78125 : 0.5625
  console.log(
    JSON.stringify(
      {
        model: PROBABILITY_MODEL,
        kind,
        fixture: 'synthetic, no UP overlap',
        rng: 'Mulberry32',
        seeds,
        sessions,
        pullsPerSession,
        totalPulls: sessions * pullsPerSession,
        initialState: 'all five groups zero, guarantees false; reset per session',
        rngCalls,
        oracle,
        fiveStar: { ...fiveStar, error: fiveStar.mean - oracle.fiveStar },
        fourStar: { ...fourStar, error: fourStar.mean - oracle.fourStar },
        upFiveStar: {
          ...summarize(samples.map((v) => v.upFive)),
          theoreticalLongRunRate: oracle.fiveStar / (2 - q),
        },
      },
      null,
      2,
    ),
  )
}
