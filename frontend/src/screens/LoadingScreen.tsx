import { useEffect, useState } from 'react'
import { StageBackdrop } from '../components/Presentation'
import type { NeuralPhase, QuestionVisual } from '../visuals/neural/sceneTypes'

interface LoadingScreenProps {
  message?: string
  /** `preparing` while questions are written, `processing` while the report is graded. */
  phase?: NeuralPhase
  seed?: string
  questions?: QuestionVisual[]
}

export default function LoadingScreen({ message = 'Writing your three questions…', phase = 'preparing', seed, questions }: LoadingScreenProps) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 15000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main className="assessment-stage loading-stage" aria-busy="true">
      <StageBackdrop phase={phase} seed={seed} questions={questions} />
      <div className="loading-composition">
      {/* A looping sweep, never a progress bar that could reach 100% before the server answers. */}
      <div className="neural-glyph" aria-hidden="true"><i /><i /><i /></div>
      <h1 className="h2">{message}</h1>
      <p className="muted" role="status">
        {slow
          ? 'Large uploads are read in sections. This can take a few minutes while the AI service processes them.'
          : phase === 'processing' ? 'Your saved answers are being compared with the expected ideas.' : 'An AI reads your answers and picks what to ask.'}
      </p>
      </div>
    </main>
  )
}
