import { useEffect, useState } from 'react'
import { REDUCED_MOTION_PAUSE_MS, REVEAL_MAX_MS, REVEAL_MS_PER_WORD, msPerWord } from './timing'

export interface Reveal {
  words: string[]
  /** How many words are visible. */
  shown: number
  /** True once every word is visible (after a short pause when motion is reduced). */
  done: boolean
}

export interface RevealOptions {
  perWordMs?: number
  maxMs?: number
  reducedPauseMs?: number
  reducedMotion?: boolean
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Show a question one word at a time. The whole reveal never takes longer than maxMs, and with
 * reduced motion everything appears at once followed by a short pause.
 */
export function useWordReveal(text: string | null, options: RevealOptions = {}): Reveal {
  const perWord = options.perWordMs ?? REVEAL_MS_PER_WORD
  const maxMs = options.maxMs ?? REVEAL_MAX_MS
  const pause = options.reducedPauseMs ?? REDUCED_MOTION_PAUSE_MS
  const reduced = options.reducedMotion ?? prefersReducedMotion()
  const words = text ? text.split(/\s+/).filter(Boolean) : []
  const total = words.length

  // Updated only from timer callbacks. Progress made for a different text counts as none.
  const [progress, setProgress] = useState({ text: null as string | null, shown: 0 })

  useEffect(() => {
    if (!text || total === 0) return
    if (reduced) {
      const timer = window.setTimeout(() => setProgress({ text, shown: total }), pause)
      return () => window.clearTimeout(timer)
    }
    const step = msPerWord(total, perWord, maxMs)
    let shown = 0
    const timer = window.setInterval(() => {
      shown += 1
      setProgress({ text, shown })
      if (shown >= total) window.clearInterval(timer)
    }, step)
    return () => window.clearInterval(timer)
  }, [text, total, perWord, maxMs, pause, reduced])

  const current = progress.text === text ? progress.shown : 0
  const done = total > 0 && current >= total
  // With reduced motion every word is visible straight away; `done` still waits for the pause.
  return { words, shown: reduced ? total : current, done }
}
