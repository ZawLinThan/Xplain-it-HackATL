import { createCounter, type Counter, type CounterOptions } from './counter'
import type { FaceTracker } from './FaceTracker'
import type { GazeSample, LookawayPayload } from './types'

export interface MonitorSnapshot {
  /** Calibrated gaze point, or null when no face. */
  sample: GazeSample | null
  counting: boolean
  count: number
  tracked: boolean
}

const MIN_CALIBRATION_SAMPLES = 5
const MAX_CALIBRATION_SAMPLES = 600 // about 40 seconds of reading at 15 frames a second

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * One question's look-away session.
 *   attach()          starts the tracker on the camera video
 *   (reveal)          samples are averaged to find where "looking at the screen" is for this student
 *   beginCounting()   the answer timer started: apply the calibration and start counting
 *   stopCounting()    the recording ended
 *   payload()         what to send with the answer: counts and times only, never images
 * If the tracker cannot run, the payload says tracked: false. Not tracked is not the same as zero.
 */
export class LookAwayMonitor {
  private counter: Counter | null = null
  private tracked = false
  private failed = false
  private warned = false
  private counting = false
  private calibration: { x: number[]; y: number[] } = { x: [], y: [] }
  private offset = { x: 0, y: 0 }
  private last: GazeSample | null = null
  private listeners = new Set<() => void>()
  private snapshot: MonitorSnapshot = { sample: null, counting: false, count: 0, tracked: false }
  private readonly tracker: FaceTracker | null
  private readonly options: Partial<CounterOptions>
  private readonly now: () => number

  constructor(tracker: FaceTracker | null, options: Partial<CounterOptions> = {}, now = () => performance.now()) {
    this.tracker = tracker
    this.options = options
    this.now = now
    if (tracker === null) this.failed = true
  }

  async attach(video: HTMLVideoElement | null): Promise<void> {
    if (!this.tracker || !video) {
      this.markFailed('no camera or tracker')
      return
    }
    try {
      await this.tracker.start(video, (s) => this.onSample(s))
      this.tracked = true
      this.publish()
    } catch (error) {
      this.markFailed(error instanceof Error ? error.message : 'tracker failed')
    }
  }

  beginCounting(): void {
    if (this.counting) return
    if (this.calibration.x.length >= MIN_CALIBRATION_SAMPLES) {
      // the median, so a glance away while reading cannot move the centre
      this.offset = { x: median(this.calibration.x) - 0.5, y: median(this.calibration.y) - 0.5 }
    }
    this.counter = createCounter(this.now(), this.options)
    this.counting = true
    this.tracker?.countingStarted?.()
    this.publish()
  }

  stopCounting(): void {
    this.counting = false
    this.publish()
  }

  /** Stop watching the camera (the recording is over) but keep the result. */
  halt(): void {
    this.tracker?.stop()
    this.counting = false
    this.publish()
  }

  dispose(): void {
    this.tracker?.stop()
    this.counting = false
    this.listeners.clear()
  }

  payload(): LookawayPayload {
    const ok = this.tracked && !this.failed && this.counter !== null
    return { tracked: ok, events: ok ? (this.counter?.events() ?? []) : [] }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): MonitorSnapshot => this.snapshot

  private onSample(raw: GazeSample | null): void {
    if (raw && !this.counting && this.calibration.x.length < MAX_CALIBRATION_SAMPLES) {
      this.calibration.x.push(raw.gx)
      this.calibration.y.push(raw.gy)
    }
    const sample = raw
      ? {
          gx: Math.max(0, Math.min(1, raw.gx - this.offset.x)),
          gy: Math.max(0, Math.min(1, raw.gy - this.offset.y)),
        }
      : null
    this.last = sample
    if (this.counting && this.counter) this.counter.push(sample, this.now())
    this.publish()
  }

  private markFailed(reason: string): void {
    this.failed = true
    if (!this.warned) {
      this.warned = true
      console.warn(`Look-away detector is off for this question (${reason}).`)
    }
    this.publish()
  }

  private publish(): void {
    this.snapshot = {
      sample: this.last,
      counting: this.counting,
      count: this.counter?.events().length ?? 0,
      tracked: this.tracked && !this.failed,
    }
    this.listeners.forEach((l) => l())
  }
}
