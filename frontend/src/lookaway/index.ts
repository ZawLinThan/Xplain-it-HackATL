import { FakeFaceTracker, type FaceTracker } from './FaceTracker'
import { MediaPipeFaceTracker, loadLandmarker } from './MediaPipeFaceTracker'

export { LookAwayMonitor, type MonitorSnapshot } from './monitor'
export type { LookawayPayload } from './types'

/**
 * Pick the tracker. VITE_FAKE_GAZE=<n> scripts n look-aways per answer (demos and tests), mock
 * mode uses a quiet fake, and otherwise the real in-browser model runs. null = detector off.
 */
export function createTracker(enabled: boolean): FaceTracker | null {
  if (!enabled) return null
  const fake = import.meta.env.VITE_FAKE_GAZE
  if (fake !== undefined && fake !== '') return new FakeFaceTracker(Number(fake) || 0)
  if (import.meta.env.VITE_MOCK === '1') return new FakeFaceTracker(0)
  return new MediaPipeFaceTracker()
}

/** Start loading the model early (while the student reads the start screen). Failures are quiet. */
export function preloadTracker(enabled: boolean): void {
  if (!enabled || import.meta.env.VITE_MOCK === '1' || import.meta.env.VITE_FAKE_GAZE) return
  loadLandmarker().catch(() => undefined)
}
