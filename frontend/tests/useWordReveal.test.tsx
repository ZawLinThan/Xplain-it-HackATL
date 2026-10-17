import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REAL_REVEAL_MAX_MS, REAL_REVEAL_MS_PER_WORD, SERVER_GRACE_MS, msPerWord } from '../src/timing'
import { useWordReveal, type RevealOptions } from '../src/useWordReveal'

function Probe({ text, options }: { text: string; options?: RevealOptions }) {
  const r = useWordReveal(text, options)
  return (
    <p>
      <span data-testid="shown">{r.shown}</span>
      <span data-testid="done">{String(r.done)}</span>
    </p>
  )
}
const shown = () => Number(screen.getByTestId('shown').textContent)
const done = () => screen.getByTestId('done').textContent

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useWordReveal', () => {
  it('shows the words one at a time at 200 ms each and is done after the last', () => {
    render(<Probe text="Why did you use a set" options={{ perWordMs: 200, maxMs: 8000 }} />)
    expect(shown()).toBe(0)
    expect(done()).toBe('false')
    act(() => void vi.advanceTimersByTime(200))
    expect(shown()).toBe(1)
    act(() => void vi.advanceTimersByTime(400))
    expect(shown()).toBe(3)
    expect(done()).toBe('false')
    act(() => void vi.advanceTimersByTime(600))
    expect(shown()).toBe(6)
    expect(done()).toBe('true')
  })

  it('never takes longer than the cap, however long the question is', () => {
    const text = Array.from({ length: 80 }, (_, i) => `w${i}`).join(' ')
    render(<Probe text={text} options={{ perWordMs: 200, maxMs: 8000 }} />)
    act(() => void vi.advanceTimersByTime(7900))
    expect(done()).toBe('false')
    act(() => void vi.advanceTimersByTime(200))
    expect(done()).toBe('true')
    expect(shown()).toBe(80)
  })

  it('with reduced motion shows everything at once, then waits a moment', () => {
    render(<Probe text="one two three" options={{ reducedMotion: true, reducedPauseMs: 1000 }} />)
    expect(shown()).toBe(3)
    expect(done()).toBe('false')
    act(() => void vi.advanceTimersByTime(999))
    expect(done()).toBe('false')
    act(() => void vi.advanceTimersByTime(2))
    expect(done()).toBe('true')
  })

  it('starts over for a new question', () => {
    const { rerender } = render(<Probe text="one two" options={{ perWordMs: 100, maxMs: 8000 }} />)
    act(() => void vi.advanceTimersByTime(250))
    expect(done()).toBe('true')
    rerender(<Probe text="three four five" options={{ perWordMs: 100, maxMs: 8000 }} />)
    expect(shown()).toBe(0)
    expect(done()).toBe('false')
  })
})

describe('timing arithmetic', () => {
  it('speed is 200 ms per word but shrinks so the reveal fits the cap', () => {
    expect(msPerWord(10, 200, 8000)).toBe(200)
    expect(msPerWord(40, 200, 8000)).toBe(200)
    expect(msPerWord(80, 200, 8000)).toBe(100)
  })

  it('the slowest reveal plus the 40 s answer stays inside the server grace, so normal answers are not late', () => {
    expect(REAL_REVEAL_MS_PER_WORD).toBe(200)
    // late means more than 40 s + grace after the question was fetched
    const slowestStartMs = REAL_REVEAL_MAX_MS + 1000 // reveal, plus a second for the mic to start
    const uploadMs = 10_000
    expect(slowestStartMs + 40_000 + uploadMs).toBeLessThan(40_000 + SERVER_GRACE_MS)
  })
})
