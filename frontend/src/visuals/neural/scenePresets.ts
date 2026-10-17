import type { NeuralMode, NeuralPhase, NeuralQuality } from './sceneTypes'

// Layout coordinates are normalized: x and y span [-1, 1] across the drawn area, z spans the
// shallow depth volume. The renderer scales them to the viewport.

export type Vec3 = readonly [number, number, number]

/** An ellipse in normalized screen space that decorative nodes and edges stay out of. */
export interface SafeZone {
  cx: number
  cy: number
  rx: number
  ry: number
}

export type Cluster =
  | { kind: 'blob'; center: Vec3; spread: Vec3; weight: number }
  | { kind: 'arc'; from: Vec3; via: Vec3; to: Vec3; jitter: number; weight: number }

export interface LayoutPreset {
  /** Exactly three main hubs, in question order. Fixed so identities never move with scores. */
  hubs: readonly [Vec3, Vec3, Vec3]
  clusters: readonly Cluster[]
  satellites: Record<NeuralQuality, number>
  nearNodes: Record<NeuralQuality, number>
  particles: Record<NeuralQuality, number>
  edgeBudget: Record<NeuralQuality, number>
  maxEdgeLength: number
  /** Decorative nodes keep this distance from hubs so halos and labels stay legible. */
  hubClearance: number
  safeZones: readonly SafeZone[]
  /** How the renderer maps the normalized layout to the viewport. */
  fit: 'fill' | 'contain'
  depth: number
}

export const PRESETS: Record<NeuralMode, LayoutPreset> = {
  // Full-screen round: the network surrounds a calm reading opening in the middle.
  assessment: {
    hubs: [
      [-0.74, 0.6, 0.12],
      [0.8, 0.26, -0.18],
      [-0.6, -0.64, 0.24],
    ],
    clusters: [
      { kind: 'blob', center: [-0.74, 0.58, 0], spread: [0.26, 0.24, 0.55], weight: 3 },
      { kind: 'arc', from: [0.42, 0.95, -0.3], via: [1.12, 0.1, 0.1], to: [0.55, -0.9, -0.2], jitter: 0.1, weight: 2.6 },
      { kind: 'arc', from: [-0.98, -0.88, 0.5], via: [-0.3, -1.02, 0.6], to: [0.5, -0.97, 0.4], jitter: 0.035, weight: 1.2 },
      { kind: 'blob', center: [-0.62, -0.6, 0.2], spread: [0.22, 0.18, 0.4], weight: 1.3 },
      // Corridors around the reading opening keep the three hubs on one connected network.
      { kind: 'arc', from: [-0.82, 0.45, 0], via: [-1.0, -0.05, 0.1], to: [-0.72, -0.5, 0.1], jitter: 0.045, weight: 1.1 },
      { kind: 'arc', from: [-0.5, 0.7, -0.1], via: [0.02, 0.69, -0.3], to: [0.58, 0.6, -0.2], jitter: 0.022, weight: 0.9 },
      { kind: 'blob', center: [0, 0, 0], spread: [0.9, 0.9, 0.7], weight: 1.1 },
    ],
    satellites: { standard: 92, low: 54 },
    nearNodes: { standard: 6, low: 3 },
    particles: { standard: 120, low: 60 },
    edgeBudget: { standard: 150, low: 86 },
    maxEdgeLength: 0.34,
    hubClearance: 0.1,
    safeZones: [
      { cx: 0, cy: 0.1, rx: 0.64, ry: 0.44 }, // question text
      { cx: 0, cy: -0.6, rx: 0.3, ry: 0.32 }, // countdown and answer controls
      { cx: 0.86, cy: -0.84, rx: 0.2, ry: 0.22 }, // camera preview corner
      { cx: 0, cy: 0.92, rx: 0.32, ry: 0.12 }, // question progress eyebrow
    ],
    fit: 'fill',
    depth: 1.5,
  },
  // Hero sculpture beside the headline: compact, asymmetric, no reading opening.
  landing: {
    hubs: [
      [-0.38, 0.36, 0.25],
      [0.48, 0.08, -0.3],
      [-0.08, -0.5, 0.38],
    ],
    clusters: [
      { kind: 'blob', center: [-0.4, 0.36, 0.1], spread: [0.28, 0.24, 0.45], weight: 3 },
      { kind: 'arc', from: [-0.05, 0.78, -0.3], via: [0.85, 0.35, 0.1], to: [0.42, -0.7, -0.15], jitter: 0.08, weight: 2.4 },
      { kind: 'blob', center: [-0.1, -0.5, 0.3], spread: [0.26, 0.18, 0.4], weight: 1.6 },
      { kind: 'arc', from: [-0.85, -0.2, 0.4], via: [-0.5, -0.85, 0.2], to: [0.2, -0.82, 0.5], jitter: 0.06, weight: 1 },
      { kind: 'blob', center: [0, 0, 0], spread: [0.55, 0.5, 0.55], weight: 1 },
    ],
    satellites: { standard: 76, low: 44 },
    nearNodes: { standard: 4, low: 2 },
    particles: { standard: 70, low: 36 },
    edgeBudget: { standard: 130, low: 76 },
    maxEdgeLength: 0.3,
    hubClearance: 0.09,
    safeZones: [],
    fit: 'contain',
    depth: 1.4,
  },
  // Results panel: hubs spread wide so each one is easy to point at and select.
  results: {
    hubs: [
      [-0.62, 0.28, 0.05],
      [0.06, -0.36, 0.18],
      [0.66, 0.3, -0.08],
    ],
    clusters: [
      { kind: 'blob', center: [-0.62, 0.3, 0], spread: [0.24, 0.24, 0.45], weight: 2.2 },
      { kind: 'blob', center: [0.06, -0.36, 0.1], spread: [0.24, 0.2, 0.45], weight: 2 },
      { kind: 'blob', center: [0.66, 0.3, 0], spread: [0.22, 0.24, 0.45], weight: 2 },
      { kind: 'arc', from: [-0.62, 0.28, 0], via: [-0.4, -0.45, 0.25], to: [0.06, -0.36, 0.1], jitter: 0.08, weight: 1.1 },
      { kind: 'arc', from: [0.06, -0.36, 0.1], via: [0.6, -0.4, -0.1], to: [0.66, 0.3, 0], jitter: 0.08, weight: 1.1 },
      { kind: 'arc', from: [-0.62, 0.28, 0], via: [0.02, 0.85, -0.2], to: [0.66, 0.3, 0], jitter: 0.08, weight: 1.1 },
    ],
    satellites: { standard: 78, low: 46 },
    nearNodes: { standard: 4, low: 2 },
    particles: { standard: 80, low: 40 },
    edgeBudget: { standard: 140, low: 80 },
    maxEdgeLength: 0.3,
    hubClearance: 0.17,
    safeZones: [],
    fit: 'contain',
    depth: 1.3,
  },
}

/** How the network behaves in each phase. Values are eased toward, never jumped to. */
export interface PhaseLook {
  /** Ambient pulses per second, independent of the microphone. */
  ambientRate: number
  /** Pulse source: from the active hub, around all hubs, or along hub-to-hub paths. */
  pulseSource: 'active' | 'hubs' | 'paths' | 'any'
  edgeAlpha: number
  nodeGlow: number
  /** 0 to 1: how far the network softly draws in toward the reading opening. */
  gather: number
  /** Broad idle rotation amplitude in radians. */
  sway: number
  /** Whether the microphone envelope may drive pulses and hub expansion. */
  voice: boolean
  activeHalo: number
  dim: number
}

export const PHASE_LOOKS: Record<NeuralPhase, PhaseLook> = {
  idle: { ambientRate: 0.45, pulseSource: 'any', edgeAlpha: 1, nodeGlow: 1, gather: 0, sway: 1, voice: false, activeHalo: 0, dim: 0 },
  preparing: { ambientRate: 0.9, pulseSource: 'any', edgeAlpha: 0.8, nodeGlow: 0.85, gather: 1, sway: 0.6, voice: false, activeHalo: 0.3, dim: 0.1 },
  ready: { ambientRate: 0.3, pulseSource: 'active', edgeAlpha: 0.9, nodeGlow: 0.95, gather: 0, sway: 0.45, voice: false, activeHalo: 1, dim: 0 },
  listening: { ambientRate: 0.12, pulseSource: 'active', edgeAlpha: 1, nodeGlow: 1, gather: 0, sway: 0.25, voice: true, activeHalo: 1, dim: 0 },
  processing: { ambientRate: 2.2, pulseSource: 'paths', edgeAlpha: 0.85, nodeGlow: 0.9, gather: 0.35, sway: 0.4, voice: false, activeHalo: 0.7, dim: 0.05 },
  review: { ambientRate: 0.2, pulseSource: 'active', edgeAlpha: 0.8, nodeGlow: 0.85, gather: 0, sway: 0.45, voice: false, activeHalo: 0.6, dim: 0.05 },
  error: { ambientRate: 0, pulseSource: 'any', edgeAlpha: 0.55, nodeGlow: 0.6, gather: 0, sway: 0.1, voice: false, activeHalo: 0.3, dim: 0.35 },
  complete: { ambientRate: 0.4, pulseSource: 'hubs', edgeAlpha: 1, nodeGlow: 1, gather: 0, sway: 0.7, voice: false, activeHalo: 0, dim: 0 },
}

/** Broad oscillation period in seconds per mode (artistic, tuned in the browser). */
export const SWAY_PERIOD: Record<NeuralMode, number> = { landing: 28, assessment: 36, results: 32 }
export const SWAY_ANGLE: Record<NeuralMode, number> = { landing: 0.42, assessment: 0.07, results: 0.16 }
export const PARALLAX_ANGLE: Record<NeuralMode, number> = { landing: 0.12, assessment: 0, results: 0.07 }
