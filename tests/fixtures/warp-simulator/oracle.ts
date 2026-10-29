/** Independent mathematical oracle: no production imports, no RNG or item sampler. */
export function oracleHazards(cone: boolean, n5: number, n4: number) {
  const five = cone
    ? n5 < 66
      ? 8
      : Math.min(1000, 8 + 70 * (n5 - 65))
    : n5 < 74
      ? 6
      : Math.min(1000, 6 + 60 * (n5 - 73))
  const four = cone
    ? n4 < 8
      ? 66
      : n4 === 8
        ? 397
        : n4 === 9
          ? 728
          : 1000
    : n4 < 9
      ? 51
      : n4 === 9
        ? 520
        : 1000
  return { five: five / 1000, four: four / 1000 }
}
export function theoreticalRates(cone: boolean) {
  const hard = cone ? 80 : 90
  let survival = 1,
    mean = 0
  for (let n = 1; n <= hard; n++) {
    mean += survival
    survival *= 1 - oracleHazards(cone, n, 1).five
  }
  // Independently keep an extra pending-pity bucket (10); production saturates at 9.
  const width = 11
  let distribution = new Float64Array(hard * width)
  distribution[0] = 1
  let residual = Infinity,
    iterations = 0
  while (residual > 1e-13 && iterations++ < 50000) {
    const next = new Float64Array(distribution.length)
    for (let fiveMisses = 0; fiveMisses < hard; fiveMisses++) {
      for (let fourMisses = 0; fourMisses < width; fourMisses++) {
        const mass = distribution[fiveMisses * width + fourMisses]
        const { five, four } = oracleHazards(cone, fiveMisses + 1, fourMisses + 1)
        const pending = Math.min(10, fourMisses + 1)
        next[pending] += mass * five
        if (fiveMisses + 1 < hard) {
          next[(fiveMisses + 1) * width] += mass * (1 - five) * four
          next[(fiveMisses + 1) * width + pending] += mass * (1 - five) * (1 - four)
        }
      }
    }
    residual = distribution.reduce((sum, value, i) => sum + Math.abs(value - next[i]), 0)
    distribution = next
  }
  if (residual > 1e-13) throw new Error('Oracle failed to converge')
  let fiveStar = 0,
    fourStar = 0
  for (let i = 0; i < hard; i++)
    for (let j = 0; j < width; j++) {
      const mass = distribution[i * width + j],
        { five, four } = oracleHazards(cone, i + 1, j + 1)
      fiveStar += mass * five
      fourStar += mass * (1 - five) * four
    }
  return {
    fiveStar,
    fourStar,
    renewalFiveStar: 1 / mean,
    mean,
    residual,
    iterations,
    mass: distribution.reduce((sum, value) => sum + value, 0),
  }
}
