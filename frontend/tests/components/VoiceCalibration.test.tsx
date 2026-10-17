import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import VoiceCalibration from '../../src/components/VoiceCalibration'
import { enrollVoice, voiceStatus } from '../../src/api/client'
import { capturePcm } from '../../src/voice/capture'
import { setVoiceEnrollment, voiceEnrollment } from '../../src/voice/profile'

vi.mock('../../src/api/client', () => ({ enrollVoice: vi.fn(), voiceStatus: vi.fn() }))
vi.mock('../../src/voice/capture', async (original) => ({ ...await original<typeof import('../../src/voice/capture')>(), capturePcm: vi.fn() }))
let emit: (pcm: Uint8Array) => void
const stop = vi.fn()
beforeEach(() => {
  vi.mocked(voiceStatus).mockResolvedValue({ available: true })
  vi.mocked(enrollVoice).mockResolvedValue({ enrollment_id: 'session-only-token' })
  vi.mocked(capturePcm).mockImplementation(async (_stream, callback) => { emit = callback; return stop })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); setVoiceEnrollment(null) })

it('requires consent, records 15 seconds, and stores only an ephemeral enrollment token', async () => {
  const readiness = vi.fn()
  render(<VoiceCalibration stream={() => ({} as MediaStream)} onReadiness={readiness} />)
  expect(await screen.findByRole('button', { name: 'Record voice calibration' })).toBeDisabled()
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: 'Record voice calibration' }))
  await act(async () => { await Promise.resolve() })
  act(() => { for (let i = 0; i < 15; i++) emit(new Uint8Array(32000)) })
  expect(await screen.findByText('Voice calibrated for this assessment.')).toBeInTheDocument()
  expect(enrollVoice).toHaveBeenCalledWith(expect.any(Uint8Array))
  expect(vi.mocked(enrollVoice).mock.calls[0][0]).toHaveLength(480000)
  expect(voiceEnrollment()).toBe('session-only-token')
  expect(readiness).toHaveBeenLastCalledWith(true, true)
  expect(stop).toHaveBeenCalled()
})

it('does not claim enrollment or mismatch detection when the worker is unavailable', async () => {
  vi.mocked(voiceStatus).mockResolvedValue({ available: false })
  render(<VoiceCalibration stream={() => ({} as MediaStream)} onReadiness={vi.fn()} />)
  expect(await screen.findByText(/Speaker verification is unavailable/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Record voice calibration' })).toBeDisabled()
})
