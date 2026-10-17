import { useEffect, useState } from 'react'

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
    <main className="screen center" aria-busy="true">
      <div className="spinner" aria-hidden="true" />
      <h1 className="h2">{message}</h1>
      <p className="muted" role="status">
        {slow
          ? 'This is taking longer than usual. The free AI service may be busy. Thanks for waiting.'
          : 'An AI reads your answers and picks what to ask.'}
      </p>
    </main>
  )
}
