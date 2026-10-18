import { useCallback, useEffect, useRef, useState } from 'react'

/** Speak before recording, with an explicit way past unavailable or blocked audio playback. */
export function useQuestionSpeech(text: string | null, onReadAloud?: () => void) {
  const supported = typeof Audio !== 'undefined'
  const [finished, setFinished] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const cancelRef = useRef<() => void>(() => undefined)

  const onReadRef = useRef(onReadAloud)
  useEffect(() => { onReadRef.current = onReadAloud }, [onReadAloud])

  useEffect(() => {
    if (!text || !supported) return
    let alive = true
    const controller = new AbortController()
    const audio = new Audio()
    let url: string | undefined
    const cleanup = () => {
      alive = false
      controller.abort()
      window.clearTimeout(timeout)
      audio.onended = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      if (url) URL.revokeObjectURL(url)
    }
    const fail = () => {
      if (!alive) return
      setError('The question could not be read aloud. Try reading it aloud again, or continue with the text.')
      cleanup()
    }
    audio.onended = () => {
      if (!alive) return
      setFinished(text)
      cleanup()
      onReadRef.current?.()
    }
    audio.onerror = fail
    const timeout = window.setTimeout(fail, 90000)
    cancelRef.current = () => { cleanup(); setFinished(text) }
    const base = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
    void fetch(`${base}/api/v1/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('Narration failed')
      const blob = await response.blob()
      if (!alive) return
      url = URL.createObjectURL(blob)
      audio.src = url
      await audio.play()
    }).catch(fail)
    return cleanup
  }, [text, supported, attempt])

  const skip = useCallback(() => cancelRef.current(), [])
  function retry() { setError(''); setFinished(null); setAttempt((n) => n + 1) }
  return { done: !supported || finished === text, supported, error, skip, retry }
}
