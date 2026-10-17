import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AutoAdvance from '../../src/components/AutoAdvance'

beforeEach(() => vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] }))
afterEach(() => vi.useRealTimers())

function setup(ms = 5000) {
  const onNext = vi.fn()
  const view = render(<AutoAdvance ms={ms} nextLabel="Next question" whatLabel="Next question" onNext={onNext} />)
  return { onNext, ...view }
}
const tick = (ms: number) => act(() => void vi.advanceTimersByTime(ms))

describe('AutoAdvance', () => {
  it('moves on by itself after 5 seconds, exactly once', () => {
    const { onNext } = setup()
    expect(screen.getByText(/Next question in 5 s/)).toBeInTheDocument()
    tick(4900)
    expect(onNext).not.toHaveBeenCalled()
    tick(300)
    expect(onNext).toHaveBeenCalledTimes(1)
    tick(20_000)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('Next now moves on straight away and does not fire again later', () => {
    const { onNext } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(onNext).toHaveBeenCalledTimes(1)
    tick(10_000)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('Pause stops the countdown and Resume continues it', () => {
    const { onNext } = setup()
    tick(2000)
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    tick(30_000)
    expect(onNext).not.toHaveBeenCalled()
    expect(screen.getByText(/Paused/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    tick(2800)
    expect(onNext).not.toHaveBeenCalled()
    tick(400)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('does nothing after it is removed', () => {
    const { onNext, unmount } = setup()
    tick(2000)
    unmount()
    tick(10_000)
    expect(onNext).not.toHaveBeenCalled()
  })

  it('announces the countdown once in a polite live region, not every second', () => {
    setup()
    const live = screen.getByRole('status')
    expect(live).toHaveAttribute('aria-live', 'polite')
    const before = live.textContent
    tick(3000)
    expect(live.textContent).toBe(before)
  })
})
