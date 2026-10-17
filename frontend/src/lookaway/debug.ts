import type { LookawayPayload } from './types'

/** Print only gaze timing data, never audio, camera frames, or transcripts. */
export function printLookawaySubmission(sessionId: string, question: number, payload: LookawayPayload | undefined, mock: boolean): void {
  const endpoint = `/api/v1/sessions/${encodeURIComponent(sessionId)}/questions/${question}/answer`
  console.groupCollapsed(`[look-away] Question ${question} completed${mock ? ' (mock: not sent)' : ''}`)
  console.log('POST destination:', endpoint)
  console.log('Look-away count:', payload?.tracked ? payload.events.length : 'not tracked')
  console.table(payload?.events ?? [])
  console.table((payload?.duration_log ?? []).map((entry) => ({ ...entry, start_s: entry.t_ms / 1000, duration_s: entry.duration_ms / 1000 })))
  console.log('lookaway form-field JSON:', payload ? JSON.stringify(payload) : '(no gaze payload)')
  console.groupEnd()
}
