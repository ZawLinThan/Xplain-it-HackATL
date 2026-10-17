import type { GazeSample } from './types'

/** Something that watches a camera video and reports where the student is looking. */
export interface FaceTracker {
  /** Start sending samples (null when no face is found). Rejects if it cannot run. */
  start(video: HTMLVideoElement, onSample: (sample: GazeSample | null) => void): Promise<void>
  stop(): void
  /** The monitor calls this when the answer timer starts (a scripted tracker uses it as time zero). */
  countingStarted?(): void
}

const FRAME_MS = 66 // about 15 frames a second

/**
 * Stands in for the camera model: stays centred and makes `excursions` look-aways during the
 * answer. For demos (VITE_FAKE_GAZE=4), mock mode and tests. Needs no camera.
 */
export class FakeFaceTracker implements FaceTracker {
  private timer: number | null = null
  private t0 = 0
  private counting = false
  private readonly excursions: number

  constructor(excursions: number) {
    this.excursions = excursions
  }

  start(_video: HTMLVideoElement, onSample: (sample: GazeSample | null) => void): Promise<void> {
    this.t0 = performance.now()
    this.timer = window.setInterval(() => onSample(this.sampleAt(performance.now() - this.t0)), FRAME_MS)
    return Promise.resolve()
  }

  countingStarted(): void {
    this.counting = true
    this.t0 = performance.now()
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }

  /** Excursion k begins at 2 s + 3 s * k and lasts 0.8 s, alternating left and right. */
  private sampleAt(ms: number): GazeSample {
    if (!this.counting) return { gx: 0.5, gy: 0.5 } // reading the question: looking at the screen
    for (let k = 0; k < this.excursions; k++) {
      const begin = 2000 + 3000 * k
      if (ms >= begin && ms < begin + 800) return { gx: k % 2 === 0 ? 0.04 : 0.96, gy: 0.5 }
    }
    return { gx: 0.5, gy: 0.5 }
  }
}
