import { PRESETS, type Cluster, type LayoutPreset, type SafeZone, type Vec3 } from './scenePresets'
import type { NeuralMode, NeuralQuality } from './sceneTypes'

// A fixed, sparse, seeded layout. It is built once per scene; nothing here runs per frame
// except `drift`, which the renderer's shaders mirror exactly.

export type NodeLayer = 'far' | 'mid' | 'near'

export interface GraphNode {
  x: number
  y: number
  z: number
  /** World-ish point size before perspective. */
  size: number
  brightness: number
  layer: NodeLayer
  /** 0 = electric blue, 1 = violet, 2 = the occasional pink depth accent. */
  hue: 0 | 1 | 2
  /** Drift phase; hubs do not drift. */
  phase: number
  /** Index 0 to 2 for the three main hubs, otherwise -1. */
  hub: number
}

export interface GraphParticle {
  x: number
  y: number
  z: number
  size: number
  phase: number
}

export interface NeuralGraph {
  mode: NeuralMode
  quality: NeuralQuality
  nodes: GraphNode[]
  edges: Array<[number, number]>
  particles: GraphParticle[]
  /** Node indices of the three hubs, in question order. */
  hubs: [number, number, number]
  /** Node index paths between hubs (0→1, 1→2, 2→0) where the graph connects them. */
  hubPaths: number[][]
  adjacency: number[][]
}

/** FNV-1a, so a session id always yields the same layout. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** mulberry32: small, fast and deterministic. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function inSafeZone(x: number, y: number, zones: readonly SafeZone[], margin = 0): boolean {
  return zones.some((z) => ((x - z.cx) / (z.rx + margin)) ** 2 + ((y - z.cy) / (z.ry + margin)) ** 2 < 1)
}

function segmentCrossesZone(a: GraphNode, b: GraphNode, zones: readonly SafeZone[]): boolean {
  if (!zones.length) return false
  for (let i = 1; i < 8; i++) {
    const t = i / 8
    if (inSafeZone(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, zones)) return true
  }
  return false
}

const distance = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6)

function gaussian(random: () => number): number {
  // Box-Muller, clamped so outliers do not escape the composition.
  const u = Math.max(random(), 1e-6)
  const v = random()
  return Math.max(-2.2, Math.min(2.2, Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)))
}

function sampleCluster(cluster: Cluster, random: () => number): Vec3 {
  if (cluster.kind === 'blob') {
    const [cx, cy, cz] = cluster.center
    const [sx, sy, sz] = cluster.spread
    return [cx + gaussian(random) * sx * 0.5, cy + gaussian(random) * sy * 0.5, cz + gaussian(random) * sz * 0.5]
  }
  const t = random()
  const u = 1 - t
  const point = [0, 1, 2].map((k) => u * u * cluster.from[k] + 2 * u * t * cluster.via[k] + t * t * cluster.to[k])
  return [
    point[0] + gaussian(random) * cluster.jitter,
    point[1] + gaussian(random) * cluster.jitter,
    point[2] + gaussian(random) * cluster.jitter * 2.5,
  ]
}

function pickCluster(clusters: readonly Cluster[], random: () => number): Cluster {
  const total = clusters.reduce((sum, c) => sum + c.weight, 0)
  let pick = random() * total
  for (const cluster of clusters) {
    pick -= cluster.weight
    if (pick <= 0) return cluster
  }
  return clusters[clusters.length - 1]
}

function layerOf(z: number): NodeLayer {
  if (z < -0.42) return 'far'
  return 'mid'
}

function shortestPath(adjacency: number[][], from: number, to: number): number[] | null {
  const previous = new Map<number, number>([[from, -1]])
  const queue = [from]
  while (queue.length) {
    const node = queue.shift()!
    if (node === to) break
    for (const next of adjacency[node]) {
      if (previous.has(next)) continue
      previous.set(next, node)
      queue.push(next)
    }
  }
  if (!previous.has(to)) return null
  const path: number[] = []
  for (let node = to; node !== -1; node = previous.get(node)!) path.unshift(node)
  return path
}

function components(count: number, adjacency: number[][]): number[] {
  const label = new Array<number>(count).fill(-1)
  let next = 0
  for (let start = 0; start < count; start++) {
    if (label[start] !== -1) continue
    const stack = [start]
    label[start] = next
    while (stack.length) {
      const node = stack.pop()!
      for (const n of adjacency[node]) {
        if (label[n] === -1) {
          label[n] = next
          stack.push(n)
        }
      }
    }
    next++
  }
  return label
}

export function buildGraph(seed: string, mode: NeuralMode, quality: NeuralQuality = 'standard', preset: LayoutPreset = PRESETS[mode]): NeuralGraph {
  const random = createRandom(hashSeed(`${mode}:${seed}`))
  const zones = preset.safeZones
  const nodes: GraphNode[] = preset.hubs.map(([x, y, z], hub) => ({
    x, y, z, size: 1, brightness: 1, layer: 'mid' as const, hue: 1 as const, phase: 0, hub,
  }))

  // Mid-layer satellites around the clusters, kept off the reading area and away from hubs.
  const wanted = preset.satellites[quality]
  for (let placed = 0, tries = 0; placed < wanted && tries < wanted * 40; tries++) {
    const [x, y, z] = sampleCluster(pickCluster(preset.clusters, random), random)
    if (Math.abs(x) > 1.04 || Math.abs(y) > 1.04 || Math.abs(z) > 1) continue
    if (inSafeZone(x, y, zones, 0.03)) continue
    if (nodes.slice(0, 3).some((hub) => distance(hub, { x, y, z }) < preset.hubClearance)) continue
    if (nodes.some((n) => distance(n, { x, y, z }) < 0.035)) continue
    const layer = layerOf(z)
    const roll = random()
    nodes.push({
      x, y, z,
      size: layer === 'far' ? 0.22 + random() * 0.18 : 0.3 + random() * 0.32,
      brightness: layer === 'far' ? 0.35 + random() * 0.25 : 0.55 + random() * 0.45,
      layer,
      hue: roll < 0.06 ? 2 : roll < 0.52 ? 0 : 1,
      phase: random() * Math.PI * 2,
      hub: -1,
    })
    placed++
  }

  // A few large, soft near-layer nodes along the edges give depth without covering content.
  const nearWanted = preset.nearNodes[quality]
  for (let placed = 0, tries = 0; placed < nearWanted && tries < 400; tries++) {
    const angle = random() * Math.PI * 2
    const x = Math.cos(angle) * (0.82 + random() * 0.2)
    const y = Math.sin(angle) * (0.78 + random() * 0.2)
    if (inSafeZone(x, y, zones, 0.08)) continue
    if (nodes.some((n) => n.layer === 'near' && distance(n, { x, y, z: 0.85 }) < 0.45)) continue
    nodes.push({
      x, y, z: 0.72 + random() * 0.25, size: 0.9 + random() * 0.5, brightness: 0.22 + random() * 0.12,
      layer: 'near', hue: random() < 0.3 ? 2 : 1, phase: random() * Math.PI * 2, hub: -1,
    })
    placed++
  }

  // Sparse connections: each node links to a few close neighbours, built once.
  const edgeKeys = new Set<string>()
  const edges: Array<[number, number]> = []
  const budget = preset.edgeBudget[quality]
  // Keep a few edges in reserve for the bridges that join islands below.
  let limit = budget - 10
  const addEdge = (a: number, b: number, maxLength: number) => {
    if (a === b || edges.length >= limit) return false
    const key = a < b ? `${a}:${b}` : `${b}:${a}`
    if (edgeKeys.has(key)) return false
    if (distance(nodes[a], nodes[b]) > maxLength) return false
    if (segmentCrossesZone(nodes[a], nodes[b], zones)) return false
    edgeKeys.add(key)
    edges.push(a < b ? [a, b] : [b, a])
    return true
  }
  const linkable = nodes.map((n, i) => (n.layer === 'near' ? -1 : i)).filter((i) => i >= 0)
  const nearest = (i: number) =>
    linkable.filter((j) => j !== i).sort((a, b) => distance(nodes[i], nodes[a]) - distance(nodes[i], nodes[b]))

  // Hubs first so their neighbourhoods are always wired, then satellites.
  for (let hub = 0; hub < 3; hub++) {
    let linked = 0
    for (const j of nearest(hub)) {
      if (linked >= 6) break
      if (addEdge(hub, j, preset.maxEdgeLength * 1.5)) linked++
    }
  }
  for (const i of linkable) {
    if (nodes[i].hub >= 0) continue
    const want = 1 + Math.floor(random() * 2.4)
    let linked = 0
    for (const j of nearest(i)) {
      if (linked >= want) break
      if (addEdge(i, j, preset.maxEdgeLength)) linked++
    }
  }

  let adjacency = buildAdjacency(nodes.length, edges)
  limit = budget

  // Join stray islands to the hubs' network with the shortest permitted bridge.
  for (let pass = 0; pass < 12; pass++) {
    const label = components(nodes.length, adjacency)
    const main = label[0]
    let best: [number, number] | null = null
    let bestLength = Infinity
    for (const i of linkable) {
      if (label[i] === main || adjacency[i].length === 0) continue
      for (const j of linkable) {
        if (label[j] !== main) continue
        const length = distance(nodes[i], nodes[j])
        if (length < bestLength && !segmentCrossesZone(nodes[i], nodes[j], zones)) {
          bestLength = length
          best = [i, j]
        }
      }
    }
    if (!best || !addEdge(best[0], best[1], preset.maxEdgeLength * 3)) break
    adjacency = buildAdjacency(nodes.length, edges)
  }

  const hubPaths = [
    [0, 1],
    [1, 2],
    [2, 0],
  ]
    .map(([a, b]) => shortestPath(adjacency, a, b))
    .filter((path): path is number[] => path !== null && path.length > 1)

  // Far background particles establish space; they are not part of the graph.
  const particles: GraphParticle[] = Array.from({ length: preset.particles[quality] }, () => ({
    x: (random() * 2 - 1) * 1.35,
    y: (random() * 2 - 1) * 1.25,
    z: -0.9 - random() * 0.9,
    size: 0.08 + random() * 0.14,
    phase: random() * Math.PI * 2,
  }))

  return { mode, quality, nodes, edges, particles, hubs: [0, 1, 2], hubPaths, adjacency }
}

function buildAdjacency(count: number, edges: Array<[number, number]>): number[][] {
  const adjacency = Array.from({ length: count }, () => [] as number[])
  for (const [a, b] of edges) {
    adjacency[a].push(b)
    adjacency[b].push(a)
  }
  return adjacency
}

/** Small slow wander for decorative nodes. The vertex shaders implement the same formula. */
export function drift(phase: number, time: number, amount: number): [number, number, number] {
  if (phase === 0 || amount === 0) return [0, 0, 0]
  return [
    Math.sin(time * 0.31 + phase) * amount,
    Math.cos(time * 0.27 + phase * 1.3) * amount,
    Math.sin(time * 0.23 + phase * 0.7) * amount * 1.6,
  ]
}
