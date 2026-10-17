import { useCallback, useMemo, useRef, useState } from 'react'
import type { QuestionResult } from '../api/types'
import { NeuralScene } from '../visuals/neural/NeuralScene'
import { questionId, reportQuestions } from '../visuals/neural/questionVisuals'
import type { HubAnchor } from '../visuals/neural/sceneTypes'
import { useReducedMotion } from '../visuals/useReducedMotion'

interface ExplanationMapProps {
  sessionId: string
  /** The saved report entries. The map only displays them; it never grades or refetches. */
  questions: readonly QuestionResult[]
}

const scoreText = (score: number | null) => (score === null ? 'Not graded' : `${score} / 5`)

export default function ExplanationMap({ sessionId, questions }: ExplanationMapProps) {
  const hubs = useMemo(() => reportQuestions(sessionId, questions), [sessionId, questions])
  const [selected, setSelected] = useState(() => hubs[0]?.id)
  const [hovered, setHovered] = useState<string | undefined>()
  const reducedMotion = useReducedMotion()
  const hotspots = useRef(new Map<string, HTMLButtonElement>())

  // Hotspots follow the projected 3D hubs; positioned imperatively so the page does not rerender per frame.
  const placeHotspots = useCallback((anchors: HubAnchor[]) => {
    for (const anchor of anchors) {
      const spot = hotspots.current.get(anchor.id)
      if (!spot) continue
      spot.style.transform = `translate(${anchor.x.toFixed(1)}px, ${anchor.y.toFixed(1)}px)`
      spot.hidden = false
    }
  }, [])

  const current = questions.find((q) => questionId(sessionId, q.index) === selected)
  if (!hubs.length) return null

  return (
    <section className="explanation-map no-print" aria-labelledby="map-title">
      <header className="map-header">
        <h2 id="map-title">Your explanation map</h2>
        <p className="muted">Explore the feedback for each spoken answer.</p>
      </header>
      <div className="map-layout">
        <div className="map-stage">
          <NeuralScene mode="results" phase="complete" seed={sessionId} questions={hubs} selectedQuestionId={selected}
            hoveredQuestionId={hovered} reducedMotion={reducedMotion} onHubsProjected={placeHotspots} onHubSelect={setSelected} />
          {/* Pointer shortcuts on top of the 3D hubs; the buttons beside the map are the accessible controls. */}
          <div className="map-hotspots" aria-hidden="true">
            {hubs.map((hub) => (
              <button key={hub.id} type="button" tabIndex={-1} hidden className={`map-hotspot${hub.id === selected ? ' selected' : ''}`}
                ref={(node) => { if (node) hotspots.current.set(hub.id, node); else hotspots.current.delete(hub.id) }}
                onClick={() => setSelected(hub.id)} onPointerEnter={() => setHovered(hub.id)} onPointerLeave={() => setHovered(undefined)}>
                <span className="map-hotspot-label">{hub.label}</span>
              </button>
            ))}
          </div>
          <p className="map-legend">Illuminated segments show the saved oral-answer score.</p>
        </div>

        <div className="map-detail">
          <div className="map-choices" role="group" aria-label="Choose a question to explore">
            {hubs.map((hub) => (
              <button key={hub.id} type="button" aria-pressed={hub.id === selected} onClick={() => setSelected(hub.id)}
                onPointerEnter={() => setHovered(hub.id)} onPointerLeave={() => setHovered(undefined)}
                onFocus={() => setHovered(hub.id)} onBlur={() => setHovered(undefined)}>
                <span>{hub.label}</span>
                <small>{scoreText(hub.score)}</small>
              </button>
            ))}
          </div>
          {current && (
            <div className="map-answer" data-question={current.index}>
              <p className="eyebrow">Question {current.index}</p>
              <h3>{current.text}</h3>
              <p className="map-score"><span className="label">Oral score</span> <strong>{scoreText(current.score)}</strong></p>
              <p className="label">Feedback</p>
              <p>{current.feedback ?? 'No feedback was saved for this answer yet.'}</p>
              <p className="label">What you said</p>
              {current.transcript ? <blockquote>{current.transcript}</blockquote> : <p className="muted">No spoken words were transcribed for this answer.</p>}
              <a className="map-jump" href={`#q${current.index}`}>Go to this answer in the full report</a>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
