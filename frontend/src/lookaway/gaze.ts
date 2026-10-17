import type { GazeSample } from './types'

/** Tunable constants. The right values depend on the webcam, so they live in one place. */
export const GAZE = {
  yawGain: 2.2, // head turn: nose offset from the cheek midpoint, as a share of face width
  pitchGain: 2.2, // head tilt: nose offset from the forehead-chin midpoint, as a share of face height
  irisGain: 1.4, // eyes only: iris offset inside the eye corners, as a share of eye width
  verticalIrisGain: 4.5,
  positionGain: 0.6, // where the face sits in the camera frame
} as const

export interface Point {
  x: number
  y: number
}

/** MediaPipe Face Landmarker indices (478-point mesh with irises). */
export const LM = {
  noseTip: 1,
  forehead: 10,
  chin: 152,
  cheekA: 234,
  cheekB: 454,
  eyeRightOuter: 33,
  eyeRightInner: 133,
  eyeLeftInner: 362,
  eyeLeftOuter: 263,
  eyeRightUpper: 159,
  eyeRightLower: 145,
  eyeLeftUpper: 386,
  eyeLeftLower: 374,
  irisRight: 468,
  irisLeft: 473,
} as const

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

/**
 * Turn face landmarks (image coordinates, x to the right of the camera image) into a gaze point on
 * the screen. A rough estimate from head turn, head tilt, eye direction and face position.
 * It is not exact gaze tracking, so it is used only to count how often someone looks away.
 *
 * The camera image is mirrored relative to the student, so x is flipped: gx grows toward the
 * student's right.
 */
export function estimateGaze(lm: readonly Point[]): GazeSample | null {
  const raw = estimateRawGaze(lm)
  return raw ? { gx: clamp01(raw.gx), gy: clamp01(raw.gy) } : null
}

/** Preserve the full range until the monitor has removed the student's baseline. */
export function estimateRawGaze(lm: readonly Point[]): GazeSample | null {
  const need = [LM.noseTip, LM.forehead, LM.chin, LM.cheekA, LM.cheekB]
  if (need.some((i) => !lm[i])) return null
  const nose = lm[LM.noseTip]
  const faceW = Math.abs(lm[LM.cheekB].x - lm[LM.cheekA].x)
  const faceH = Math.abs(lm[LM.chin].y - lm[LM.forehead].y)
  if (faceW < 1e-3 || faceH < 1e-3) return null

  const yaw = (nose.x - (lm[LM.cheekA].x + lm[LM.cheekB].x) / 2) / faceW
  const pitch = (nose.y - (lm[LM.forehead].y + lm[LM.chin].y) / 2) / faceH

  let iris = 0
  const eyes: [number, number, number][] = [
    [LM.irisRight, LM.eyeRightOuter, LM.eyeRightInner],
    [LM.irisLeft, LM.eyeLeftInner, LM.eyeLeftOuter],
  ]
  let n = 0
  for (const [i, a, b] of eyes) {
    if (!lm[i] || !lm[a] || !lm[b]) continue
    const width = Math.abs(lm[b].x - lm[a].x)
    if (width < 1e-3) continue
    iris += (lm[i].x - (lm[a].x + lm[b].x) / 2) / width
    n++
  }
  if (n > 0) iris /= n

  let vertical = 0
  let visibleEyes = 0
  for (const [i, a, b, top, bottom] of [
    [LM.irisRight, LM.eyeRightOuter, LM.eyeRightInner, LM.eyeRightUpper, LM.eyeRightLower],
    [LM.irisLeft, LM.eyeLeftInner, LM.eyeLeftOuter, LM.eyeLeftUpper, LM.eyeLeftLower],
  ]) {
    if ([i, a, b, top, bottom].some((j) => !lm[j] || !Number.isFinite(lm[j].x) || !Number.isFinite(lm[j].y))) continue
    const width = Math.abs(lm[b].x - lm[a].x)
    if (width < 1e-3 || (lm[bottom].y - lm[top].y) / width < 0.1) continue
    const t = (lm[i].x - lm[a].x) / (lm[b].x - lm[a].x)
    vertical += (lm[i].y - (lm[a].y + t * (lm[b].y - lm[a].y))) / width
    visibleEyes++
  }
  if (visibleEyes) vertical /= visibleEyes

  const gxImage = 0.5 + GAZE.yawGain * yaw + GAZE.irisGain * iris + GAZE.positionGain * (nose.x - 0.5)
  const gy = 0.5 + GAZE.pitchGain * pitch + GAZE.verticalIrisGain * vertical + GAZE.positionGain * (nose.y - 0.5)
  return { gx: 1 - gxImage, gy }
}
