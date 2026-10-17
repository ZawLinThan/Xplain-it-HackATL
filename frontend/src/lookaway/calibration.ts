import type { GazeSample } from './types'

export interface CalibrationPair { raw: GazeSample; target: GazeSample }
export type Calibration = { x: [number, number, number]; y: [number, number, number] }
let profile: Calibration | null = null

export function setCalibration(value: Calibration | null): void { profile = value }
export function hasCalibration(): boolean { return profile !== null }
export function applyCalibration(raw: GazeSample, fit: Calibration | null = profile): GazeSample {
  if (!fit) return raw
  return {
    gx: fit.x[0] + fit.x[1] * raw.gx + fit.x[2] * raw.gy,
    gy: fit.y[0] + fit.y[1] * raw.gx + fit.y[2] * raw.gy,
  }
}

/** Fit a screen mapping from known fixation targets, including axis coupling. */
export function fitCalibration(pairs: CalibrationPair[]): Calibration | null {
  if (pairs.length < 5 || pairs.some(({ raw, target }) =>
    ![raw.gx, raw.gy, target.gx, target.gy].every(Number.isFinite))) return null
  const mean = (get: (p: CalibrationPair) => number) => pairs.reduce((s, p) => s + get(p), 0) / pairs.length
  const mx = mean((p) => p.raw.gx)
  const my = mean((p) => p.raw.gy)
  const xx = mean((p) => (p.raw.gx - mx) ** 2)
  const yy = mean((p) => (p.raw.gy - my) ** 2)
  const xy = mean((p) => (p.raw.gx - mx) * (p.raw.gy - my))
  const det = xx * yy - xy * xy
  if (xx < 0.0001 || yy < 0.0001 || det < xx * yy * 0.05) return null
  const axis = (key: keyof GazeSample): [number, number, number] => {
    const mt = mean((p) => p.target[key])
    const xt = mean((p) => (p.raw.gx - mx) * (p.target[key] - mt))
    const yt = mean((p) => (p.raw.gy - my) * (p.target[key] - mt))
    const a = (xt * yy - yt * xy) / det
    const b = (yt * xx - xt * xy) / det
    return [mt - a * mx - b * my, a, b]
  }
  const fit = { x: axis('gx'), y: axis('gy') }
  const error = mean((p) => {
    const mapped = applyCalibration(p.raw, fit)
    return Math.hypot(mapped.gx - p.target.gx, mapped.gy - p.target.gy)
  })
  return error <= 0.12 ? fit : null
}
