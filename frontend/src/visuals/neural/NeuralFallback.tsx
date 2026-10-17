import { useMemo } from 'react'
import { buildGraph } from './graphLayout'
import { litSegments } from './questionVisuals'
import { SCORE_SEGMENTS, type NeuralMode, type NeuralPhase, type QuestionVisual } from './sceneTypes'

interface NeuralFallbackProps {
  mode: NeuralMode
  phase: NeuralPhase
  seed: string
  questions: QuestionVisual[]
  activeQuestionId?: string
  selectedQuestionId?: string
  hoveredQuestionId?: string
  onSelect?: (id: string) => void
}

// Static SVG counterpart of the 3D scene: same layout, same hub identities and score halos.
const VIEW: Record<NeuralMode, { w: number; h: number; sx: number; sy: number; fit: string }> = {
  assessment: { w: 1600, h: 900, sx: 760, sy: 420, fit: 'xMidYMid slice' },
  landing: { w: 1000, h: 1000, sx: 440, sy: 440, fit: 'xMidYMid meet' },
  results: { w: 1000, h: 560, sx: 440, sy: 240, fit: 'xMidYMid meet' },
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const point = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return `${(cx + r * Math.cos(rad)).toFixed(2)} ${(cy + r * Math.sin(rad)).toFixed(2)}`
  }
  return `M ${point(start)} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${point(end)}`
}

export function NeuralFallback({ mode, phase, seed, questions, activeQuestionId, selectedQuestionId, hoveredQuestionId, onSelect }: NeuralFallbackProps) {
  const graph = useMemo(() => buildGraph(seed, mode, 'low'), [seed, mode])
  const view = VIEW[mode]
  const light = mode === 'landing'
  const project = (x: number, y: number, z: number) => {
    const depth = 1 / (1 - z * 0.14)
    return [view.w / 2 + x * view.sx * depth, view.h / 2 - y * view.sy * depth, depth] as const
  }
  const points = graph.nodes.map((n) => project(n.x, n.y, n.z))
  const unit = mode === 'assessment' ? 9 : 8
  const edgeColor = light ? '#6742df' : '#5d86ff'

  return (
    <svg className="neural-fallback" viewBox={`0 0 ${view.w} ${view.h}`} preserveAspectRatio={view.fit} data-phase={phase} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id={`nf-glow-${mode}`}>
          <stop offset="0" stopColor={light ? '#7b55f0' : '#f3edff'} stopOpacity="1" />
          <stop offset=".25" stopColor={light ? '#8a5cff' : '#8a5cff'} stopOpacity=".55" />
          <stop offset="1" stopColor="#8a5cff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`nf-blue-${mode}`}>
          <stop offset="0" stopColor={light ? '#3d6fe0' : '#d8e6ff'} stopOpacity=".95" />
          <stop offset=".3" stopColor="#3985ff" stopOpacity=".4" />
          <stop offset="1" stopColor="#3985ff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g opacity={phase === 'error' ? 0.45 : 1}>
        {graph.particles.map((p, i) => {
          const [x, y] = project(p.x, p.y, p.z)
          return <circle key={`p${i}`} cx={x} cy={y} r={p.size * 6} fill={light ? '#8a5cff' : '#b8c6ff'} opacity={0.18} />
        })}
        <g stroke={edgeColor} strokeWidth={light ? 1.1 : 1} fill="none">
          {graph.edges.map(([a, b], i) => {
            const hubEdge = graph.nodes[a].hub >= 0 || graph.nodes[b].hub >= 0
            return <line key={`e${i}`} x1={points[a][0]} y1={points[a][1]} x2={points[b][0]} y2={points[b][1]} opacity={hubEdge ? 0.4 : 0.16} />
          })}
        </g>
        {graph.nodes.map((n, i) => {
          if (n.hub >= 0) return null
          const [x, y, depth] = points[i]
          const r = n.size * unit * depth * (n.layer === 'near' ? 2.2 : 1)
          return <circle key={`n${i}`} cx={x} cy={y} r={r * 2.2} fill={`url(#nf-${n.hue === 0 ? 'blue' : 'glow'}-${mode})`} opacity={n.brightness * (n.layer === 'near' ? 0.5 : 0.9)} />
        })}
        {graph.hubs.map((nodeIndex, hub) => {
          const q = questions[hub]
          const [x, y] = points[nodeIndex]
          const lit = q ? litSegments(q.score) : null
          const showScore = mode === 'results' && q
          const selected = q && q.id === selectedQuestionId
          const hovered = q && q.id === hoveredQuestionId
          const active = q && q.id === activeQuestionId
          const r = mode === 'results' ? 44 : 30
          return (
            <g key={`h${hub}`} className="neural-fallback-hub" data-hub-id={q?.id} data-lit={showScore ? (lit === null ? 'ungraded' : String(lit)) : undefined}
              data-selected={selected ? 'true' : undefined} onClick={q && onSelect ? () => onSelect(q.id) : undefined}>
              <circle cx={x} cy={y} r={unit * 6} fill={`url(#nf-glow-${mode})`} />
              <circle cx={x} cy={y} r={unit * 1.1} fill={light ? '#5a35d6' : '#f3edff'} />
              {showScore && lit === null && <circle cx={x} cy={y} r={r} fill="none" stroke="#9c97b0" strokeWidth="2" strokeDasharray="5 7" opacity=".8" />}
              {showScore && lit !== null && Array.from({ length: SCORE_SEGMENTS }, (_, s) => (
                <path key={s} d={arcPath(x, y, r, s * 72 + 5, s * 72 + 67)} fill="none" strokeLinecap="round"
                  stroke={s < lit ? '#b89bff' : '#ffffff'} strokeWidth={s < lit ? 4 : 2} opacity={s < lit ? 1 : 0.18} />
              ))}
              {mode === 'assessment' && q && (active || q.answered) && (
                <circle cx={x} cy={y} r={r} fill="none" stroke={active ? '#cbb8ff' : '#9c97b0'} strokeWidth={active ? 1.6 : 1.2} opacity={active ? 0.9 : 0.5} />
              )}
              {(selected || hovered) && <circle cx={x} cy={y} r={r + 12} fill="none" stroke="#f3edff" strokeWidth={selected ? 2 : 1.2} opacity={selected ? 0.9 : 0.5} />}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
