import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LookAwayMonitor } from '../../src/lookaway'
import type { FaceTracker } from '../../src/lookaway/FaceTracker'
import GazeDebugOverlay from '../../src/components/GazeDebugOverlay'

describe('GazeDebugOverlay', () => {
  it('shows the gaze dot and count without boundary lines, and is hidden from assistive tech', async () => {
    let emit: Parameters<FaceTracker['start']>[1] = () => undefined
    const tracker: FaceTracker = {
      start: vi.fn((_v, cb) => {
        emit = cb
        return Promise.resolve()
      }),
      stop: vi.fn(),
    }
    let now = 0
    const monitor = new LookAwayMonitor(tracker, {}, () => now)
    await monitor.attach({} as HTMLVideoElement)
    render(<GazeDebugOverlay monitor={monitor} />)
    const root = screen.getByTestId('gaze-debug')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root.querySelectorAll('div[style*="2px solid"]')).toHaveLength(0)
    expect(root).toHaveTextContent('look-aways 0')
    expect(root).toHaveTextContent('duration entries 0')
    const { act } = await import('@testing-library/react')
    act(() => emit({ gx: 0.7, gy: 0.4 }))
    expect(root.querySelector('div[style*="left: 70%"]')).not.toBeNull()
    act(() => monitor.beginCounting())
    act(() => {
      for (now = 0; now <= 2200; now += 100) emit({ gx: 0.02, gy: 0.02 })
    })
    expect(root).toHaveTextContent('duration entries 1')
    expect(root).toHaveTextContent('Normal log:')
    expect(root).toHaveTextContent('Duration log: 0.0s left (2.2s)')
    act(() => monitor.halt())
    expect(root).toHaveTextContent('duration entries 1')
  })
})
