import { voiceEnrollment, setVoiceEnrollment } from '../voice/profile'
import type { components } from './schema'
import answerResultMock from './mocks/answer_result.json'
import professorDetailMocks from './mocks/professor_sessions_detail.json'
import professorListMock from './mocks/professor_sessions.json'
import questionsMock from './mocks/questions.json'
import reportMock from './mocks/report.json'
import reportPartialMock from './mocks/report_partial.json'
import reportWeakMock from './mocks/report_weak.json'
import sessionMock from './mocks/session_created.json'
import transcriptsMock from './mocks/transcripts.json'
import type {
  AnswerResult,
  AppConfig,
  ProfessorSession,
  ProfessorSessions,
  QuestionPublic,
  Report,
  SessionCreated,
  UploadCreated,
} from './types'
import { printLookawaySubmission } from '../lookaway/debug'
import type { LookawayPayload } from '../lookaway/types'

const MOCK = import.meta.env.VITE_MOCK === '1'
const BASE = `${import.meta.env.VITE_API_URL ?? 'http://localhost:8000'}/api/v1`

/** Every failure becomes one of these, using the backend's {error:{code,message}} shape. */
export class ApiError extends Error {
  code: string
  status: number

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, init)
  } catch {
    throw new ApiError(
      0,
      'network',
      'Cannot reach the server. Check that the backend is running, then try again.',
    )
  }
  if (!response.ok) {
    let code = 'http_error'
    let message = `The server answered with an error (${response.status}).`
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } }
      code = body.error?.code ?? code
      message = body.error?.message ?? message
    } catch {
      // keep the generic message
    }
    throw new ApiError(response.status, code, message)
  }
  return (await response.json()) as T
}

// ------------------------------------------------------------------ mock mode

const FAST = import.meta.env.VITE_MOCK_FAST === '1' // tests skip the artificial delays
const wait = (ms = 600) => new Promise((resolve) => setTimeout(resolve, FAST ? 0 : ms))

function mockVariant(): 'strong' | 'weak' | 'partial' {
  const value = new URLSearchParams(window.location.search).get('mock')
  return value === 'weak' || value === 'partial' ? value : 'strong'
}

async function mockCall<T>(value: T, ms?: number): Promise<T> {
  await wait(ms)
  return structuredClone(value)
}

// ------------------------------------------------------------------ endpoints

export function getConfig(): Promise<AppConfig> {
  if (MOCK) return mockCall({ demo_mode: false, gaze_tracking: true, debug_borders: false }, 0)
  return request<AppConfig>('/config')
}

/** Send the assessment and every answer file for content-based question generation. */
export function uploadFiles(questions: File, answers: File[]): Promise<UploadCreated> {
  if (MOCK) return Promise.reject(new ApiError(503, 'live_uploads_required', 'Disable frontend mock mode to generate questions from your uploaded files.'))
  const form = new FormData()
  form.append('questions_file', questions)
  answers.forEach((file) => form.append('answers_file', file))
  return request<UploadCreated>('/uploads', { method: 'POST', body: form })
}

export function createSession(uploadId?: string): Promise<SessionCreated> {
  if (MOCK) return mockCall(sessionMock as SessionCreated, 1200)
  const enrollment = voiceEnrollment()
  if (!uploadId && !enrollment) return request<SessionCreated>('/sessions', { method: 'POST' })
  return request<SessionCreated>('/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...(uploadId ? { upload_id: uploadId } : {}), ...(enrollment ? { voice_enrollment_id: enrollment } : {}) }),
  }).then((session) => { setVoiceEnrollment(null); return session })
}

/** Asking for a question starts its server-side timer, so only call this when it is shown. */
export function getQuestion(sessionId: string, n: number): Promise<QuestionPublic> {
  if (MOCK) {
    const question = (questionsMock as QuestionPublic[])[n - 1]
    if (!question) return Promise.reject(new ApiError(404, 'question_not_found', 'No such question.'))
    return mockCall(question, 300)
  }
  return request<QuestionPublic>(`/sessions/${encodeURIComponent(sessionId)}/questions/${n}`)
}

export function submitAnswer(
  sessionId: string,
  n: number,
  audio: Blob,
  lookaway?: LookawayPayload,
): Promise<AnswerResult> {
  printLookawaySubmission(sessionId, n, lookaway, MOCK)
  if (MOCK) {
    const transcript = (transcriptsMock as string[])[n - 1] ?? ''
    return mockCall({ ...(answerResultMock as AnswerResult), transcript }, 1000)
  }
  const form = new FormData()
  form.append('audio', audio, 'answer.webm')
  form.append('consent', 'true')
  if (lookaway) form.append('lookaway', JSON.stringify(lookaway)) // counts and times only
  return request<AnswerResult>(`/sessions/${encodeURIComponent(sessionId)}/questions/${n}/answer`, {
    method: 'POST',
    body: form,
  }).then((result) => {
    console.info(`[look-away] Question ${n}: server accepted the answer. See backend "Saved for professor" output for stored logs.`)
    return result
  }).catch((error: unknown) => {
    console.warn(`[look-away] Question ${n}: submission not confirmed; logs remain available for retry.`)
    throw error
  })
}

export function getReport(sessionId: string): Promise<Report> {
  if (MOCK) {
    const variant = mockVariant()
    const report =
      variant === 'weak' ? reportWeakMock : variant === 'partial' ? reportPartialMock : reportMock
    return mockCall(report as Report, 1500)
  }
  return request<Report>(`/sessions/${encodeURIComponent(sessionId)}/report`)
}

// ------------------------------------------------------------ professor (token protected)

function professorHeaders(token: string): HeadersInit {
  return { 'X-Professor-Token': token }
}

export function getProfessorSessions(token: string): Promise<ProfessorSessions> {
  if (MOCK) {
    return token
      ? mockCall(professorListMock as ProfessorSessions, 300)
      : Promise.reject(new ApiError(401, 'unauthorized', 'That token is not accepted.'))
  }
  return request<ProfessorSessions>('/professor/sessions', { headers: professorHeaders(token) })
}

export function getProfessorSession(token: string, sessionId: string): Promise<ProfessorSession> {
  if (MOCK) {
    const detail = (professorDetailMocks as Record<string, ProfessorSession>)[sessionId]
    return detail
      ? mockCall(detail, 300)
      : Promise.reject(new ApiError(404, 'session_not_found', 'No such session.'))
  }
  return request<ProfessorSession>(`/professor/sessions/${encodeURIComponent(sessionId)}`, {
    headers: professorHeaders(token),
  })
}


export function voiceStatus(): Promise<components['schemas']['VoiceStatus']> {
  if (MOCK) return Promise.resolve({ available: false })
  return request('/voice/status')
}
export function enrollVoice(pcm: Uint8Array<ArrayBuffer>): Promise<components['schemas']['VoiceEnrollment']> {
  return request('/voice/enroll?consent=true', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pcm })
}
export function checkVoice(sessionId: string, question: number, sequence: number, pcm: Uint8Array<ArrayBuffer>, signal: AbortSignal): Promise<components['schemas']['VoiceCheckResult']> {
  return request(`/sessions/${encodeURIComponent(sessionId)}/questions/${question}/voice-check?sequence=${sequence}`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: pcm, signal,
  })
}

/** Notify the backend after audio playback; the model answer stays on the server. */
export function questionReadAloud(sessionId: string, n: number): Promise<{ ok: boolean }> {
  if (MOCK) return Promise.resolve({ ok: true })
  return request(`/sessions/${encodeURIComponent(sessionId)}/questions/${n}/read-aloud`, { method: 'POST' })
}
