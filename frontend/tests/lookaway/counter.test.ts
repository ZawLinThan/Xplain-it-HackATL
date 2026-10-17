import { describe, expect, it } from 'vitest'
import { borderOf, createCounter } from '../../src/lookaway/counter'
import type { GazeSample } from '../../src/lookaway/types'

const centre: GazeSample = { gx: 0.5, gy: 0.5 }
const left: GazeSample = { gx: 0.05, gy: 0.5 }
const right: GazeSample = { gx: 0.95, gy: 0.5 }
const top: GazeSample = { gx: 0.5, gy: 0.04 }

describe('border zones', () => {
  it('finds the border a point is in, and the deeper one in a corner', () => {
    expect(borderOf(centre, 0.12)).toBeNull()
    expect(borderOf(left, 0.12)).toBe('left')
    expect(borderOf(right, 0.12)).toBe('right')
    expect(borderOf(top, 0.12)).toBe('top')
    expect(borderOf({ gx: 0.5, gy: 0.97 }, 0.12)).toBe('bottom')
    expect(borderOf({ gx: 0.02, gy: 0.1 }, 0.12)).toBe('left')
    expect(borderOf({ gx: 0.1, gy: 0.01 }, 0.12)).toBe('top')
    expect(borderOf({ gx: 0.12, gy: 0.5 }, 0.12)).toBe('left') // touching the border counts
  })
})

describe('look-away counter', () => {
  it('counts on entry, waits two seconds, then counts each additional second', () => {
    const c = createCounter(1000)
    c.push(left, 1000)
    c.push(left, 2999)
    expect(c.events()).toEqual([{ t_ms: 0, side: 'left' }])
    c.push(left, 3000)
    c.push(left, 3999)
    expect(c.events()).toEqual([{ t_ms: 0, side: 'left' }, { t_ms: 2000, side: 'left' }])
    c.push(left, 4000)
    c.push(left, 6000)
    expect(c.events().map((e) => e.t_ms)).toEqual([0, 2000, 3000, 4000, 5000])
  })
  it('stops immediately outside the red zone and resets the dwell', () => {
    const c = createCounter(0)
    c.push(left, 0)
    c.push(left, 2000)
    c.push({ gx: 0.15, gy: 0.5 }, 2500)
    c.push(left, 3000)
    c.push(left, 4999)
    expect(c.events()).toHaveLength(3)
    c.push(left, 5000)
    expect(c.events()).toHaveLength(4)
    c.push(centre, 6000)
    c.push(centre, 10000)
    expect(c.events()).toHaveLength(4)
  })
  it('moving between borders keeps the continuous dwell', () => {
    const c = createCounter(0)
    c.push(left, 0)
    c.push(top, 1500)
    c.push(right, 2000)
    expect(c.events()).toEqual([{ t_ms: 0, side: 'left' }, { t_ms: 2000, side: 'right' }])
  })
  it('counts each new entry but does not carry dwell over face loss', () => {
    const c = createCounter(0)
    c.push(left, 0)
    c.push(null, 1900)
    c.push(left, 2000)
    c.push(centre, 3900)
    expect(c.events()).toEqual([{ t_ms: 0, side: 'left' }, { t_ms: 2000, side: 'left' }])
  })
  it('keeps face loss as one separate event per dropout', () => {
    const c = createCounter(0)
    c.push(null, 0)
    c.push(null, 1000)
    c.push(null, 8000)
    expect(c.events()).toEqual([{ t_ms: 0, side: 'lost' }])
    c.push(centre, 9000)
    c.push(null, 10000)
    c.push(null, 11000)
    expect(c.events()).toHaveLength(2)
  })
})
