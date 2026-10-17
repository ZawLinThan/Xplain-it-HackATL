import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Recorder from './Recorder'

class FakeTrack {
  kind: string
  stop = vi.fn()
  constructor(kind: string) {
    this.kind = kind
  }
}

class FakeMediaStream {
  tracks: FakeTrack[]
  constructor(tracks: FakeTrack[] = []) {
    this.tracks = tracks
  }
  getTracks() {
    return this.tracks
  }
  getAudioTracks() {
    return this.tracks.filter((t) => t.kind === 'audio')
  }
  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video')
  }
}

class FakeRecorder {
  static instances: FakeRecorder[] = []
  static isTypeSupported = () => true
  stream: FakeMediaStream
  state = 'inactive'
  mimeType = 'audio/webm'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  constructor(stream: FakeMediaStream) {
    this.stream = stream
    FakeRecorder.instances.push(this)
  }
  start() {
    this.state = 'recording'
  }
  stop() {
    if (this.state === 'inactive') return
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['audio-bytes']) })
    this.onstop?.()
  }
}

let camera: FakeTrack
let mic: FakeTrack
let getUserMedia: ReturnType<typeof vi.fn>

beforeEach(() => {
  FakeRecorder.instances = []
  mic = new FakeTrack('audio')
  camera = new FakeTrack('video')
  getUserMedia = vi.fn().mockResolvedValue(new FakeMediaStream([mic, camera]))
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  vi.stubGlobal('MediaStream', FakeMediaStream)
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function ready(onComplete = vi.fn()) {
  const view = render(<Recorder maxSeconds={40} onComplete={onComplete} />)
  const button = await screen.findByRole('button', { name: /start answering/i })
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  return { ...view, onComplete, button }
}

describe('Recorder', () => {
  it('stops by itself at 40 seconds', async () => {
    const { onComplete, button } = await ready()
    fireEvent.click(button)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(40_000)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    const [blob, seconds] = onComplete.mock.calls[0]
    expect(blob).toBeInstanceOf(Blob)
    expect(seconds).toBe(40)
    expect(screen.queryByRole('button', { name: /stop and submit/i })).toBeNull()
  })

  it('can be stopped early', async () => {
    const { onComplete, button } = await ready()
    fireEvent.click(button)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000)
    })
    fireEvent.click(screen.getByRole('button', { name: /stop and submit/i }))
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][1]).toBeCloseTo(5, 0)
  })

  it('shows the countdown and announces 10 seconds left', async () => {
    const { button } = await ready()
    fireEvent.click(button)
    expect(screen.getByText('40 s left')).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(31_000)
    })
    expect(screen.getByText('9 s left')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('10 seconds left')
  })

  it('a throttled background tab cannot make a recording longer than the cap', async () => {
    const { onComplete, button } = await ready()
    fireEvent.click(button)
    const start = performance.now()
    vi.spyOn(performance, 'now').mockReturnValue(start + 90_000) // the tab slept for 90 s
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100) // only one tick ever fires
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete.mock.calls[0][1]).toBe(40)
  })

  it('records the audio track only', async () => {
    const { button } = await ready()
    fireEvent.click(button)
    const tracks = FakeRecorder.instances[0].stream.getTracks()
    expect(tracks).toHaveLength(1)
    expect(tracks[0].kind).toBe('audio')
  })

  it('shows a helpful message when permission is denied', async () => {
    getUserMedia.mockRejectedValue(new DOMException('no', 'NotAllowedError'))
    render(<Recorder maxSeconds={40} onComplete={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked/i)
    expect(screen.queryByRole('button', { name: /start answering/i })).toBeNull()
  })

  it('falls back to audio only when there is no camera', async () => {
    getUserMedia
      .mockRejectedValueOnce(new DOMException('no camera', 'NotFoundError'))
      .mockResolvedValueOnce(new FakeMediaStream([mic]))
    render(<Recorder maxSeconds={40} onComplete={vi.fn()} />)
    expect(await screen.findByRole('button', { name: /start answering/i })).toBeInTheDocument()
    expect(screen.getByText(/audio only/i)).toBeInTheDocument()
  })

  it('releases the camera and microphone on unmount', async () => {
    const { unmount } = await ready()
    unmount()
    expect(mic.stop).toHaveBeenCalled()
    expect(camera.stop).toHaveBeenCalled()
  })

  it('releases devices even if unmounted mid-recording, without calling onComplete', async () => {
    const { unmount, onComplete, button } = await ready()
    fireEvent.click(button)
    unmount()
    expect(mic.stop).toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
  })
})
