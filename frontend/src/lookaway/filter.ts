import type { GazeSample } from './types'

/** Suppress isolated landmark spikes, then smooth with a frame-rate independent 100 ms lag. */
export class GazeFilter {
  private history: GazeSample[] = []
  private last: GazeSample | null = null
  private time = 0

  push(sample: GazeSample | null, now: number): GazeSample | null {
    if (!sample || !Number.isFinite(sample.gx) || !Number.isFinite(sample.gy)) {
      this.history = []
      this.last = null
      return null // never invent a face or carry stale gaze through a dropout
    }
    if (now - this.time > 500) {
      this.history = []
      this.last = null
    }
    this.history.push(sample)
    if (this.history.length > 3) this.history.shift()
    const middle = (axis: keyof GazeSample) => {
      const values = this.history.map((s) => s[axis]).sort((a, b) => a - b)
      return values[Math.floor(values.length / 2)]
    }
    const target = { gx: middle('gx'), gy: middle('gy') }
    const alpha = 1 - Math.exp(-Math.max(0, now - this.time) / 100)
    this.last = this.last
      ? { gx: this.last.gx + alpha * (target.gx - this.last.gx), gy: this.last.gy + alpha * (target.gy - this.last.gy) }
      : target
    this.time = now
    return this.last
  }
}
