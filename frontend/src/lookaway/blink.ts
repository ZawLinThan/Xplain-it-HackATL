import { LM, type Point } from './gaze'

/** Reject closing/reopening frames before unstable iris positions reach calibration or smoothing. */
export class BlinkGate {
  private baseline = [0, 0]
  private previous = [0, 0]
  private until = 0

  accepts(face: readonly Point[], now: number): boolean {
    let closing = false
    const eyes = [
      [LM.eyeRightOuter, LM.eyeRightInner, LM.eyeRightUpper, LM.eyeRightLower],
      [LM.eyeLeftInner, LM.eyeLeftOuter, LM.eyeLeftUpper, LM.eyeLeftLower],
    ]
    for (let i = 0; i < eyes.length; i++) {
      const [a, b, upper, lower] = eyes[i]
      if ([a, b, upper, lower].some((j) => !face[j] || !Number.isFinite(face[j].x) || !Number.isFinite(face[j].y))) continue
      const dx = face[b].x - face[a].x
      if (Math.abs(dx) < 1e-3) continue
      // Remove the eye-corner slope, so head roll does not change the opening estimate.
      const slope = (face[b].y - face[a].y) / dx
      const opening = (face[lower].y - face[upper].y - slope * (face[lower].x - face[upper].x)) / Math.abs(dx)
      const baseline = this.baseline[i]
      const rapidClosure = this.previous[i] > 0 && opening < this.previous[i] * 0.75 && opening < baseline * 0.85
      if (opening < 0.12 || (baseline > 0 && opening < baseline * 0.6) || rapidClosure) closing = true
      this.previous[i] = opening
      // Adapt slowly downward, quickly upward; a blink must not become the open-eye baseline.
      if (!closing && now >= this.until) this.baseline[i] = Math.max(opening, baseline * 0.995)
    }
    if (closing) this.until = now + 180
    return !closing && now >= this.until
  }
}
