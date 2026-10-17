import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LookAwayMonitor } from '../../src/lookaway'
import type { FaceTracker } from '../../src/lookaway/FaceTracker'
import GazeDebugOverlay from '../../src/components/GazeDebugOverlay'

describe('GazeDebugOverlay', () => {
  it('draws four red borders, the gaze dot and the count, and is hidden from assistive tech', async () => {
    let emit: Parameters<FaceTracker['start']>[1] = () => undefined
    const tracker: FaceTracker = {
      start: vi.fn((_v, cb) => {
        emit = cb
        return Promise.resolve()
      }),
      stop: vi.fn(),
    }
    const monitor = new LookAwayMonitor(tracker)
    await monitor.attach({} as HTMLVideoElement)
    render(<GazeDebugOverlay monitor={monitor} />)
    const root = screen.getByTestId('gaze-debug')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root.querySelectorAll('div[style*="2px solid"]')).toHaveLength(4)
    expect(root).toHaveTextContent('look-aways 0')
    expect(root).toHaveTextContent('paused (total retained)')
    const { act } = await import('@testing-library/react')
    act(() => emit({ gx: 0.7, gy: 0.4 }))
    expect(root.querySelector('div[style*="left: 70%"]')).not.toBeNull()
    act(() => monitor.beginCounting())
    expect(root).toHaveTextContent('recording new events')
    act(() => monitor.halt())
    expect(root).toHaveTextContent('paused (total retained)')
  })
})
