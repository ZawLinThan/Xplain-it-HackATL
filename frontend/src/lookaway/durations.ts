import { DEFAULT_OPTIONS, borderOf } from './counter'
import type { LookawayDuration, GazeSample } from './types'

/** One duration entry per continuous visit to any boundary, including corners. */
export class DurationLog {
  private completed: LookawayDuration[] = []
  private current: { side: LookawayDuration['side']; start: number; last: number } | null = null
  private readonly startedAt: number
  constructor(startedAt: number) { this.startedAt = startedAt }

  push(sample: GazeSample | null, now: number): void {
    const side = sample ? borderOf(sample, DEFAULT_OPTIONS.band) : null
    if (this.current && (side !== this.current.side || now - this.current.last > 450)) this.finish()
    if (side) {
      this.current ??= { side, start: now, last: now }
      this.current.last = now
    }
  }

  finish(): void {
    const entry = this.entry()
    if (entry && this.completed.length < 200) this.completed.push(entry)
    this.current = null
  }

  entries(): LookawayDuration[] {
    const entry = this.entry()
    return [...this.completed, ...(entry && this.completed.length < 200 ? [entry] : [])]
  }

  private entry(): LookawayDuration | null {
    if (!this.current) return null
    const start = Math.max(0, Math.min(60000, Math.round(this.current.start - this.startedAt)))
    const duration = Math.min(60000 - start, Math.round(this.current.last - this.current.start))
    return { t_ms: start, duration_ms: duration, side: this.current.side }
  }
}
