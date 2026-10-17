import * as THREE from 'three'
import type { LevelSource } from '../audioLevel'
import { buildGraph, createRandom, drift, hashSeed, type NeuralGraph } from './graphLayout'
import { litSegments } from './questionVisuals'
import { createLevelGate, createPulseController, followEnvelope, voiceRate } from './pulseController'
import { PARALLAX_ANGLE, PHASE_LOOKS, PRESETS, SWAY_ANGLE, SWAY_PERIOD, type PhaseLook } from './scenePresets'
import { SCORE_SEGMENTS, type HubAnchor, type NeuralMode, type NeuralPhase, type NeuralQuality, type QuestionVisual } from './sceneTypes'

// One owned WebGL scene. It reads presentation state only: it never opens media, never
// fetches, and never decides anything about grading.

export interface RendererState {
  phase: NeuralPhase
  questions: QuestionVisual[]
  activeQuestionId?: string
  selectedQuestionId?: string
  hoveredQuestionId?: string
  levelSource?: LevelSource
  reducedMotion: boolean
  paused: boolean
}

export interface RendererOptions {
  container: HTMLElement
  mode: NeuralMode
  seed: string
  quality: NeuralQuality
  onHubsProjected?: (anchors: HubAnchor[]) => void
  /** Called at most once if standard quality is measurably too slow while visible. */
  onSlow?: () => void
  /** A shader failed to compile or the GL context was lost: show the static version instead. */
  onError?: () => void
}

export interface NeuralRenderer {
  update(state: RendererState): void
  dispose(): void
}

const CAMERA_Z = 4.2
const FOV = 46
const DRIFT = 0.014
const GATHER = 0.04

const COLORS = {
  dark: { blue: '#3985ff', violet: '#8a5cff', pink: '#e66ac4', core: '#f3edff', cyan: '#78d9ff', lit: '#c3a8ff', neutral: '#9c97b0', select: '#f3edff' },
  light: { blue: '#5a7cf0', violet: '#7d58ee', pink: '#d06aa8', core: '#5532c9', cyan: '#2f86ff', lit: '#6742df', neutral: '#9c97b0', select: '#4b2bbd' },
}

const DRIFT_GLSL = /* glsl */ `
  uniform float uTime;
  uniform float uDrift;
  uniform float uGather;
  vec3 driftOf(float phase) {
    if (phase == 0.0) return vec3(0.0);
    return vec3(sin(uTime * 0.31 + phase), cos(uTime * 0.27 + phase * 1.3), sin(uTime * 0.23 + phase * 0.7) * 1.6) * uDrift;
  }
  vec3 gathered(vec3 p, float mask) {
    p.xy *= 1.0 - uGather * ${GATHER.toFixed(3)} * mask;
    return p;
  }
  float movable(float phase) { return phase == 0.0 ? 0.0 : 1.0; }
  vec3 neuralPosition(vec3 base, float phase) {
    return gathered(base + driftOf(phase), movable(phase));
  }
`

const NODE_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aBright;
  attribute float aHue;
  attribute float aPhase;
  attribute float aGlow;
  attribute float aSoft;
  attribute float aHub;
  uniform float uSizeScale;
  uniform float uActiveHub;
  uniform float uHubExpand;
  uniform float uNodeGlow;
  uniform float uTwinkle;
  varying float vBright;
  varying float vHue;
  varying float vSoft;
  varying float vGlow;
  ${DRIFT_GLSL}
  void main() {
    vec3 p = neuralPosition(position, aPhase);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    float expand = (aHub >= 0.0 && abs(aHub - uActiveHub) < 0.5) ? uHubExpand : 0.0;
    gl_PointSize = aSize * uSizeScale * (1.0 + aGlow * 0.3 + expand) / -mv.z;
    gl_Position = projectionMatrix * mv;
    float twinkle = 1.0 - uTwinkle * 0.2 * (0.5 + 0.5 * sin(uTime * 1.3 + aPhase * 3.0));
    vBright = aBright * uNodeGlow * twinkle * mix(0.5, 1.0, smoothstep(-2.0, 0.4, p.z));
    vHue = aHue;
    vSoft = aSoft;
    vGlow = aGlow;
  }
`

const NODE_FRAGMENT = /* glsl */ `
  uniform vec3 uBlue;
  uniform vec3 uViolet;
  uniform vec3 uPink;
  uniform vec3 uCore;
  uniform float uDim;
  varying float vBright;
  varying float vHue;
  varying float vSoft;
  varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    vec3 tint = vHue < 0.5 ? uBlue : (vHue < 1.5 ? uViolet : uPink);
    float core = smoothstep(mix(0.2, 0.12, vSoft), 0.0, d) * (1.0 - vSoft * 0.85);
    float halo = exp(-d * d * mix(6.0, 3.0, vSoft)) * mix(0.85, 0.4, vSoft) * (1.0 - smoothstep(0.75, 1.0, d));
    float alpha = (core + halo * (1.0 + vGlow * 1.4)) * vBright * (1.0 - uDim);
    gl_FragColor = vec4(mix(tint, uCore, core), alpha);
  }
`

// Each connection is a gentle quadratic curve between two drifting nodes, drawn as a soft
// screen-space ribbon (GL lines are one device pixel wide). The CPU mirrors the curve in
// edgePoint() so pulses travel along the drawn path.
const EDGE_VERTEX = /* glsl */ `
  attribute vec3 aEnd;
  attribute vec3 aBend;
  attribute float aT;
  attribute float aSide;
  attribute float aWidth;
  attribute float aPhase;
  attribute float aPhaseEnd;
  attribute float aAlpha;
  attribute float aHue;
  attribute float aGlow;
  uniform vec2 uResolution;
  uniform float uLineScale;
  varying float vAlpha;
  varying float vHue;
  varying float vGlow;
  varying float vSide;
  ${DRIFT_GLSL}
  vec3 curveAt(vec3 a, vec3 c, vec3 b, float t) {
    return mix(mix(a, c, t), mix(c, b, t), t);
  }
  void main() {
    vec3 a = position + driftOf(aPhase);
    vec3 b = aEnd + driftOf(aPhaseEnd);
    vec3 c = (a + b) * 0.5 + aBend;
    float ma = movable(aPhase);
    float mb = movable(aPhaseEnd);
    float t2 = aT < 0.99 ? aT + 0.01 : aT - 0.01;
    vec3 p = gathered(curveAt(a, c, b, aT), mix(ma, mb, aT));
    vec3 q = gathered(curveAt(a, c, b, t2), mix(ma, mb, t2));
    vec4 cp = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vec4 cq = projectionMatrix * modelViewMatrix * vec4(q, 1.0);
    vec2 halfRes = uResolution * 0.5;
    vec2 d = (cq.xy / cq.w - cp.xy / cp.w) * halfRes * (aT < 0.99 ? 1.0 : -1.0);
    vec2 dir = length(d) > 1e-5 ? normalize(d) : vec2(1.0, 0.0);
    vec2 normal = vec2(-dir.y, dir.x);
    float width = aWidth * uLineScale * (1.0 + aGlow * 0.7);
    cp.xy += normal * aSide * width * 0.5 / halfRes * cp.w;
    gl_Position = cp;
    vAlpha = aAlpha * mix(0.35, 1.0, smoothstep(-2.0, 0.6, p.z));
    vHue = aHue;
    vGlow = aGlow;
    vSide = aSide;
  }
`

const EDGE_FRAGMENT = /* glsl */ `
  uniform vec3 uBlue;
  uniform vec3 uViolet;
  uniform vec3 uCyan;
  uniform float uAlpha;
  uniform float uDim;
  varying float vAlpha;
  varying float vHue;
  varying float vGlow;
  varying float vSide;
  void main() {
    // Soft cross-section: a bright thread with a faint falloff, antialiased at the ribbon edge.
    float profile = exp(-vSide * vSide * 3.2) * (1.0 - smoothstep(0.7, 1.0, abs(vSide)));
    vec3 color = mix(mix(uBlue, uViolet, clamp(vHue, 0.0, 1.0)), uCyan, clamp(vGlow * 0.5, 0.0, 0.6));
    gl_FragColor = vec4(color, profile * vAlpha * uAlpha * (1.0 + vGlow * 2.2) * (1.0 - uDim));
  }
`

const PULSE_VERTEX = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  uniform float uSizeScale;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uSizeScale / -mv.z;
    gl_Position = projectionMatrix * mv;
    vAlpha = aAlpha;
  }
`

const PULSE_FRAGMENT = /* glsl */ `
  uniform vec3 uCyan;
  uniform vec3 uCore;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0 || vAlpha <= 0.0) discard;
    float core = smoothstep(0.3, 0.0, d);
    float halo = exp(-d * d * 5.0) * 0.6 * (1.0 - smoothstep(0.8, 1.0, d));
    gl_FragColor = vec4(mix(uCyan, uCore, core * 0.8), (core + halo) * vAlpha);
  }
`

interface HubRing {
  group: THREE.Group
  segments: THREE.Mesh[]
  segmentMaterials: THREE.MeshBasicMaterial[]
  dashMaterial: THREE.MeshBasicMaterial
  dashes: THREE.Mesh[]
  halo: THREE.Mesh
  haloMaterial: THREE.MeshBasicMaterial
  select: THREE.Mesh
  selectMaterial: THREE.MeshBasicMaterial
  /** Eased display values. */
  shown: { halo: number; select: number; dash: number; segments: number[] }
}

const ease = (current: number, target: number, dt: number, tau: number) =>
  current + (target - current) * (1 - Math.exp(-dt / Math.max(tau, 1e-3)))

export function createNeuralRenderer(options: RendererOptions): NeuralRenderer {
  const { container, mode, seed, quality } = options
  const preset = PRESETS[mode]
  const theme = mode === 'landing' ? 'light' : 'dark'
  const palette = COLORS[theme]
  // Normal blending on the light page needs more opacity than additive light on dark.
  const themeGain = theme === 'light' ? 1.5 : 1
  const graph: NeuralGraph = buildGraph(seed, mode, quality)

  if (new URLSearchParams(window.location.search).get('neural') === 'fail') {
    throw new Error('Forced neural renderer failure (?neural=fail).')
  }

  const renderer = new THREE.WebGLRenderer({ antialias: quality === 'standard', alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  const pixelRatio = Math.min(window.devicePixelRatio || 1, quality === 'standard' ? 1.5 : 1)
  renderer.setPixelRatio(pixelRatio)
  renderer.domElement.className = 'neural-canvas'
  renderer.domElement.setAttribute('aria-hidden', 'true')
  let errored = false
  const fail = () => {
    if (errored) return
    errored = true
    options.onError?.()
  }
  renderer.debug.onShaderError = fail
  renderer.domElement.addEventListener('webglcontextlost', fail)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 40)
  camera.position.set(0, 0, CAMERA_Z)
  const root = new THREE.Group()
  const network = new THREE.Group()
  root.add(network)
  scene.add(root)

  const blending = theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending
  const color = (hex: string) => new THREE.Color(hex)
  const disposables: Array<{ dispose(): void }> = []
  const keep = <T extends { dispose(): void }>(item: T) => {
    disposables.push(item)
    return item
  }

  // Positions are pre-scaled so each node lands at its normalized screen position at rest,
  // whatever its depth. Depth then shows through parallax, size and brightness.
  const toLocal = (x: number, y: number, z: number): [number, number, number] => {
    const worldZ = z * preset.depth
    const k = (CAMERA_Z - worldZ) / CAMERA_Z
    return [x * k, y * k, worldZ]
  }

  // ---- Nodes, hubs and background particles in one batched draw.
  const nodeCount = graph.nodes.length + graph.particles.length
  const nodePositions = new Float32Array(nodeCount * 3)
  const nodeAttrs = {
    aSize: new Float32Array(nodeCount),
    aBright: new Float32Array(nodeCount),
    aHue: new Float32Array(nodeCount),
    aPhase: new Float32Array(nodeCount),
    aGlow: new Float32Array(nodeCount),
    aSoft: new Float32Array(nodeCount),
    aHub: new Float32Array(nodeCount),
  }
  const hubSize = mode === 'results' ? 2.6 : mode === 'landing' ? 2.1 : 2.3
  const localPositions: Array<[number, number, number]> = []
  graph.nodes.forEach((node, i) => {
    const p = toLocal(node.x, node.y, node.z)
    localPositions.push(p)
    nodePositions.set(p, i * 3)
    nodeAttrs.aSize[i] = node.hub >= 0 ? hubSize : node.layer === 'mid' ? node.size * 1.45 : node.size
    nodeAttrs.aBright[i] = node.hub >= 0 ? 1 : node.brightness
    nodeAttrs.aHue[i] = node.hue
    nodeAttrs.aPhase[i] = node.phase
    nodeAttrs.aSoft[i] = node.layer === 'near' ? 1 : 0
    nodeAttrs.aHub[i] = node.hub
  })
  graph.particles.forEach((particle, j) => {
    const i = graph.nodes.length + j
    nodePositions.set(toLocal(particle.x, particle.y, particle.z), i * 3)
    nodeAttrs.aSize[i] = particle.size
    nodeAttrs.aBright[i] = 0.4
    nodeAttrs.aHue[i] = 0
    nodeAttrs.aPhase[i] = particle.phase
    nodeAttrs.aSoft[i] = 0.4
    nodeAttrs.aHub[i] = -1
  })
  const nodeGeometry = keep(new THREE.BufferGeometry())
  nodeGeometry.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3))
  for (const [name, array] of Object.entries(nodeAttrs)) nodeGeometry.setAttribute(name, new THREE.BufferAttribute(array, 1))
  const glowAttribute = nodeGeometry.getAttribute('aGlow') as THREE.BufferAttribute
  glowAttribute.setUsage(THREE.DynamicDrawUsage)

  const sharedUniforms = {
    uTime: { value: 0 },
    uDrift: { value: DRIFT },
    uGather: { value: 0 },
    uSizeScale: { value: 100 },
    uDim: { value: 0 },
  }
  const nodeMaterial = keep(new THREE.ShaderMaterial({
    vertexShader: NODE_VERTEX,
    fragmentShader: NODE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending,
    uniforms: {
      ...sharedUniforms,
      uActiveHub: { value: -1 },
      uHubExpand: { value: 0 },
      uNodeGlow: { value: 1 },
      uTwinkle: { value: 1 },
      uBlue: { value: color(palette.blue) },
      uViolet: { value: color(palette.violet) },
      uPink: { value: color(palette.pink) },
      uCore: { value: color(palette.core) },
    },
  }))
  const nodePoints = new THREE.Points(nodeGeometry, nodeMaterial)
  nodePoints.frustumCulled = false
  network.add(nodePoints)

  // ---- Sparse, gently curved connections. Curves bow away from the reading opening.
  const SEGMENTS = 10
  const VERTS = (SEGMENTS + 1) * 2
  const edgeCount = graph.edges.length
  const bendRandom = createRandom(hashSeed(`bends:${seed}`))
  const bends = new Map<string, [number, number, number]>()
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
  const vertexCount = edgeCount * VERTS
  const edgeStart = new Float32Array(vertexCount * 3)
  const edgeEnd = new Float32Array(vertexCount * 3)
  const edgeBend = new Float32Array(vertexCount * 3)
  const edgeT = new Float32Array(vertexCount)
  const edgeSide = new Float32Array(vertexCount)
  const edgeWidth = new Float32Array(vertexCount)
  const edgePhase = new Float32Array(vertexCount)
  const edgePhaseEnd = new Float32Array(vertexCount)
  const edgeAlpha = new Float32Array(vertexCount)
  const edgeHue = new Float32Array(vertexCount)
  const edgeGlow = new Float32Array(vertexCount)
  const edgeIndex: number[] = []
  graph.edges.forEach(([a, b], e) => {
    const na = graph.nodes[a]
    const nb = graph.nodes[b]
    const [ax, ay] = localPositions[a]
    const [bx, by] = localPositions[b]
    const length = Math.hypot(bx - ax, by - ay) || 1
    const px = -(by - ay) / length
    const py = (bx - ax) / length
    const mx = (ax + bx) / 2
    const my = (ay + by) / 2
    const away = preset.safeZones.length ? Math.sign(px * mx + py * my) || 1 : bendRandom() < 0.5 ? -1 : 1
    const amount = length * (0.1 + bendRandom() * 0.16) * away
    const bend: [number, number, number] = [px * amount, py * amount, (bendRandom() - 0.5) * length * 0.3]
    bends.set(edgeKey(a, b), bend)
    const hubEdge = na.hub >= 0 || nb.hub >= 0
    const far = na.layer === 'far' || nb.layer === 'far'
    const base = (hubEdge ? 0.62 : far ? 0.24 : 0.42) * (theme === 'light' ? 1.35 : 1)
    const width = hubEdge ? 3.2 : far ? 1.8 : 2.4
    for (let v = 0; v < VERTS; v++) {
      const i = e * VERTS + v
      const t = Math.floor(v / 2) / SEGMENTS
      edgeStart.set(localPositions[a], i * 3)
      edgeEnd.set(localPositions[b], i * 3)
      edgeBend.set(bend, i * 3)
      edgeT[i] = t
      edgeSide[i] = v % 2 ? 1 : -1
      edgeWidth[i] = width
      edgePhase[i] = na.phase
      edgePhaseEnd[i] = nb.phase
      edgeAlpha[i] = base
      edgeHue[i] = Math.min(1, na.hue) * (1 - t) + Math.min(1, nb.hue) * t
    }
    for (let s = 0; s < SEGMENTS; s++) {
      const k = e * VERTS + s * 2
      edgeIndex.push(k, k + 1, k + 2, k + 1, k + 3, k + 2)
    }
  })
  const edgeGeometry = keep(new THREE.BufferGeometry())
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(edgeStart, 3))
  edgeGeometry.setAttribute('aEnd', new THREE.BufferAttribute(edgeEnd, 3))
  edgeGeometry.setAttribute('aBend', new THREE.BufferAttribute(edgeBend, 3))
  edgeGeometry.setAttribute('aT', new THREE.BufferAttribute(edgeT, 1))
  edgeGeometry.setAttribute('aSide', new THREE.BufferAttribute(edgeSide, 1))
  edgeGeometry.setAttribute('aWidth', new THREE.BufferAttribute(edgeWidth, 1))
  edgeGeometry.setAttribute('aPhase', new THREE.BufferAttribute(edgePhase, 1))
  edgeGeometry.setAttribute('aPhaseEnd', new THREE.BufferAttribute(edgePhaseEnd, 1))
  edgeGeometry.setAttribute('aAlpha', new THREE.BufferAttribute(edgeAlpha, 1))
  edgeGeometry.setAttribute('aHue', new THREE.BufferAttribute(edgeHue, 1))
  edgeGeometry.setIndex(edgeIndex)
  const edgeGlowAttribute = new THREE.BufferAttribute(edgeGlow, 1)
  edgeGlowAttribute.setUsage(THREE.DynamicDrawUsage)
  edgeGeometry.setAttribute('aGlow', edgeGlowAttribute)
  const edgeMaterial = keep(new THREE.ShaderMaterial({
    vertexShader: EDGE_VERTEX,
    fragmentShader: EDGE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending,
    uniforms: {
      ...sharedUniforms,
      uAlpha: { value: 1 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uLineScale: { value: pixelRatio },
      uBlue: { value: color(palette.blue) },
      uViolet: { value: color(palette.violet) },
      uCyan: { value: color(palette.cyan) },
    },
  }))
  const edgeLines = new THREE.Mesh(edgeGeometry, edgeMaterial)
  edgeLines.frustumCulled = false
  network.add(edgeLines)

  // ---- Traveling pulses: a fixed pool, each drawn as a head plus two trailing points.
  const poolSize = quality === 'standard' ? 18 : 10
  const TRAIL = 3
  const random = createRandom(hashSeed(`pulses:${seed}`))
  const pulses = createPulseController(graph, random, poolSize)
  const pulsePositions = new Float32Array(poolSize * TRAIL * 3)
  const pulseAlpha = new Float32Array(poolSize * TRAIL)
  const pulseSize = new Float32Array(poolSize * TRAIL)
  const pulseGeometry = keep(new THREE.BufferGeometry())
  const pulsePositionAttribute = new THREE.BufferAttribute(pulsePositions, 3).setUsage(THREE.DynamicDrawUsage)
  const pulseAlphaAttribute = new THREE.BufferAttribute(pulseAlpha, 1).setUsage(THREE.DynamicDrawUsage)
  const pulseSizeAttribute = new THREE.BufferAttribute(pulseSize, 1).setUsage(THREE.DynamicDrawUsage)
  pulseGeometry.setAttribute('position', pulsePositionAttribute)
  pulseGeometry.setAttribute('aAlpha', pulseAlphaAttribute)
  pulseGeometry.setAttribute('aSize', pulseSizeAttribute)
  const pulseMaterial = keep(new THREE.ShaderMaterial({
    vertexShader: PULSE_VERTEX,
    fragmentShader: PULSE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending,
    uniforms: { uSizeScale: sharedUniforms.uSizeScale, uCyan: { value: color(palette.cyan) }, uCore: { value: color(palette.core) } },
  }))
  const pulsePoints = new THREE.Points(pulseGeometry, pulseMaterial)
  pulsePoints.frustumCulled = false
  network.add(pulsePoints)

  // ---- Hub rings: billboarded in world space so the network's stretch never warps them.
  const ringBlending = theme === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending
  const ringMaterial = (hex: string) => keep(new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: ringBlending }))
  const deg = Math.PI / 180
  // Five segments clockwise from the top, matching the report's 0 to 5 scale.
  const segmentGeometries = Array.from({ length: SCORE_SEGMENTS }, (_, s) =>
    keep(new THREE.RingGeometry(0.9, 1, 24, 1, Math.PI / 2 - (s * 72 + 67) * deg, 62 * deg)),
  )
  const dashGeometries = Array.from({ length: 12 }, (_, s) =>
    keep(new THREE.RingGeometry(0.9, 0.96, 8, 1, Math.PI / 2 - (s * 30 + 18) * deg, 12 * deg)),
  )
  const haloGeometry = keep(new THREE.RingGeometry(0.93, 0.99, 72))
  const selectGeometry = keep(new THREE.RingGeometry(1.22, 1.28, 72))
  const rings: HubRing[] = graph.hubs.map(() => {
    const group = new THREE.Group()
    const segmentMaterials = segmentGeometries.map(() => ringMaterial(palette.lit))
    const segments = segmentGeometries.map((g, s) => new THREE.Mesh(g, segmentMaterials[s]))
    const dashMaterial = ringMaterial(palette.neutral)
    const dashes = dashGeometries.map((g) => new THREE.Mesh(g, dashMaterial))
    const haloMaterial = ringMaterial(palette.lit)
    const halo = new THREE.Mesh(haloGeometry, haloMaterial)
    const selectMaterial = ringMaterial(palette.select)
    const select = new THREE.Mesh(selectGeometry, selectMaterial)
    group.add(...segments, ...dashes, halo, select)
    group.renderOrder = 2
    scene.add(group)
    return { group, segments, segmentMaterials, dashMaterial, dashes, halo, haloMaterial, select, selectMaterial, shown: { halo: 0, select: 0, dash: 0, segments: segmentGeometries.map(() => 0) } }
  })

  // Hub neighbourhoods for focus glow, built once.
  const neighbourhoods = graph.hubs.map((hub) => {
    const near = new Set(graph.adjacency[hub])
    const second = new Set<number>()
    near.forEach((n) => graph.adjacency[n].forEach((m) => m !== hub && !near.has(m) && second.add(m)))
    return { near, second }
  })
  const glowTarget = new Float32Array(graph.nodes.length)
  const glowShown = new Float32Array(graph.nodes.length)

  // ---- State, sizing and the frame loop.
  let state: RendererState = { phase: 'idle', questions: [], reducedMotion: false, paused: false }
  const look: PhaseLook = { ...PHASE_LOOKS.idle }
  let lookInitialised = false
  const levels = createLevelGate()
  let envelope = 0
  let width = 0
  let height = 0
  let ringRadius = 0.2
  let frame = 0
  let running = false
  let disposed = false
  let last = 0
  let time = 0
  let revealTime = 0
  const parallax = { x: 0, y: 0, tx: 0, ty: 0 }
  const lastAnchors: HubAnchor[] = []
  const perf = { samples: 0, total: 0, warmup: 0, reported: false }
  const scratch = new THREE.Vector3()
  const from = new THREE.Vector3()
  const to = new THREE.Vector3()

  container.appendChild(renderer.domElement)

  function resize() {
    const w = container.clientWidth
    const h = container.clientHeight
    if (w < 2 || h < 2 || (w === width && h === height)) return
    width = w
    height = h
    renderer.setSize(w, h, false)
    edgeMaterial.uniforms.uResolution.value.set(w * pixelRatio, h * pixelRatio)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    const halfHeight = Math.tan((FOV / 2) * deg) * CAMERA_Z
    const halfWidth = halfHeight * camera.aspect
    if (preset.fit === 'fill') {
      network.scale.set(halfWidth * 0.97, halfHeight * 0.95, 1)
    } else {
      const sy = Math.min(halfHeight * 0.84, halfWidth * 0.84)
      const stretch = mode === 'results' ? 1.75 : 1.12
      network.scale.set(Math.min(sy * stretch, halfWidth * 0.86), sy, 1)
    }
    // Pixels per world unit at distance 1, so sprite sizes follow the canvas.
    sharedUniforms.uSizeScale.value = ((h * pixelRatio) / (2 * halfHeight)) * CAMERA_Z * 0.15
    ringRadius = mode === 'results' ? Math.min(halfHeight * 0.13, network.scale.x * 0.13) : halfHeight * 0.075
    lastAnchors.length = 0
    invalidate()
  }

  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => resize()) : null
  observer?.observe(container)
  const onWindowResize = () => resize()
  window.addEventListener('resize', onWindowResize)

  const onPointer = (event: PointerEvent) => {
    const angle = PARALLAX_ANGLE[mode]
    if (!angle || state.reducedMotion) return
    const rect = container.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const nx = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1))
    const ny = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1))
    parallax.tx = nx * angle
    parallax.ty = ny * angle * 0.6
  }
  window.addEventListener('pointermove', onPointer, { passive: true })

  const onVisibility = () => {
    perf.samples = 0
    perf.total = 0
    perf.warmup = 0
    if (document.hidden) stopLoop()
    else syncLoop()
  }
  document.addEventListener('visibilitychange', onVisibility)

  function hubIndexOf(id?: string): number {
    if (!id) return -1
    return state.questions.findIndex((q) => q.id === id)
  }

  function syncLevel() {
    const wanted: LevelSource | undefined = state.phase === 'listening' && !state.reducedMotion ? state.levelSource : undefined
    // Stop at once: no lingering speech motion after recording ends.
    if (levels.sync(wanted)) envelope = 0
  }

  // CPU mirror of the shaders' driftOf / gathered / curve, so pulses ride the drawn lines.
  function driftedPosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    const [x, y, z] = localPositions[index]
    const [dx, dy, dz] = drift(graph.nodes[index].phase, time, sharedUniforms.uDrift.value)
    return out.set(x + dx, y + dy, z + dz)
  }

  function gather(point: THREE.Vector3, mask: number): THREE.Vector3 {
    const g = 1 - sharedUniforms.uGather.value * GATHER * mask
    point.x *= g
    point.y *= g
    return point
  }

  const movable = (index: number) => (graph.nodes[index].phase === 0 ? 0 : 1)

  function nodePosition(index: number, out: THREE.Vector3): THREE.Vector3 {
    return gather(driftedPosition(index, out), movable(index))
  }

  const control = new THREE.Vector3()
  function edgePoint(u: number, v: number, t: number, out: THREE.Vector3): THREE.Vector3 {
    driftedPosition(u, from)
    driftedPosition(v, to)
    const [bx, by, bz] = bends.get(edgeKey(u, v)) ?? [0, 0, 0]
    control.copy(from).add(to).multiplyScalar(0.5)
    control.x += bx
    control.y += by
    control.z += bz
    const s = 1 - t
    out.set(
      s * s * from.x + 2 * s * t * control.x + t * t * to.x,
      s * s * from.y + 2 * s * t * control.y + t * t * to.y,
      s * s * from.z + 2 * s * t * control.z + t * t * to.z,
    )
    return gather(out, movable(u) * s + movable(v) * t)
  }

  function step(dt: number) {
    const motion = !state.reducedMotion
    const target = PHASE_LOOKS[state.phase]
    if (!lookInitialised || !motion) {
      Object.assign(look, target)
      lookInitialised = true
    } else {
      look.ambientRate = target.ambientRate
      look.pulseSource = target.pulseSource
      look.voice = target.voice
      for (const key of ['edgeAlpha', 'nodeGlow', 'gather', 'sway', 'activeHalo', 'dim'] as const) {
        look[key] = ease(look[key], target[key], dt, 0.32)
      }
    }
    if (motion) time += dt

    // Voice envelope: only while actually listening, and never from anything but amplitude.
    envelope = look.voice && motion ? followEnvelope(envelope, levels.level, dt) : 0

    sharedUniforms.uTime.value = time
    sharedUniforms.uDrift.value = motion ? DRIFT : 0
    sharedUniforms.uGather.value = look.gather
    sharedUniforms.uDim.value = look.dim
    edgeMaterial.uniforms.uAlpha.value = look.edgeAlpha
    nodeMaterial.uniforms.uNodeGlow.value = look.nodeGlow * themeGain * (1 + envelope * 0.25)
    nodeMaterial.uniforms.uTwinkle.value = motion && state.phase !== 'error' ? 1 : 0

    const activeHub = hubIndexOf(state.activeQuestionId)
    const selectedHub = hubIndexOf(state.selectedQuestionId)
    const hoveredHub = hubIndexOf(state.hoveredQuestionId)
    nodeMaterial.uniforms.uActiveHub.value = activeHub
    nodeMaterial.uniforms.uHubExpand.value = activeHub >= 0 ? envelope * 0.28 : 0

    // Sway and bounded parallax (none while answering).
    const swayAngle = motion ? SWAY_ANGLE[mode] * look.sway : 0
    const period = SWAY_PERIOD[mode]
    parallax.x = ease(parallax.x, motion ? parallax.tx : 0, dt, 0.5)
    parallax.y = ease(parallax.y, motion ? parallax.ty : 0, dt, 0.5)
    root.rotation.y = Math.sin((time / period) * Math.PI * 2) * swayAngle + parallax.x
    root.rotation.x = Math.sin((time / (period * 1.37)) * Math.PI * 2) * swayAngle * 0.3 + parallax.y

    // Focus glow around the hub that matters right now.
    const focusHub = mode === 'results' ? (hoveredHub >= 0 ? hoveredHub : selectedHub) : activeHub
    const focusStrength = mode === 'results' ? (hoveredHub >= 0 ? 0.8 : 0.55) : state.phase === 'listening' ? 0.45 + envelope * 0.9 : look.activeHalo * 0.4
    glowTarget.fill(0)
    if (focusHub >= 0 && focusHub < 3) {
      const { near, second } = neighbourhoods[focusHub]
      near.forEach((n) => { glowTarget[n] = focusStrength })
      second.forEach((n) => { glowTarget[n] = Math.max(glowTarget[n], focusStrength * 0.4) })
      glowTarget[graph.hubs[focusHub]] = focusStrength
    }
    let glowChanged = false
    for (let i = 0; i < glowShown.length; i++) {
      const next = motion ? ease(glowShown[i], glowTarget[i], dt, 0.25) : glowTarget[i]
      if (Math.abs(next - glowShown[i]) > 1e-4) glowChanged = true
      glowShown[i] = next
    }
    if (glowChanged) {
      glowAttribute.array.set(glowShown)
      glowAttribute.needsUpdate = true
      graph.edges.forEach(([a, b], e) => {
        const g = Math.max(glowShown[a], glowShown[b]) * (graph.nodes[a].hub >= 0 || graph.nodes[b].hub >= 0 ? 1 : 0.6)
        edgeGlow.fill(g, e * VERTS, (e + 1) * VERTS)
      })
      edgeGlowAttribute.needsUpdate = true
    }

    // Pulses: ambient by phase, voice-driven only while listening, none with reduced motion.
    if (motion && !state.paused) {
      const rate = look.voice ? voiceRate(envelope, look.ambientRate) : look.ambientRate
      const activeNode = activeHub >= 0 && activeHub < 3 ? graph.hubs[activeHub] : -1
      pulses.update(dt, {
        rate,
        source: look.pulseSource,
        activeNode,
        intensity: look.voice ? 0.55 + envelope * 0.45 : state.phase === 'processing' ? 0.7 : 0.55,
      })
    } else {
      pulses.reset()
    }
    pulses.pulses.forEach((pulse, p) => {
      for (let k = 0; k < TRAIL; k++) {
        const slot = p * TRAIL + k
        const t = pulse.t - k * 0.035
        if (!pulse.active || t < 0) {
          pulseAlpha[slot] = 0
          continue
        }
        const along = Math.min(0.9999, t) * (pulse.path.length - 1)
        const segment = Math.floor(along)
        edgePoint(pulse.path[segment], pulse.path[segment + 1], along - segment, scratch)
        pulsePositions[slot * 3] = scratch.x
        pulsePositions[slot * 3 + 1] = scratch.y
        pulsePositions[slot * 3 + 2] = scratch.z
        const fade = Math.sin(Math.PI * Math.min(1, pulse.t)) ** 0.6
        pulseAlpha[slot] = pulse.intensity * fade * (k === 0 ? 1 : k === 1 ? 0.45 : 0.2)
        pulseSize[slot] = (k === 0 ? 1.35 : 0.85) * (theme === 'light' ? 0.85 : 1)
      }
    })
    pulsePositionAttribute.needsUpdate = true
    pulseAlphaAttribute.needsUpdate = true
    pulseSizeAttribute.needsUpdate = true

    // Rings follow the hubs in world space and always face the camera.
    root.updateMatrixWorld(true)
    revealTime += dt
    rings.forEach((ring, hub) => {
      const q = state.questions[hub]
      ring.group.position.copy(network.localToWorld(nodePosition(graph.hubs[hub], scratch)))
      ring.group.scale.setScalar(ringRadius)
      const lit = mode === 'results' && q ? litSegments(q.score) : null
      const scored = mode === 'results' && q
      const haloTarget = mode === 'assessment' && q ? (hub === activeHub ? look.activeHalo * 0.85 : q.answered ? 0.32 : 0) : 0
      const selectTarget = mode === 'results' && q ? (q.id === state.selectedQuestionId ? 0.85 : q.id === state.hoveredQuestionId ? 0.4 : 0) : 0
      const reveal = (s: number) => (motion ? Math.max(0, Math.min(1, (revealTime - 0.15 - s * 0.08) / 0.45)) : 1)
      const tau = motion ? 0.2 : 0
      ring.shown.halo = tau ? ease(ring.shown.halo, haloTarget, dt, tau) : haloTarget
      ring.shown.select = tau ? ease(ring.shown.select, selectTarget, dt, 0.15) : selectTarget
      ring.shown.dash = scored && lit === null ? 0.55 * reveal(0) : 0
      ring.haloMaterial.opacity = ring.shown.halo * (state.phase === 'error' ? 0.5 : 1)
      ring.haloMaterial.color.set(hub === activeHub ? palette.lit : palette.neutral)
      ring.selectMaterial.opacity = ring.shown.select
      ring.dashMaterial.opacity = ring.shown.dash
      ring.segmentMaterials.forEach((material, s) => {
        const on = lit !== null && s < lit
        material.opacity = scored && lit !== null ? (on ? 1 : 0.16) * reveal(s) : 0
        material.color.set(on ? palette.lit : '#ffffff')
      })
    })
  }

  function project() {
    if (!options.onHubsProjected || !width) return
    const anchors: HubAnchor[] = []
    rings.forEach((ring, hub) => {
      const q = state.questions[hub]
      if (!q) return
      scratch.copy(ring.group.position).project(camera)
      anchors.push({ id: q.id, x: ((scratch.x + 1) / 2) * width, y: ((1 - scratch.y) / 2) * height })
    })
    const moved = anchors.length !== lastAnchors.length || anchors.some((anchor, i) => Math.abs(anchor.x - lastAnchors[i].x) > 0.5 || Math.abs(anchor.y - lastAnchors[i].y) > 0.5 || anchor.id !== lastAnchors[i].id)
    if (!moved) return
    lastAnchors.splice(0, lastAnchors.length, ...anchors)
    options.onHubsProjected(anchors)
  }

  function draw(dt: number) {
    if (errored) return
    if (!width) resize()
    if (!width) return
    step(dt)
    renderer.render(scene, camera)
    project()
  }

  function loop(now: number) {
    if (!running) return
    frame = requestAnimationFrame(loop)
    const elapsed = last ? (now - last) / 1000 : 1 / 60
    last = now
    // Clamp so a throttled or returning tab resumes calmly instead of replaying a backlog.
    const dt = Math.min(0.05, Math.max(0, elapsed))
    draw(dt)
    measure(elapsed)
  }

  function measure(elapsed: number) {
    if (perf.reported || quality !== 'standard' || !options.onSlow || document.hidden) return
    if (perf.warmup < 1.5) {
      perf.warmup += elapsed
      return
    }
    perf.total += elapsed
    perf.samples++
    if (perf.samples >= 120) {
      if (perf.total / perf.samples > 1 / 30) {
        perf.reported = true
        options.onSlow()
      }
      perf.samples = 0
      perf.total = 0
    }
  }

  function startLoop() {
    if (running || disposed) return
    running = true
    last = 0
    frame = requestAnimationFrame(loop)
  }

  function stopLoop() {
    running = false
    cancelAnimationFrame(frame)
  }

  let pendingFrame = 0
  function invalidate() {
    if (running || disposed || pendingFrame) return
    pendingFrame = requestAnimationFrame(() => {
      pendingFrame = 0
      if (!disposed) draw(0)
    })
  }

  function syncLoop() {
    const animate = !state.reducedMotion && !state.paused && !document.hidden
    if (animate) startLoop()
    else {
      stopLoop()
      invalidate()
    }
  }

  return {
    update(next) {
      if (disposed) return
      const phaseChanged = next.phase !== state.phase
      state = next
      if (next.reducedMotion) {
        parallax.tx = parallax.ty = 0
      }
      if (phaseChanged && next.phase !== 'listening') envelope = 0
      syncLevel()
      syncLoop()
      invalidate()
    },
    dispose() {
      if (disposed) return
      disposed = true
      stopLoop()
      cancelAnimationFrame(pendingFrame)
      levels.dispose()
      observer?.disconnect()
      window.removeEventListener('resize', onWindowResize)
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      renderer.domElement.removeEventListener('webglcontextlost', fail)
      rings.forEach((ring) => scene.remove(ring.group))
      disposables.forEach((item) => item.dispose())
      renderer.dispose()
      renderer.forceContextLoss()
      renderer.domElement.remove()
    },
  }
}
