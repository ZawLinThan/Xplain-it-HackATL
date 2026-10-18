import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useQuestionSpeech } from '../src/useQuestionSpeech'
function setup() {
  const audio = { onended: null as null | (() => void), onerror: null as null | (() => void), play: vi.fn().mockResolvedValue(undefined), pause: vi.fn(), load: vi.fn(), removeAttribute: vi.fn(), src: '' }
  vi.stubGlobal('Audio', class { constructor() { return audio } })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['audio']) }))
  vi.stubGlobal('URL', { createObjectURL: vi.fn().mockReturnValue('blob:question'), revokeObjectURL: vi.fn() })
  return audio
}
afterEach(() => vi.unstubAllGlobals())
it('waits for ElevenLabs audio and releases it when playback ends', async () => {
  const audio = setup()
  const onRead = vi.fn()
  const { result } = renderHook(() => useQuestionSpeech('Explain your code.', onRead))
  expect(result.current.done).toBe(false)
  await waitFor(() => expect(audio.play).toHaveBeenCalled())
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/speech'), expect.objectContaining({ body: JSON.stringify({ text: 'Explain your code.' }) }))
  expect(onRead).not.toHaveBeenCalled()
  act(() => audio.onended?.())
  expect(onRead).toHaveBeenCalledTimes(1)
  expect(result.current.done).toBe(true)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:question')
})
it('supports retry and skip after blocked playback', async () => {
  const audio = setup()
  audio.play.mockRejectedValueOnce(new Error('blocked'))
  const onRead = vi.fn()
  const { result } = renderHook(() => useQuestionSpeech('Question', onRead))
  await waitFor(() => expect(result.current.error).toMatch(/could not be read/))
  act(() => result.current.retry())
  await waitFor(() => expect(audio.play).toHaveBeenCalledTimes(2))
  act(() => result.current.skip())
  expect(result.current.done).toBe(true)
  expect(onRead).not.toHaveBeenCalled()
})
it('allows skipping a failed request', async () => {
  setup()
  vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)
  const onRead = vi.fn()
  const { result } = renderHook(() => useQuestionSpeech('Question', onRead))
  await waitFor(() => expect(result.current.error).toMatch(/could not be read/))
  act(() => result.current.skip())
  expect(result.current.done).toBe(true)
  expect(onRead).not.toHaveBeenCalled()
})
