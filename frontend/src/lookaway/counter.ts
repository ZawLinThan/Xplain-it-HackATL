import type { GazeSample, LookawayEvent } from './types'

export interface CounterOptions {
  /** Outer fraction of the screen on each edge that counts as a border (the invisible bands). */
  band: number
  /** The sample must come back inside this margin from every edge before another event can count. */
  rearm: number
  /** How long a sample must stay inside a band to count as looking away. */
  minDwellMs: number
  /** No face for this long counts as one `lost` event. */
  lostMs: number
}

export const DEFAULT_OPTIONS: CounterOptions = { band: 0.12, rearm: 0.18, minDwellMs: 400, lostMs: 1000 }

type BorderSide = 'left' | 'right' | 'top' | 'bottom'

/** Which border the sample is inside, or null. In a corner, the deeper one wins. */
export function borderOf(s: GazeSample, band: number): BorderSide | null {
  const depths: [BorderSide, number][] = [
    ['left', band - s.gx],
    ['right', s.gx - (1 - band)],
    ['top', band - s.gy],
    ['bottom', s.gy - (1 - band)],
  ]
  let best: BorderSide | null = null
  let bestDepth = 0
  for (const [side, depth] of depths) {
    if (depth > bestDepth) {
      best = side
      bestDepth = depth
    }
  }
  return best
}

function inSafeZone(s: GazeSample, rearm: number): boolean {
  return s.gx >= rearm && s.gx <= 1 - rearm && s.gy >= rearm && s.gy <= 1 - rearm
}

export interface Counter {
  /** Feed one sample (or null when no face was found). Returns events completed by this sample. */
  push(sample: GazeSample | null, nowMs: number): LookawayEvent[]
  events(): LookawayEvent[]
}

/**
 * Counts how often a student looks away. Pure: no DOM and no clock of its own, so it is tested
 * with synthetic samples.
 *
 * - One excursion into a border is one event, however long it lasts, and only if it lasts
 *   `minDwellMs`. A flicker shorter than that is ignored.
 * - After an event nothing more counts until the sample is back inside the safe zone.
 * - No face for `lostMs` is one `lost` event.
 * - Event times are relative to `startMs` (when counting began).
 */
export function createCounter(startMs: number, options: Partial<CounterOptions> = {}): Counter {
  const o = { ...DEFAULT_OPTIONS, ...options }
  const all: LookawayEvent[] = []
  let armed = true
  let excursion: { side: BorderSide; since: number } | null = null
  let lostSince: number | null = null
  let lostReported = false

  const rel = (t: number) => Math.max(0, Math.round(t - startMs))

  return {
    push(sample, nowMs) {
      const made: LookawayEvent[] = []
      const emit = (t: number, side: LookawayEvent['side']) => {
        const event = { t_ms: Math.min(60000, rel(t)), side }
        all.push(event)
        made.push(event)
      }

      if (sample === null) {
        excursion = null
        if (lostSince === null) lostSince = nowMs
        if (!lostReported && nowMs - lostSince >= o.lostMs) {
          lostReported = true
          emit(lostSince, 'lost')
        }
        return made
      }
      lostSince = null
      lostReported = false

      const side = borderOf(sample, o.band)
      if (side === null) {
        excursion = null
        if (inSafeZone(sample, o.rearm)) armed = true
        return made
      }
      if (!armed) return made
      if (excursion === null || excursion.side !== side) excursion = { side, since: nowMs }
      if (nowMs - excursion.since >= o.minDwellMs) {
        emit(excursion.since, side)
        armed = false
        excursion = null
      }
      return made
    },
    events: () => [...all],
  }
}
