import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import GazeCalibration from '../../src/components/GazeCalibration'
import { hasCalibration, setCalibration } from '../../src/lookaway/calibration'
import { estimateRawGaze } from '../../src/lookaway/gaze'
import { loadLandmarker } from '../../src/lookaway/MediaPipeFaceTracker'

vi.mock('../../src/lookaway/gaze', () => ({ estimateRawGaze: vi.fn() }))
vi.mock('../../src/lookaway/MediaPipeFaceTracker', () => ({ loadLandmarker: vi.fn() }))
const detect = vi.fn(() => ({ faceLandmarks: [[{}]] }))
const targets = [
  { gx: 0.5, gy: 0.5 }, { gx: 0.15, gy: 0.5 }, { gx: 0.85, gy: 0.5 },
  { gx: 0.5, gy: 0.15 }, { gx: 0.5, gy: 0.85 }, { gx: 0.5, gy: 0.5 },
]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] })
  vi.mocked(loadLandmarker).mockResolvedValue({ detectForVideo: detect } as unknown as Awaited<ReturnType<typeof loadLandmarker>>)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); setCalibration(null) })

async function setup() {
  const video = document.createElement('video')
  Object.defineProperties(video, {
    readyState: { value: 2 },
    currentTime: { get: () => performance.now() / 1000 },
  })
  const close = vi.fn()
  const result = render(<GazeCalibration video={video} onClose={close} />)
  await act(async () => { await Promise.resolve() })
  return { ...result, close }
}

describe('guided gaze calibration', () => {
  it('fits five targets, validates a separate center fixation, then saves the mapping', async () => {
    vi.mocked(estimateRawGaze).mockImplementation(() => {
      const target = targets[Math.min(5, Math.floor(performance.now() / 2112))]
      return { gx: -0.7 + target.gx * 0.6, gy: 1.2 + target.gy * 0.4 }
    })
    const { close } = await setup()
    act(() => { vi.advanceTimersByTime(12672) })
    expect(close).toHaveBeenCalledWith(true)
    expect(hasCalibration()).toBe(true)
  })

  it('rejects a tracker that does not distinguish targets and cleans up on close', async () => {
    vi.mocked(estimateRawGaze).mockReturnValue({ gx: 0.5, gy: 0.5 })
    const { close, unmount } = await setup()
    act(() => { vi.advanceTimersByTime(12672) })
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('could not reliably distinguish')
    expect(hasCalibration()).toBe(false)
    unmount()
    const calls = detect.mock.calls.length
    act(() => { vi.advanceTimersByTime(20000) })
    expect(detect.mock.calls.length).toBe(calls)
  })

  it('does not accept a fit when the independent center check fails', async () => {
    vi.mocked(estimateRawGaze).mockImplementation(() => {
      const index = Math.min(5, Math.floor(performance.now() / 2112))
      return index === 5 ? { gx: 1, gy: 0 } : targets[index]
    })
    const { close } = await setup()
    act(() => { vi.advanceTimersByTime(12672) })
    expect(hasCalibration()).toBe(false)
    expect(close).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('could not reliably distinguish')
  })
})
