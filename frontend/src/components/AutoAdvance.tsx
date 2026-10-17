import { useCallback, useEffect, useRef, useState } from 'react'

interface AutoAdvanceProps {
  /** Milliseconds before moving on by itself. */
  ms: number
  /** Button text, which is also what happens now: 'Next question' or 'See my report'. */
  nextLabel: string
  /** What the countdown says it is waiting to do, for example 'Next question'. */
  whatLabel: string
  onNext: () => void
}

/**
 * Counts down, then calls onNext exactly once. Next now moves on straight away. Pause stops the
 * countdown for anyone who needs longer. Timing uses performance.now(), so a slow tab cannot make
 * it fire late or twice.
 */
export default function AutoAdvance({ ms, nextLabel, whatLabel, onNext }: AutoAdvanceProps) {
  const [left, setLeft] = useState(ms)
  const [paused, setPaused] = useState(false)
  const firedRef = useRef(false)
  const deadlineRef = useRef(0)
  const onNextRef = useRef(onNext)

  useEffect(() => {
    onNextRef.current = onNext
  })

  const fire = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    onNextRef.current()
  }, [])

  useEffect(() => {
    if (paused) return
    deadlineRef.current = performance.now() + left
    const timer = window.setInterval(() => {
      const remaining = deadlineRef.current - performance.now()
      if (remaining <= 0) {
        window.clearInterval(timer)
        setLeft(0)
        fire()
      } else {
        setLeft(remaining)
      }
    }, 100)
    return () => {
      window.clearInterval(timer)
    }
    // left is read once when the countdown (re)starts; it must not restart the effect each tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, fire])

  return (
    <div className="advance">
      <button type="button" className="primary" onClick={fire}>
        {nextLabel}
      </button>
      {!paused ? (
        <>
          <span className="muted" aria-hidden="true">
            {whatLabel} in {Math.max(0, Math.ceil(left / 1000))} s
          </span>
        </>
      ) : (
        <>
          <span className="muted">Paused. Take your time.</span>
          <button type="button" onClick={() => setPaused(false)}>
            Resume
          </button>
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {paused ? 'Automatic advance paused.' : `${whatLabel} starts automatically in ${Math.ceil(ms / 1000)} seconds.`}
      </p>
    </div>
  )
}
