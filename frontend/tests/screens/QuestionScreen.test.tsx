import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getQuestion, submitAnswer } from '../../src/api/client'
import { AppConfigContext, DEFAULT_CONFIG } from '../../src/demoMode'
import QuestionScreen from '../../src/screens/QuestionScreen'

vi.mock('../../src/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/api/client')>()
  return { ...actual, getQuestion: vi.fn(), submitAnswer: vi.fn() }
})

// The real recorder needs a browser; this stand-in just lets the test "finish recording".
vi.mock('../../src/Recorder', () => ({
  default: ({
    onComplete,
    hold,
    autoStart,
  }: {
    onComplete: (b: Blob, s: number) => void
    hold?: boolean
    autoStart?: boolean
  }) => (
    <button
      type="button"
      data-hold={String(hold)}
      data-auto={String(autoStart)}
      onClick={() => onComplete(new Blob(['x'], { type: 'audio/webm' }), 12.3)}
    >
      finish recording
    </button>
  ),
}))

const question = { index: 1, total: 3, text: 'Why did you use a set?', max_seconds: 40 }
const answered = { transcript: 'Because sets are fast.', seconds_used: 12.3, late: false }

function setup(index = 1, config = DEFAULT_CONFIG) {
  const props = {
    sessionId: 's1',
    index,
    total: 3,
    onAnswered: vi.fn(),
    onNext: vi.fn(),
    onSessionLost: vi.fn(),
  }
  render(
    <AppConfigContext.Provider value={config}>
      <QuestionScreen {...props} />
    </AppConfigContext.Provider>,
  )
  return props
}

beforeEach(() => {
  vi.mocked(getQuestion).mockReset().mockResolvedValue({ ...question })
  vi.mocked(submitAnswer).mockReset().mockResolvedValue({ ...answered })
})

afterEach(() => vi.useRealTimers())

describe('QuestionScreen flow', () => {
  it('reveals the question word by word, and only then lets the timer start by itself', async () => {
    setup()
    const recorder = await screen.findByRole('button', { name: 'finish recording' })
    expect(recorder).toHaveAttribute('data-auto', 'true')
    expect(recorder).toHaveAttribute('data-hold', 'true') // still revealing
    const visible = () => document.querySelectorAll('.word.on').length
    expect(visible()).toBeLessThan(6)
    await waitFor(() => expect(recorder).toHaveAttribute('data-hold', 'false'), { timeout: 4000 })
    expect(visible()).toBe(6) // all six words are showing
  })

  it('gives screen readers the whole question at once and hides the animated words', async () => {
    setup()
    const heading = await screen.findByRole('heading', { name: question.text })
    expect(heading.querySelector('[aria-hidden="true"]')).not.toBeNull()
    expect(heading.querySelector('.sr-only')).toHaveTextContent(question.text)
  })

  it('sends the look-away counts with the answer, and only counts and times', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
    await screen.findByText('Because sets are fast.')
    const sent = vi.mocked(submitAnswer).mock.calls[0][3]
    expect(sent).toEqual({ tracked: false, events: [] }) // no camera in this test: not tracked, not zero
  })

  it('moves on by itself 5 seconds after the transcript, once', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const props = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
    await screen.findByText('Because sets are fast.')
    expect(props.onNext).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5200)
    })
    expect(props.onNext).toHaveBeenCalledTimes(1)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(props.onNext).toHaveBeenCalledTimes(1)
  })

  it('does not move on by itself after a failed upload', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(submitAnswer).mockRejectedValue(new ApiError(503, 'transcription_unavailable', 'Try again.'))
    const props = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
    await screen.findByRole('alert')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000)
    })
    expect(props.onNext).not.toHaveBeenCalled()
  })

  it('shows the red debug borders only when the backend turns them on', async () => {
    const { unmount } = (() => {
      setup()
      return { unmount: () => cleanup() }
    })()
    await screen.findByRole('button', { name: 'finish recording' })
    expect(screen.queryByTestId('gaze-debug')).toBeNull()
    unmount()
    setup(1, { ...DEFAULT_CONFIG, debug_borders: true })
    expect(await screen.findByTestId('gaze-debug')).toBeInTheDocument()
  })

  it('shows no look-away or flag wording to the student', async () => {
    setup()
    await screen.findByRole('button', { name: 'finish recording' })
    expect(document.body.textContent).not.toMatch(/look(ed)? away|look-away|flag|review/i)
  })
})

describe('QuestionScreen', () => {
  it('shows one question with its position and asks the server for it once', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: question.text })).toBeInTheDocument()
    expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
    expect(getQuestion).toHaveBeenCalledTimes(1)
    expect(getQuestion).toHaveBeenCalledWith('s1', 1)
  })

  it('uploads the recording, shows the transcript, then moves on', async () => {
    const props = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
    expect(await screen.findByText('Because sets are fast.')).toBeInTheDocument()
    expect(props.onAnswered).toHaveBeenCalledWith(1, 'Because sets are fast.')
    fireEvent.click(screen.getByRole('button', { name: 'Next question' }))
    expect(props.onNext).toHaveBeenCalled()
  })

  it('offers the report after the last question', async () => {
    vi.mocked(getQuestion).mockResolvedValue({ ...question, index: 3 })
    setup(3)
    fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
    expect(await screen.findByRole('button', { name: 'See my report' })).toBeInTheDocument()
  })

  it('a failed upload can be sent again without restarting the clock', async () => {
    vi.mocked(submitAnswer)
      .mockRejectedValueOnce(new ApiError(503, 'transcription_unavailable', 'Try again.'))
      .mockResolvedValueOnce({ ...answered })
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Send again' }))
    expect(await screen.findByText('Because sets are fast.')).toBeInTheDocument()
    const [first, second] = vi.mocked(submitAnswer).mock.calls
    expect(second[2]).toBe(first[2]) // the very same recording
    expect(getQuestion).toHaveBeenCalledTimes(1) // the question (and its timer) was not re-requested
  })

  it('carries on when the server says the question already has an answer', async () => {
    vi.mocked(submitAnswer).mockRejectedValue(new ApiError(409, 'already_answered', 'dup'))
    const props = setup()
    fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
    expect(await screen.findByText(/already had a saved answer/i)).toBeInTheDocument()
    expect(props.onAnswered).toHaveBeenCalledWith(1, '')
  })

  it('tells the student about a late answer calmly', async () => {
    vi.mocked(submitAnswer).mockResolvedValue({ ...answered, late: true })
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
    expect(await screen.findByText(/marked late/i)).toBeInTheDocument()
  })

  it('shows a clear note when nothing was heard', async () => {
    vi.mocked(submitAnswer).mockResolvedValue({ transcript: '', seconds_used: 1, late: false })
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
    expect(await screen.findByText(/no speech was detected/i)).toBeInTheDocument()
  })

  it('reports a lost session to the app', async () => {
    vi.mocked(getQuestion).mockRejectedValue(new ApiError(404, 'session_not_found', 'gone'))
    const props = setup()
    await waitFor(() => expect(props.onSessionLost).toHaveBeenCalled())
  })

  it('lets the student retry when the question cannot load', async () => {
    vi.mocked(getQuestion)
      .mockRejectedValueOnce(new ApiError(0, 'network', 'Cannot reach the server.'))
      .mockResolvedValueOnce({ ...question })
    setup()
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot reach the server.')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { name: question.text })).toBeInTheDocument()
  })
})
