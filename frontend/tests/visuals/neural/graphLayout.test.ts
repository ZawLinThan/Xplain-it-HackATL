import { describe, expect, it } from 'vitest'
import { buildGraph, drift, inSafeZone } from '../../../src/visuals/neural/graphLayout'
import { PRESETS } from '../../../src/visuals/neural/scenePresets'
import type { NeuralMode } from '../../../src/visuals/neural/sceneTypes'

const modes: NeuralMode[] = ['landing', 'assessment', 'results']

describe('neural graph layout', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(buildGraph('session-a', 'assessment')).toEqual(buildGraph('session-a', 'assessment'))
    expect(buildGraph('session-a', 'assessment').nodes).not.toEqual(buildGraph('session-b', 'assessment').nodes)
  })

  it.each(modes)('keeps the three %s hubs fixed at their preset positions', (mode) => {
    for (const seed of ['x', 'y']) {
      const graph = buildGraph(seed, mode)
      expect(graph.hubs).toEqual([0, 1, 2])
      graph.hubs.forEach((node, i) => {
        const { x, y, z, hub } = graph.nodes[node]
        expect([x, y, z]).toEqual([...PRESETS[mode].hubs[i]])
        expect(hub).toBe(i)
      })
      expect(graph.nodes.filter((n) => n.hub >= 0)).toHaveLength(3)
    }
  })

  it.each(modes)('produces bounded, valid, sparse %s edges', (mode) => {
    for (const quality of ['standard', 'low'] as const) {
      const graph = buildGraph('bounded', mode, quality)
      const preset = PRESETS[mode]
      expect(graph.edges.length).toBeLessThanOrEqual(preset.edgeBudget[quality])
      expect(graph.edges.length).toBeGreaterThan(graph.nodes.length * 0.6)
      expect(graph.nodes.length).toBeLessThanOrEqual(3 + preset.satellites[quality] + preset.nearNodes[quality])
      expect(graph.particles).toHaveLength(preset.particles[quality])
      const keys = new Set<string>()
      for (const [a, b] of graph.edges) {
        expect(a).toBeLessThan(b)
        expect(b).toBeLessThan(graph.nodes.length)
        const key = `${a}:${b}`
        expect(keys.has(key)).toBe(false)
        keys.add(key)
        const length = Math.hypot(graph.nodes[a].x - graph.nodes[b].x, graph.nodes[a].y - graph.nodes[b].y)
        expect(length).toBeLessThan(preset.maxEdgeLength * 2.3)
      }
    }
  })

  it('keeps decorative nodes and edges out of the question reading area', () => {
    const graph = buildGraph('reading', 'assessment')
    const zones = PRESETS.assessment.safeZones
    graph.nodes.forEach((n) => expect(inSafeZone(n.x, n.y, zones)).toBe(false))
    for (const [a, b] of graph.edges) {
      const mid = { x: (graph.nodes[a].x + graph.nodes[b].x) / 2, y: (graph.nodes[a].y + graph.nodes[b].y) / 2 }
      expect(inSafeZone(mid.x, mid.y, zones)).toBe(false)
    }
  })

  it('wires every hub and finds paths between hubs for the processing sweep', () => {
    for (const mode of modes) {
      const graph = buildGraph('paths', mode)
      graph.hubs.forEach((h) => expect(graph.adjacency[h].length).toBeGreaterThan(0))
      expect(graph.hubPaths.length).toBeGreaterThan(0)
      for (const path of graph.hubPaths) {
        for (let i = 1; i < path.length; i++) expect(graph.adjacency[path[i - 1]]).toContain(path[i])
      }
    }
  })

  it('never drifts hubs', () => {
    expect(drift(0, 12, 0.03)).toEqual([0, 0, 0])
    expect(drift(1.2, 12, 0.03).some((v) => v !== 0)).toBe(true)
  })
})
