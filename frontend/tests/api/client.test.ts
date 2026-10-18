import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  createSession,
  getProfessorSession,
  getProfessorSessions,
  getQuestion,
  getReport,
  submitAnswer,
  uploadFiles,
} from '../../src/api/client'

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
    expect(String(spy.mock.calls[0][0])).toBe('/api/v1/sessions')
    expect(spy.mock.calls[0][1]?.method).toBe('POST')
  })

  it('gets a numbered question', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      respond(200, { index: 2, total: 3, text: 'Q', max_seconds: 40 }),
    )
    expect((await getQuestion('s 1', 2)).index).toBe(2)
    expect(String(spy.mock.calls[0][0])).toBe('/api/v1/sessions/s%201/questions/2')
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
    expect(String(url)).toBe('/api/v1/sessions/s1/questions/3/answer')
    const form = init?.body as FormData
    expect(form.get('consent')).toBe('true')
    expect(form.get('audio')).toBeInstanceOf(Blob)
    expect(form.has('seconds_used')).toBe(false) // the server measures time itself
  })

  it('uploads both files as multipart parts named for the API', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      respond(201, { upload_id: 'u1', files: [], text_used: true, note: 'ok' }),
    )
    const q = new File(['q'], 'q.txt')
    const a = new File(['a'], 'a.py')
    expect((await uploadFiles(q, [a])).upload_id).toBe('u1')
    expect(String(spy.mock.calls[0][0])).toBe('/api/v1/uploads')
    const form = spy.mock.calls[0][1]?.body as FormData
    expect((form.get('questions_file') as File).name).toBe('q.txt')
    expect((form.get('answers_file') as File).name).toBe('a.py')
  })

  it('starts a session from an upload with a small JSON body, and from the sample with none', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      respond(201, { session_id: 'abc', title: 'T', total_questions: 3, max_answer_seconds: 40, used_upload: true }),
    )
    await createSession('u1')
    expect(spy.mock.calls[0][1]?.body).toBe(JSON.stringify({ upload_id: 'u1' }))
    await createSession()
    expect(spy.mock.calls[1][1]?.body).toBeUndefined()
  })

  it('sends look-away counts as one JSON form field next to the audio', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      respond(201, { transcript: 'hi', seconds_used: 1, late: false }),
    )
    await submitAnswer('s1', 2, new Blob(['x']), { tracked: true, events: [{ t_ms: 3000, side: 'left' }] })
    const form = spy.mock.calls[0][1]?.body as FormData
    expect(JSON.parse(String(form.get('lookaway')))).toEqual({ tracked: true, events: [{ t_ms: 3000, side: 'left' }] })
    expect(form.get('audio')).toBeInstanceOf(Blob)
    await submitAnswer('s1', 3, new Blob(['x']))
    expect((spy.mock.calls[1][1]?.body as FormData).has('lookaway')).toBe(false)
  })

  it('sends the instructor token in a header, and maps a 401', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      respond(200, { sessions: [], lookaway_threshold: 4 }),
    )
    await getProfessorSessions('tok')
    expect(spy.mock.calls[0][1]?.headers).toEqual({ 'X-Professor-Token': 'tok' })
    expect(String(spy.mock.calls[0][0])).toBe('/api/v1/professor/sessions')
    spy.mockImplementation(() => respond(401, { error: { code: 'unauthorized', message: 'Nope.' } }))
    await expect(getProfessorSession('bad', 's1')).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
  })
})


it('sends the exact printed duration log and confirms successful acceptance', async () => {
  vi.spyOn(console, 'groupCollapsed').mockImplementation(() => undefined)
  vi.spyOn(console, 'groupEnd').mockImplementation(() => undefined)
  vi.spyOn(console, 'table').mockImplementation(() => undefined)
  const printed = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const confirmed = vi.spyOn(console, 'info').mockImplementation(() => undefined)
  const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(() => respond(201, { transcript: 'a', seconds_used: 4, late: false }))
  const payload = { tracked: true, events: [{ t_ms: 0, side: 'left' as const }], duration_log: [{ t_ms: 0, duration_ms: 2300, side: 'left' as const }] }
  await submitAnswer('s1', 3, new Blob(['audio']), payload)
  const form = fetch.mock.calls[0][1]?.body as FormData
  expect(form.get('lookaway')).toBe(JSON.stringify(payload))
  expect(printed).toHaveBeenCalledWith('lookaway form-field JSON:', form.get('lookaway'))
  expect(confirmed).toHaveBeenCalledWith(expect.stringContaining('server accepted the answer'))
})
