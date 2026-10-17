import { describe, expect, it } from 'vitest'
import { GazeFilter } from '../../src/lookaway/filter'

describe('GazeFilter', () => {
  it('rejects an isolated corner spike while following sustained movement', () => {
    const filter = new GazeFilter()
    filter.push({ gx: 0.5, gy: 0.5 }, 0)
    filter.push({ gx: 0.5, gy: 0.5 }, 66)
    expect(filter.push({ gx: 0, gy: 0 }, 132)).toEqual({ gx: 0.5, gy: 0.5 })
    filter.push({ gx: 0.5, gy: 0.5 }, 198)
    expect(filter.push({ gx: 0.5, gy: 0.5 }, 264)).toEqual({ gx: 0.5, gy: 0.5 })
    for (let time = 330; time <= 990; time += 66) filter.push({ gx: 0, gy: 1 }, time)
    const result = filter.push({ gx: 0, gy: 1 }, 1056)!
    expect(result.gx).toBeLessThan(0.01)
    expect(result.gy).toBeGreaterThan(0.99)
  })

  it('limits vertical jumps even when a calibrated sample is extreme', () => {
    const filter = new GazeFilter()
    filter.push({ gx: 0.5, gy: 0.5 }, 0)
    filter.push({ gx: 0.5, gy: 0.5 }, 66)
    filter.push({ gx: 0.5, gy: -10 }, 132)
    const result = filter.push({ gx: 0.5, gy: -10 }, 198)!
    expect(result.gy).toBeGreaterThan(0.4)
    expect(result.gx).toBe(0.5)
  })

  it('reports face loss immediately and resets the old gaze', () => {
    const filter = new GazeFilter()
    filter.push({ gx: 0, gy: 0 }, 0)
    expect(filter.push(null, 66)).toBeNull()
    expect(filter.push({ gx: 1, gy: 1 }, 132)).toEqual({ gx: 1, gy: 1 })
    expect(filter.push({ gx: NaN, gy: 0 }, 198)).toBeNull()
  })

  it('preserves raw calibration range and resets after a long frame gap', () => {
    const filter = new GazeFilter()
    expect(filter.push({ gx: -0.4, gy: 1.2 }, 0)).toEqual({ gx: -0.4, gy: 1.2 })
    expect(filter.push({ gx: 0.5, gy: 0.5 }, 1000)).toEqual({ gx: 0.5, gy: 0.5 })
  })
})
