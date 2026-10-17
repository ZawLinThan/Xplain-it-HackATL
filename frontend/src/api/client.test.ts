import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createSession, getQuestion, getReport, submitAnswer } from './client'

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

afterEach(() => vi.restoreAllMocks())

describe('api client', () => {
  it('posts to /api/v1/sessions', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      respond(201, { session_id: 'abc', title: 'T', total_questions: 3, max_answer_seconds: 40 }),
    )
    const session = await createSession()
    expect(session.session_id).toBe('abc')
    expect(String(spy.mock.calls[0][0])).toBe('http://localhost:8000/api/v1/sessions')
    expect(spy.mock.calls[0][1]?.method).toBe('POST')
  })

  it('gets a numbered question', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      respond(200, { index: 2, total: 3, text: 'Q', max_seconds: 40 }),
    )
    expect((await getQuestion('s 1', 2)).index).toBe(2)
    expect(String(spy.mock.calls[0][0])).toBe('http://localhost:8000/api/v1/sessions/s%201/questions/2')
  })

  it('maps the shared error shape to ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      respond(409, { error: { code: 'already_answered', message: 'Already there.' } }),
    )
    await expect(getReport('s1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'already_answered',
      message: 'Already there.',
    })
  })

  it('has a generic message when the error body is not JSON', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response('<html>oops</html>', { status: 502 })),
    )
    const error = await getReport('s1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(502)
  })

  it('turns a network failure into a friendly ApiError', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(createSession()).rejects.toMatchObject({ code: 'network', status: 0 })
  })

  it('uploads audio as multipart with consent', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      respond(201, { transcript: 'hi', seconds_used: 2, late: false }),
    )
    const result = await submitAnswer('s1', 3, new Blob(['audio'], { type: 'audio/webm' }))
    expect(result.transcript).toBe('hi')
    const [url, init] = spy.mock.calls[0]
    expect(String(url)).toBe('http://localhost:8000/api/v1/sessions/s1/questions/3/answer')
    const form = init?.body as FormData
    expect(form.get('consent')).toBe('true')
    expect(form.get('audio')).toBeInstanceOf(Blob)
    expect(form.has('seconds_used')).toBe(false) // the server measures time itself
  })
})
