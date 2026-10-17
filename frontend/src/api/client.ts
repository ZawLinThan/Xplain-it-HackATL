import answerResultMock from './mocks/answer_result.json'
import questionsMock from './mocks/questions.json'
import reportMock from './mocks/report.json'
import reportPartialMock from './mocks/report_partial.json'
import reportWeakMock from './mocks/report_weak.json'
import sessionMock from './mocks/session_created.json'
import transcriptsMock from './mocks/transcripts.json'
import type { AnswerResult, AppConfig, QuestionPublic, Report, SessionCreated } from './types'

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
  if (MOCK) return mockCall({ demo_mode: false }, 0)
  return request<AppConfig>('/config')
}

export function createSession(): Promise<SessionCreated> {
  if (MOCK) return mockCall(sessionMock as SessionCreated, 1200)
  return request<SessionCreated>('/sessions', { method: 'POST' })
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

export function submitAnswer(sessionId: string, n: number, audio: Blob): Promise<AnswerResult> {
  if (MOCK) {
    const transcript = (transcriptsMock as string[])[n - 1] ?? ''
    return mockCall({ ...(answerResultMock as AnswerResult), transcript }, 1000)
  }
  const form = new FormData()
  form.append('audio', audio, 'answer.webm')
  form.append('consent', 'true')
  return request<AnswerResult>(`/sessions/${encodeURIComponent(sessionId)}/questions/${n}/answer`, {
    method: 'POST',
    body: form,
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
