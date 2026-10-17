import type { LevelSource } from '../audioLevel'
import type { NeuralGraph } from './graphLayout'
import type { PhaseLook } from './scenePresets'

// A fixed pool of traveling pulses. Nothing is allocated per audio sample or per frame.

export interface Pulse {
  active: boolean
  path: number[]
  /** 0 at the first node, 1 at the last. */
  t: number
  duration: number
  intensity: number
}

export interface EmitInput {
  /** Pulses per second to emit right now. */
  rate: number
  source: PhaseLook['pulseSource']
  /** Node index of the active hub, or -1. */
  activeNode: number
  intensity: number
}

export const MAX_EMIT_RATE = 9
export const MAX_DURATION = 1.9

export function createPulseController(graph: NeuralGraph, random: () => number, poolSize: number) {
  const pulses: Pulse[] = Array.from({ length: poolSize }, () => ({ active: false, path: [], t: 0, duration: 1, intensity: 0 }))
  let pending = 0
  const linked = graph.adjacency.map((n, i) => (n.length ? i : -1)).filter((i) => i >= 0)

  function walk(start: number, steps: number): number[] {
    const path = [start]
    let node = start
    for (let i = 0; i < steps; i++) {
      const options = graph.adjacency[node].filter((n) => !path.includes(n))
      if (!options.length) break
      node = options[Math.floor(random() * options.length)]
      path.push(node)
    }
    return path
  }

  function plan(input: EmitInput): { path: number[]; duration: number } | null {
    if (!linked.length) return null
    if (input.source === 'paths' && graph.hubPaths.length) {
      const route = graph.hubPaths[Math.floor(random() * graph.hubPaths.length)]
      const path = random() < 0.5 ? route : [...route].reverse()
      return { path, duration: Math.min(MAX_DURATION, 0.9 + path.length * 0.12) }
    }
    const start =
      input.source === 'active' && input.activeNode >= 0
        ? input.activeNode
        : input.source === 'hubs' || input.source === 'active'
          ? graph.hubs[Math.floor(random() * 3)]
          : linked[Math.floor(random() * linked.length)]
    const path = walk(start, 2 + Math.floor(random() * 3))
    if (path.length < 2) return null
    return { path, duration: Math.min(1.4, 0.7 + (path.length - 1) * 0.16) }
  }

  return {
    pulses,
    update(dt: number, input: EmitInput) {
      for (const pulse of pulses) {
        if (!pulse.active) continue
        pulse.t += dt / pulse.duration
        if (pulse.t >= 1) pulse.active = false
      }
      const rate = Math.max(0, Math.min(MAX_EMIT_RATE, input.rate))
      if (rate === 0) {
        pending = 0
        return
      }
      // Cap the backlog so a long frame can never release a burst.
      pending = Math.min(1.5, pending + rate * dt)
      while (pending >= 1) {
        pending -= 1
        const slot = pulses.find((p) => !p.active)
        if (!slot) break
        const next = plan(input)
        if (!next) break
        slot.active = true
        slot.path = next.path
        slot.t = 0
        slot.duration = next.duration
        slot.intensity = input.intensity * (0.75 + random() * 0.25)
      }
    },
    reset() {
      pending = 0
      for (const pulse of pulses) pulse.active = false
    },
    activeCount: () => pulses.filter((p) => p.active).length,
  }
}

export type PulseController = ReturnType<typeof createPulseController>

/** Sound envelope with a quick attack and slower release; times in seconds. */
export function followEnvelope(current: number, target: number, dt: number, attack = 0.11, release = 0.35): number {
  const tau = target > current ? attack : release
  const next = current + (target - current) * (1 - Math.exp(-dt / tau))
  return next < 0.001 ? 0 : next
}

/**
 * Holds at most one subscription to the existing amplitude channel. It never opens a microphone;
 * switching to no source unsubscribes at once and drops the level to zero.
 */
export function createLevelGate() {
  let source: LevelSource | undefined
  let unsubscribe: (() => void) | null = null
  let level = 0
  return {
    /** Returns true when the source changed, so callers can reset their envelope. */
    sync(next: LevelSource | undefined): boolean {
      if (next === source) return false
      unsubscribe?.()
      unsubscribe = null
      source = next
      level = 0
      if (next) unsubscribe = next((value) => { level = value })
      return true
    },
    get level() {
      return level
    },
    get subscribed() {
      return unsubscribe !== null
    },
    dispose() {
      this.sync(undefined)
    },
  }
}

/** Voice-driven emission: silence settles to the ambient rate instead of inventing speech. */
export function voiceRate(envelope: number, ambient: number): number {
  if (envelope < 0.04) return ambient
  return Math.min(MAX_EMIT_RATE, ambient + 1 + envelope * 8)
}
