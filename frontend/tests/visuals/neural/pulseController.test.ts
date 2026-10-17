import { describe, expect, it, vi } from 'vitest'
import { createLevelChannel } from '../../../src/visuals/audioLevel'
import { buildGraph, createRandom } from '../../../src/visuals/neural/graphLayout'
import { MAX_EMIT_RATE, createLevelGate, createPulseController, followEnvelope, voiceRate } from '../../../src/visuals/neural/pulseController'

const graph = buildGraph('pulses', 'assessment')
const input = { rate: 4, source: 'any' as const, activeNode: -1, intensity: 0.6 }

describe('pulse pool', () => {
  it('never exceeds its fixed pool, even with sustained loud input', () => {
    const pulses = createPulseController(graph, createRandom(1), 12)
    for (let i = 0; i < 600; i++) pulses.update(1 / 60, { ...input, rate: 1000 })
    expect(pulses.pulses).toHaveLength(12)
    expect(pulses.activeCount()).toBeLessThanOrEqual(12)
    expect(voiceRate(1, 0.1)).toBeLessThanOrEqual(MAX_EMIT_RATE)
  })

  it('emits nothing at rate zero and clears on reset', () => {
    const pulses = createPulseController(graph, createRandom(2), 12)
    for (let i = 0; i < 120; i++) pulses.update(1 / 60, { ...input, rate: 0 })
    expect(pulses.activeCount()).toBe(0)
    for (let i = 0; i < 120; i++) pulses.update(1 / 60, input)
    expect(pulses.activeCount()).toBeGreaterThan(0)
    pulses.reset()
    expect(pulses.activeCount()).toBe(0)
  })

  it('does not release a burst after a long frame', () => {
    const pulses = createPulseController(graph, createRandom(3), 24)
    pulses.update(5, input)
    expect(pulses.activeCount()).toBeLessThanOrEqual(1)
  })

  it('starts listening pulses at the active hub and processing pulses along hub paths', () => {
    const pulses = createPulseController(graph, createRandom(4), 24)
    for (let i = 0; i < 60; i++) pulses.update(1 / 60, { ...input, source: 'active', activeNode: graph.hubs[1] })
    pulses.pulses.filter((p) => p.active).forEach((p) => expect(p.path[0]).toBe(graph.hubs[1]))
    pulses.reset()
    for (let i = 0; i < 60; i++) pulses.update(1 / 60, { ...input, source: 'paths' })
    const routes = graph.hubPaths.flatMap((path) => [path.join(), [...path].reverse().join()])
    pulses.pulses.filter((p) => p.active).forEach((p) => expect(routes).toContain(p.path.join()))
  })
})

describe('voice envelope', () => {
  it('rises quickly, releases more slowly, and silence falls back to the ambient rate', () => {
    let up = 0
    let down = 1
    for (let i = 0; i < 6; i++) up = followEnvelope(up, 1, 1 / 60)
    for (let i = 0; i < 6; i++) down = followEnvelope(down, 0, 1 / 60)
    expect(up).toBeGreaterThan(1 - down)
    expect(voiceRate(0, 0.12)).toBe(0.12)
    expect(voiceRate(0.02, 0.12)).toBe(0.12)
    expect(voiceRate(0.6, 0.12)).toBeGreaterThan(0.12)
  })
})

describe('level gate', () => {
  it('subscribes to the existing channel only while given a source, then unsubscribes and zeroes', () => {
    const channel = createLevelChannel()
    const subscribe = vi.fn(channel.subscribe)
    const gate = createLevelGate()
    expect(gate.sync(subscribe)).toBe(true)
    expect(subscribe).toHaveBeenCalledTimes(1)
    channel.publish(0.8)
    expect(gate.level).toBe(0.8)
    expect(gate.sync(subscribe)).toBe(false) // same source: no duplicate subscription
    expect(subscribe).toHaveBeenCalledTimes(1)
    gate.sync(undefined) // recording stopped
    expect(gate.subscribed).toBe(false)
    expect(gate.level).toBe(0)
    channel.publish(1)
    expect(gate.level).toBe(0)
    gate.sync(subscribe)
    gate.dispose() // unmount
    channel.publish(1)
    expect(gate.level).toBe(0)
    expect(gate.subscribed).toBe(false)
  })
})
