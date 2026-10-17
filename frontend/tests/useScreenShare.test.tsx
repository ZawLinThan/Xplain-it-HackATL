import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useScreenShare } from '../src/useScreenShare'

afterEach(() => vi.restoreAllMocks())
function display(surface = 'monitor') {
  const stop = vi.fn()
  const track = new EventTarget()
  Object.assign(track, { stop, getSettings: () => ({ displaySurface: surface }) })
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] }
  const getDisplayMedia = vi.fn().mockResolvedValue(stream)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia } })
  return { track, stop, getDisplayMedia }
}
it('accepts an entire screen and detects when sharing ends', async () => {
  const d = display()
  const { result } = renderHook(() => useScreenShare(true))
  await act(() => result.current.request())
  expect(result.current.active).toBe(true)
  expect(d.getDisplayMedia).toHaveBeenCalledWith({ video: { displaySurface: 'monitor' }, audio: false })
  act(() => d.track.dispatchEvent(new Event('ended')))
  expect(result.current.active).toBe(false)
  expect(result.current.error).toMatch(/stopped/)
})
it('rejects window or tab sharing and stops those tracks', async () => {
  const d = display('window')
  const { result } = renderHook(() => useScreenShare(true))
  await act(() => result.current.request())
  expect(result.current.active).toBe(false)
  expect(result.current.error).toMatch(/Entire Screen/)
  expect(d.stop).toHaveBeenCalled()
})
it('handles permission denial without enabling Start', async () => {
  const d = display()
  d.getDisplayMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
  const { result } = renderHook(() => useScreenShare(true))
  await act(() => result.current.request())
  expect(result.current.active).toBe(false)
  expect(result.current.error).toMatch(/cancelled or blocked/)
})
it('releases the screen when the assessment ends and on unmount', async () => {
  const d = display()
  const { result, rerender, unmount } = renderHook(({ enabled }) => useScreenShare(enabled), { initialProps: { enabled: true } })
  await act(() => result.current.request())
  rerender({ enabled: false })
  await waitFor(() => expect(result.current.active).toBe(false))
  expect(d.stop).toHaveBeenCalled()
  unmount()
})
