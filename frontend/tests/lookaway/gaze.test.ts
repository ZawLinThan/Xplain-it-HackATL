import { describe, expect, it } from 'vitest'
import { LM, estimateGaze, estimateRawGaze, type Point } from '../../src/lookaway/gaze'

/** A synthetic face looking straight at the camera, centred in the frame. */
function face(over: { noseX?: number; noseY?: number; irisShift?: number; irisShiftY?: number } = {}): Point[] {
  const lm: Point[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
  lm[LM.cheekA] = { x: 0.4, y: 0.5 }
  lm[LM.cheekB] = { x: 0.6, y: 0.5 }
  lm[LM.forehead] = { x: 0.5, y: 0.35 }
  lm[LM.chin] = { x: 0.5, y: 0.65 }
  lm[LM.noseTip] = { x: over.noseX ?? 0.5, y: over.noseY ?? 0.5 }
  const s = over.irisShift ?? 0
  const sy = over.irisShiftY ?? 0
  lm[LM.eyeRightOuter] = { x: 0.42, y: 0.45 }
  lm[LM.eyeRightInner] = { x: 0.48, y: 0.45 }
  lm[LM.irisRight] = { x: 0.45 + s, y: 0.45 + sy }
  lm[LM.eyeLeftInner] = { x: 0.52, y: 0.45 }
  lm[LM.eyeLeftOuter] = { x: 0.58, y: 0.45 }
  lm[LM.irisLeft] = { x: 0.55 + s, y: 0.45 + sy }
  lm[LM.eyeRightUpper] = { x: 0.45, y: 0.44 }
  lm[LM.eyeRightLower] = { x: 0.45, y: 0.46 }
  lm[LM.eyeLeftUpper] = { x: 0.55, y: 0.44 }
  lm[LM.eyeLeftLower] = { x: 0.55, y: 0.46 }
  return lm
}

describe('estimateGaze', () => {
  it('looking straight ahead is the centre', () => {
    const g = estimateGaze(face())!
    expect(g.gx).toBeCloseTo(0.5, 2)
    expect(g.gy).toBeCloseTo(0.5, 2)
  })

  it('turning the head to the camera image right means the student looks to their left', () => {
    const g = estimateGaze(face({ noseX: 0.56 }))!
    expect(g.gx).toBeLessThan(0.4)
    const other = estimateGaze(face({ noseX: 0.44 }))!
    expect(other.gx).toBeGreaterThan(0.6)
  })

  it('tilting the head down moves the point down', () => {
    expect(estimateGaze(face({ noseY: 0.56 }))!.gy).toBeGreaterThan(0.6)
    expect(estimateGaze(face({ noseY: 0.44 }))!.gy).toBeLessThan(0.4)
  })

  it('eyes alone move the point too', () => {
    expect(estimateGaze(face({ irisShift: 0.02 }))!.gx).toBeLessThan(0.45)
  })

  it('uses vertical eye motion and ignores nearly closed eyelids', () => {
    expect(estimateGaze(face({ irisShiftY: -0.006 }))!.gy).toBeCloseTo(0.2)
    expect(estimateGaze(face({ irisShiftY: 0.006 }))!.gy).toBeCloseTo(0.8)
    const closed = face({ irisShiftY: 0.006 })
    closed[LM.eyeRightLower] = closed[LM.eyeRightUpper]
    closed[LM.eyeLeftLower] = closed[LM.eyeLeftUpper]
    expect(estimateGaze(closed)!.gy).toBeCloseTo(0.5)
  })

  it('preserves out-of-range raw values for calibration before clamping the display', () => {
    const lm = face({ noseX: 0.9, noseY: 0.1 })
    const raw = estimateRawGaze(lm)!
    expect(raw.gx).toBeLessThan(0)
    expect(raw.gy).toBeLessThan(0)
    expect(estimateGaze(lm)).toEqual({ gx: 0, gy: 0 })
  })

  it('stays inside 0..1 and gives null for a broken face', () => {
    const g = estimateGaze(face({ noseX: 0.9, noseY: 0.1 }))!
    expect(g.gx).toBeGreaterThanOrEqual(0)
    expect(g.gy).toBeGreaterThanOrEqual(0)
    expect(estimateGaze([])).toBeNull()
    const flat = face()
    flat[LM.cheekB] = flat[LM.cheekA]
    expect(estimateGaze(flat)).toBeNull()
  })
})
