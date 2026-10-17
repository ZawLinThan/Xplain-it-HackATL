import { useCallback, useEffect, useRef, useState } from 'react'

/** Speak before recording, with an explicit way past unavailable or blocked browser speech. */
export function useQuestionSpeech(text: string | null) {
  const supported = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined'
  const [finished, setFinished] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const cancelRef = useRef<() => void>(() => undefined)

  useEffect(() => {
    if (!text || !supported) return
    let alive = true
    const synth = window.speechSynthesis
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'en-US'
    utterance.rate = 1
    const finish = () => { window.clearTimeout(timeout); if (alive) setFinished(text) }
    const fail = () => {
      if (!alive) return
      setError('The question could not be read aloud. Try reading it aloud again, or continue with the text.')
    }
    utterance.onend = finish
    utterance.onerror = fail
    const timeout = window.setTimeout(() => { fail(); synth.cancel() }, 45000)
    cancelRef.current = () => { alive = false; window.clearTimeout(timeout); synth.cancel(); setFinished(text) }
    try { synth.cancel(); synth.speak(utterance) } catch { fail() }
    return () => { alive = false; window.clearTimeout(timeout); utterance.onend = null; utterance.onerror = null; synth.cancel() }
  }, [text, supported, attempt])

  const skip = useCallback(() => cancelRef.current(), [])
  function retry() { setError(''); setFinished(null); setAttempt((n) => n + 1) }
  return { done: !supported || finished === text, supported, error, skip, retry }
}
