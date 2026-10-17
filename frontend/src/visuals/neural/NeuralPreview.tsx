import { useEffect, useMemo, useState } from 'react'
import { createLevelChannel } from '../audioLevel'
import { NeuralScene } from './NeuralScene'
import type { NeuralMode, NeuralPhase, QuestionVisual } from './sceneTypes'

// Development preview only (?dev=neural). Fixture data, a synthetic level and no devices.

const PHASES: NeuralPhase[] = ['idle', 'preparing', 'ready', 'listening', 'processing', 'review', 'error', 'complete']
const FIXTURES: Record<string, Array<number | null>> = { strong: [5, 5, 4], weak: [1, 1, 0], partial: [5, 5, null], zero: [0, 0, 0] }

export default function NeuralPreview() {
  const [mode, setMode] = useState<NeuralMode>('assessment')
  const [phase, setPhase] = useState<NeuralPhase>('ready')
  const [fixture, setFixture] = useState('partial')
  const [active, setActive] = useState(1)
  const [selected, setSelected] = useState(1)
  const [level, setLevel] = useState(0)
  const [speak, setSpeak] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [channel] = useState(createLevelChannel)

  // A synthetic speech-like envelope, published through the same channel the recorder uses.
  useEffect(() => {
    if (!speak) {
      channel.publish(level)
      return
    }
    const start = performance.now()
    const timer = window.setInterval(() => {
      const t = (performance.now() - start) / 1000
      const syllables = Math.max(0, Math.sin(t * 9) * 0.5 + Math.sin(t * 3.1) * 0.5)
      const phrase = Math.sin(t * 0.9) > -0.3 ? 1 : 0.05
      channel.publish(Math.min(1, syllables * phrase * 0.9))
    }, 50)
    return () => window.clearInterval(timer)
  }, [speak, level, channel])

  const questions: QuestionVisual[] = useMemo(() => FIXTURES[fixture].map((score, i) => ({
    id: `preview:${i + 1}`, index: i + 1, label: `Question ${i + 1}`, answered: mode === 'results' || i + 1 < active, score: mode === 'results' ? score : null,
  })), [fixture, mode, active])

  const dark = mode !== 'landing'
  return (
    <div className="neural-preview" style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', background: dark ? '#05050d' : '#f7f7fa', color: dark ? '#f6f4ff' : '#161721' }}>
      <div className="preview-nav" style={{ position: 'relative', zIndex: 2 }}>
        <strong>Neural preview</strong>
        {(['landing', 'assessment', 'results'] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m}</button>)}
        <select aria-label="Phase" value={phase} onChange={(e) => setPhase(e.target.value as NeuralPhase)}>{PHASES.map((p) => <option key={p}>{p}</option>)}</select>
        <select aria-label="Fixture" value={fixture} onChange={(e) => setFixture(e.target.value)}>{Object.keys(FIXTURES).map((f) => <option key={f}>{f}</option>)}</select>
        <label>Active <input type="number" min={1} max={3} value={active} onChange={(e) => setActive(Number(e.target.value))} style={{ width: 56 }} /></label>
        <label>Selected <input type="number" min={1} max={3} value={selected} onChange={(e) => setSelected(Number(e.target.value))} style={{ width: 56 }} /></label>
        <label>Level <input type="range" min={0} max={1} step={0.05} value={level} onChange={(e) => setLevel(Number(e.target.value))} /></label>
        <label><input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} /> Synthetic speech</label>
        <label><input type="checkbox" checked={reduced} onChange={(e) => setReduced(e.target.checked)} /> Reduced motion</label>
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 520, margin: mode === 'assessment' ? 0 : '24px auto', width: mode === 'landing' ? 'min(620px, 92vw)' : mode === 'results' ? 'min(760px, 96vw)' : '100%', aspectRatio: mode === 'landing' ? '1' : undefined, isolation: 'isolate' }}>
        <NeuralScene mode={mode} phase={phase} seed="preview" questions={questions} activeQuestionId={`preview:${active}`}
          selectedQuestionId={mode === 'results' ? `preview:${selected}` : undefined} levelSource={channel.subscribe} reducedMotion={reduced} />
        {mode === 'assessment' && <div className="neural-reading-veil" style={{ position: 'absolute' }} />}
        {mode === 'assessment' && (
          <p style={{ position: 'absolute', left: '50%', top: '44%', transform: 'translate(-50%, -50%)', width: 'min(860px, 86vw)', textAlign: 'center', fontSize: 'clamp(28px, 3.4vw, 46px)', lineHeight: 1.27, letterSpacing: '-.035em', margin: 0 }}>
            In remove_duplicates, walk me through what seen and result hold after the loop has processed the list 3, 1, 3, 2.
          </p>
        )}
      </div>
    </div>
  )
}
