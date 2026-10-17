import { describe, expect, it } from 'vitest'
import { BlinkGate } from '../../src/lookaway/blink'
import { LM, type Point } from '../../src/lookaway/gaze'
import { GazeFilter } from '../../src/lookaway/filter'

function eyes(opening: number, leftOpening = opening): Point[] {
  const face: Point[] = []
  for (const [a, b, upper, lower, x, ratio] of [
    [LM.eyeRightOuter, LM.eyeRightInner, LM.eyeRightUpper, LM.eyeRightLower, 0.4, opening],
    [LM.eyeLeftInner, LM.eyeLeftOuter, LM.eyeLeftUpper, LM.eyeLeftLower, 0.6, leftOpening],
  ]) {
    face[a] = { x, y: 0.45 }
    face[b] = { x: x + 0.06, y: 0.45 }
    face[upper] = { x: x + 0.03, y: 0.45 - ratio * 0.03 }
    face[lower] = { x: x + 0.03, y: 0.45 + ratio * 0.03 }
  }
  return face
}

describe('BlinkGate', () => {
  it('rejects a closing eye before full closure, and waits for reopening to settle', () => {
    const gate = new BlinkGate()
    expect(gate.accepts(eyes(0.3), 0)).toBe(true)
    expect(gate.accepts(eyes(0.21), 66)).toBe(false)
    expect(gate.accepts(eyes(0.05), 132)).toBe(false)
    expect(gate.accepts(eyes(0.3), 198)).toBe(false)
    expect(gate.accepts(eyes(0.3), 330)).toBe(true)
  })

  it('rejects one-eye blinks without treating them as a vertical gaze change', () => {
    const gate = new BlinkGate()
    gate.accepts(eyes(0.3), 0)
    expect(gate.accepts(eyes(0.3, 0.08), 66)).toBe(false)
  })

  it('accepts gradual eyelid motion while looking down', () => {
    const gate = new BlinkGate()
    expect(gate.accepts(eyes(0.3), 0)).toBe(true)
    expect(gate.accepts(eyes(0.28), 66)).toBe(true)
    expect(gate.accepts(eyes(0.25), 132)).toBe(true)
    expect(gate.accepts(eyes(0.22), 198)).toBe(true)
  })

  it('keeps blink-induced corner samples out of the displayed signal', () => {
    const gate = new BlinkGate()
    const filter = new GazeFilter()
    let sample = { gx: 0.5, gy: 0.5 }
    const frames = [
      [0, 0.3, 0.5], [66, 0.3, 0.5], [132, 0.21, -2],
      [198, 0.05, 3], [264, 0.3, -2], [396, 0.3, 0.5],
    ]
    for (const [time, opening, gy] of frames) {
      if (gate.accepts(eyes(opening), time)) sample = filter.push({ gx: 0.5, gy }, time)!
      expect(sample).toEqual({ gx: 0.5, gy: 0.5 })
    }
  })
})
