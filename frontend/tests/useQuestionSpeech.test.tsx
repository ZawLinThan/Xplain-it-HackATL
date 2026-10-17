import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useQuestionSpeech } from '../src/useQuestionSpeech'

function speech() {
  class Utterance {
    text: string
    constructor(text: string) { this.text = text }
    onend: (() => void) | null = null
    onerror: (() => void) | null = null
  }
  const synth = { speak: vi.fn(), cancel: vi.fn() }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  return synth
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
it('holds recording until speech ends and cancels on unmount', () => {
  const synth = speech()
  const { result, unmount } = renderHook(() => useQuestionSpeech('Explain your code.'))
  expect(result.current.done).toBe(false)
  const utterance = synth.speak.mock.calls[0][0]
  expect(utterance.text).toBe('Explain your code.')
  act(() => utterance.onend())
  expect(result.current.done).toBe(true)
  unmount()
  expect(synth.cancel).toHaveBeenCalled()
})
it('lets the user retry blocked speech or continue using text', () => {
  const synth = speech()
  const { result } = renderHook(() => useQuestionSpeech('Question'))
  act(() => synth.speak.mock.calls[0][0].onerror())
  expect(result.current.error).toMatch(/could not be read/)
  expect(result.current.done).toBe(false)
  act(() => result.current.retry())
  expect(synth.speak).toHaveBeenCalledTimes(2)
  act(() => result.current.skip())
  expect(result.current.done).toBe(true)
})
it('does not block recording on browsers without speech synthesis', () => {
  vi.stubGlobal('speechSynthesis', undefined)
  const { result } = renderHook(() => useQuestionSpeech('Question'))
  expect(result.current.done).toBe(true)
  expect(result.current.supported).toBe(false)
})
