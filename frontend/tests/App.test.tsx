import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../src/api/media', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/api/media')>()
  const track = { kind: 'audio', stop: vi.fn() }
  return {
    ...actual,
    openMedia: vi.fn().mockResolvedValue({
      stream: { getTracks: () => [track], getAudioTracks: () => [track], getVideoTracks: () => [] },
      hasVideo: false,
    }),
  }
})

vi.mock('../src/Recorder', () => ({
  default: ({ onComplete }: { onComplete: (b: Blob, s: number) => void }) => (
    <button type="button" onClick={() => onComplete(new Blob(['x']), 8)}>
      finish recording
    </button>
  ),
}))

beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getDisplayMedia: vi.fn().mockResolvedValue({
      getVideoTracks: () => [{ getSettings: () => ({ displaySurface: 'monitor' }), addEventListener: vi.fn() }],
      getTracks: () => [{ stop: vi.fn() }],
    }),
  } })
  vi.resetModules()
  vi.stubEnv('VITE_MOCK', '1')
  vi.stubEnv('VITE_MOCK_FAST', '1')
  sessionStorage.clear()
})
afterEach(() => {
  vi.unstubAllEnvs()
  sessionStorage.clear()
  window.history.pushState({}, '', '/')
})

async function renderApp() {
  const { default: App } = await import('../src/App')
  return render(<App />)
}

async function startQuiz() {
  fireEvent.click(await screen.findByRole('button', { name: 'Share entire screen' }))
  await screen.findByText('Entire screen sharing is active.')
  fireEvent.click(await screen.findByRole('button', { name: 'Check devices' }))
  await screen.findByText(/microphone ready/i)
  fireEvent.click(screen.getByRole('checkbox', { name: /I agree/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Start' }))
}

describe('App flow (mock mode)', () => {
  it('Start stays disabled until devices are checked and consent is given', async () => {
    await renderApp()
    const start = await screen.findByRole('button', { name: 'Start' })
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Check devices' }))
    await screen.findByText(/microphone ready/i)
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /I agree/ }))
    expect(start).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Share entire screen' }))
    await screen.findByText('Entire screen sharing is active.')
    expect(start).toBeEnabled()
  })

  it('runs start -> three questions one by one -> report', async () => {
    await renderApp()
    await startQuiz()

    for (const n of [1, 2, 3]) {
      expect(await screen.findByText(`Question ${n} of 3`)).toBeInTheDocument()
      // only the current question is on screen
      expect(await screen.findAllByRole('heading', { level: 1 })).toHaveLength(1)
      fireEvent.click(await screen.findByRole('button', { name: 'finish recording' }))
      await screen.findByText(/what we heard/i)
      // no click: after the transcript the app moves on by itself
    }

    expect(await screen.findByText('81.3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(await screen.findByRole('button', { name: 'Check devices' })).toBeInTheDocument()
  })

  it('resumes at the first unanswered question after a refresh', async () => {
    sessionStorage.setItem(
      'explain-it-session',
      JSON.stringify({ sessionId: 's1', title: 'Quiz', total: 3, transcripts: { 1: 'a', 2: 'b' } }),
    )
    await renderApp()
    fireEvent.click(await screen.findByRole('button', { name: 'Share entire screen' }))
    expect(await screen.findByText('Question 3 of 3')).toBeInTheDocument()
  })

  it('resumes straight to the report when everything was answered', async () => {
    sessionStorage.setItem(
      'explain-it-session',
      JSON.stringify({ sessionId: 's1', title: 'Quiz', total: 3, transcripts: { 1: 'a', 2: 'b', 3: 'c' } }),
    )
    await renderApp()
    expect(await screen.findByText('81.3')).toBeInTheDocument()
  })

  it('typed answers request explains it is not available yet', async () => {
    await renderApp()
    fireEvent.click(await screen.findByRole('button', { name: /request typed answers/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/instructor/i)
  })
})
