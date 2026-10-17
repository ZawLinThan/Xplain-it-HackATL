import { describe, expect, it } from 'vitest'
import { borderOf, createCounter } from './counter'
import type { GazeSample } from './types'

const centre: GazeSample = { gx: 0.5, gy: 0.5 }
const left: GazeSample = { gx: 0.05, gy: 0.5 }
const right: GazeSample = { gx: 0.95, gy: 0.5 }
const top: GazeSample = { gx: 0.5, gy: 0.04 }

/** Feed `sample` every 66 ms for `ms` starting at `t`. Returns the next time. */
function hold(c: ReturnType<typeof createCounter>, sample: GazeSample | null, t: number, ms: number) {
  for (let i = 0; i * 66 < ms; i++) c.push(sample, t + i * 66)
  return t + ms
}

describe('border zones', () => {
  it('finds the border a point is in, and the deeper one in a corner', () => {
    expect(borderOf(centre, 0.12)).toBeNull()
    expect(borderOf(left, 0.12)).toBe('left')
    expect(borderOf(right, 0.12)).toBe('right')
    expect(borderOf(top, 0.12)).toBe('top')
    expect(borderOf({ gx: 0.5, gy: 0.97 }, 0.12)).toBe('bottom')
    expect(borderOf({ gx: 0.02, gy: 0.1 }, 0.12)).toBe('left')
    expect(borderOf({ gx: 0.1, gy: 0.01 }, 0.12)).toBe('top')
    expect(borderOf({ gx: 0.12, gy: 0.5 }, 0.12)).toBeNull() // exactly on the line is inside
  })
})

describe('look-away counter', () => {
  it('stays at zero while the student looks at the screen', () => {
    const c = createCounter(0)
    hold(c, centre, 0, 10_000)
    expect(c.events()).toHaveLength(0)
  })

  it('counts a 500 ms excursion once', () => {
    const c = createCounter(1000)
    let t = hold(c, centre, 1000, 1000)
    t = hold(c, left, t, 500)
    hold(c, centre, t, 500)
    expect(c.events()).toEqual([{ t_ms: 1000, side: 'left' }])
  })

  it('ignores a 200 ms flicker', () => {
    const c = createCounter(0)
    let t = hold(c, centre, 0, 500)
    t = hold(c, left, t, 200)
    hold(c, centre, t, 500)
    expect(c.events()).toHaveLength(0)
  })

  it('counts a 5 second excursion as one event', () => {
    const c = createCounter(0)
    let t = hold(c, centre, 0, 500)
    t = hold(c, right, t, 5000)
    hold(c, centre, t, 500)
    expect(c.events()).toHaveLength(1)
    expect(c.events()[0].side).toBe('right')
  })

  it('leaving and coming back counts a second event', () => {
    const c = createCounter(0)
    let t = hold(c, left, 0, 600)
    t = hold(c, centre, t, 500)
    t = hold(c, right, t, 600)
    hold(c, centre, t, 300)
    expect(c.events().map((e) => e.side)).toEqual(['left', 'right'])
  })

  it('does not re-arm until the sample is back in the safe zone', () => {
    const c = createCounter(0)
    let t = hold(c, left, 0, 600)
    // hovers between the border (12 percent) and the safe zone (18 percent)
    t = hold(c, { gx: 0.15, gy: 0.5 }, t, 600)
    t = hold(c, left, t, 600)
    expect(c.events()).toHaveLength(1)
    t = hold(c, centre, t, 300)
    hold(c, left, t, 600)
    expect(c.events()).toHaveLength(2)
  })

  it('no face for 1.5 seconds is one lost event', () => {
    const c = createCounter(0)
    let t = hold(c, centre, 0, 500)
    t = hold(c, null, t, 1500)
    hold(c, centre, t, 500)
    expect(c.events()).toEqual([{ t_ms: 500, side: 'lost' }])
  })

  it('a short face dropout is not counted', () => {
    const c = createCounter(0)
    let t = hold(c, centre, 0, 500)
    t = hold(c, null, t, 600)
    hold(c, centre, t, 500)
    expect(c.events()).toHaveLength(0)
  })

  it('a long dropout is still only one event', () => {
    const c = createCounter(0)
    hold(c, null, 0, 20_000)
    expect(c.events()).toHaveLength(1)
  })

  it('four separate excursions give four events', () => {
    const c = createCounter(0)
    let t = 0
    for (let i = 0; i < 4; i++) {
      t = hold(c, i % 2 ? right : left, t, 600)
      t = hold(c, centre, t, 500)
    }
    expect(c.events()).toHaveLength(4)
  })
})
