import type { GazeSample, LookawayEvent } from './types'

export interface CounterOptions {
  /** Outer fraction of the screen on each edge that counts as a border (the invisible bands). */
  band: number
  /** How long a sample must stay inside a band to count as looking away. */
  minDwellMs: number
  /** No face for this long counts as one `lost` event. */
  lostMs: number
}

export const DEFAULT_OPTIONS: CounterOptions = { band: 0.12, minDwellMs: 2000, lostMs: 1000 }

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
  let bestDepth = -1
  for (const [side, depth] of depths) {
    if (depth >= 0 && depth > bestDepth) {
      best = side
      bestDepth = depth
    }
  }
  return best
}

export interface Counter {
  /** Feed one sample (or null when no face was found). Returns events completed by this sample. */
  push(sample: GazeSample | null, nowMs: number): LookawayEvent[]
  events(): LookawayEvent[]
}

/** Count immediately on entry, again after two seconds, then once per additional second.
 * Returning outside all border bands or losing the face resets the border dwell.
 * Face loss keeps its separate one-event-per-dropout behavior.
 */
export function createCounter(startMs: number, options: Partial<CounterOptions> = {}): Counter {
  const o = { ...DEFAULT_OPTIONS, ...options }
  const all: LookawayEvent[] = []
  let excursion: { next: number } | null = null
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
        return made
      }
      if (excursion === null) {
        emit(nowMs, side)
        excursion = { next: nowMs + o.minDwellMs }
      }
      // Preserve elapsed seconds if frames arrive late. A border-to-border move does not reset dwell.
      while (nowMs >= excursion.next) {
        emit(excursion.next, side)
        excursion.next += 1000
      }
      return made
    },
    events: () => [...all],
  }
}
