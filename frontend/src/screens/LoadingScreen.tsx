import { useEffect, useState } from 'react'
import { StageBackdrop } from '../components/Presentation'

interface LoadingScreenProps {
  message?: string
}

export default function LoadingScreen({ message = 'Writing your three questions…' }: LoadingScreenProps) {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 15000)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <main className="assessment-stage loading-stage" aria-busy="true">
      <StageBackdrop phase="processing" />
      <div className="loading-composition">
      <div className="spinner" aria-hidden="true" />
      <h1 className="h2">{message}</h1>
      <p className="muted" role="status">
        {slow
          ? 'Large uploads are read in sections. This can take a few minutes while the AI service processes them.'
          : 'An AI reads your answers and picks what to ask.'}
      </p>
      </div>
    </main>
  )
}
