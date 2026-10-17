import { afterEach, describe, expect, it } from 'vitest'
import { applyCalibration, fitCalibration, hasCalibration, setCalibration } from '../../src/lookaway/calibration'

const targets = [
  { gx: 0.5, gy: 0.5 }, { gx: 0.15, gy: 0.5 }, { gx: 0.85, gy: 0.5 },
  { gx: 0.5, gy: 0.15 }, { gx: 0.5, gy: 0.85 },
]
afterEach(() => setCalibration(null))

describe('screen calibration', () => {
  it('learns camera-specific offsets, sensitivity, and axis coupling without clipping', () => {
    const raw = (gx: number, gy: number) => ({ gx: -0.8 + gx * 0.6 + gy * 0.1, gy: 1.2 + gy * 0.4 - gx * 0.1 })
    const fit = fitCalibration(targets.map((target) => ({ target, raw: raw(target.gx, target.gy) })))!
    expect(fit).not.toBeNull()
    setCalibration(fit)
    expect(hasCalibration()).toBe(true)
    const result = applyCalibration(raw(0.7, 0.25))
    expect(result.gx).toBeCloseTo(0.7)
    expect(result.gy).toBeCloseTo(0.25)
    setCalibration(null)
    expect(applyCalibration(raw(0.7, 0.25))).toEqual(raw(0.7, 0.25))
  })

  it('rejects stationary, one-dimensional, and inconsistent target samples', () => {
    expect(fitCalibration(targets.map((target) => ({ target, raw: { gx: 0.5, gy: 0.5 } })))).toBeNull()
    expect(fitCalibration(targets.map((target) => ({ target, raw: { gx: target.gx, gy: target.gx } })))).toBeNull()
    const pairs = targets.map((target) => ({ target, raw: { ...target } }))
    pairs[0].raw = { gx: 1.4, gy: -1.2 }
    expect(fitCalibration(pairs)).toBeNull()
  })
})
