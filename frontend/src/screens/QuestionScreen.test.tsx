import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getQuestion, submitAnswer } from '../api/client'
import QuestionScreen from './QuestionScreen'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, getQuestion: vi.fn(), submitAnswer: vi.fn() }
})

// The real recorder needs a browser; this stand-in just lets the test "finish recording".
vi.mock('../Recorder', () => ({
  default: ({ onComplete }: { onComplete: (b: Blob, s: number) => void }) => (
    <button type="button" onClick={() => onComplete(new Blob(['x'], { type: 'audio/webm' }), 12.3)}>
      finish recording
    </button>
  ),
}))

const question = { index: 1, total: 3, text: 'Why did you use a set?', max_seconds: 40 }
const answered = { transcript: 'Because sets are fast.', seconds_used: 12.3, late: false }

function setup(index = 1) {
  const props = {
    sessionId: 's1',
    index,
    total: 3,
    onAnswered: vi.fn(),
    onNext: vi.fn(),
    onSessionLost: vi.fn(),
  }
  render(<QuestionScreen {...props} />)
  return props
}

beforeEach(() => {
  vi.mocked(getQuestion).mockReset().mockResolvedValue({ ...question })
  vi.mocked(submitAnswer).mockReset().mockResolvedValue({ ...answered })
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
