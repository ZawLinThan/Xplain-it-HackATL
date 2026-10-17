import { afterEach, expect, it, vi } from 'vitest'
import { printLookawaySubmission } from '../../src/lookaway/debug'

afterEach(() => vi.restoreAllMocks())
it('prints the actual gaze payload, destination, count, and duration table without media', () => {
  vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined)
  vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined)
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const table = vi.spyOn(console, 'table').mockImplementation(() => undefined)
  const payload = { tracked: true, events: [{ t_ms: 100, side: 'left' as const }], duration_log: [{ t_ms: 100, duration_ms: 2400, side: 'left' as const }] }
  printLookawaySubmission('s1', 3, payload, false)
  expect(log).toHaveBeenCalledWith('POST destination:', '/api/v1/sessions/s1/questions/3/answer')
  expect(log).toHaveBeenCalledWith('Look-away count:', 1)
  expect(log).toHaveBeenCalledWith('lookaway form-field JSON:', JSON.stringify(payload))
  expect(table).toHaveBeenCalledWith([{ ...payload.duration_log[0], start_s: 0.1, duration_s: 2.4 }])
})
