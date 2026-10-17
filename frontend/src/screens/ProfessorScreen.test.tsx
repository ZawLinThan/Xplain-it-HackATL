import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getProfessorSession, getProfessorSessions } from '../api/client'
import detailMocks from '../api/mocks/professor_sessions_detail.json'
import listMock from '../api/mocks/professor_sessions.json'
import type { ProfessorSession, ProfessorSessions } from '../api/types'
import ProfessorScreen from './ProfessorScreen'

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>()
  return { ...actual, getProfessorSessions: vi.fn(), getProfessorSession: vi.fn() }
})

const details = detailMocks as Record<string, ProfessorSession>

beforeEach(() => {
  sessionStorage.clear()
  vi.mocked(getProfessorSessions).mockReset().mockResolvedValue(structuredClone(listMock) as ProfessorSessions)
  vi.mocked(getProfessorSession)
    .mockReset()
    .mockImplementation((_t, id) => Promise.resolve(structuredClone(details[id])))
})

async function signIn(token = 'secret') {
  render(<ProfessorScreen />)
  fireEvent.change(screen.getByLabelText('Instructor token'), { target: { value: token } })
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
  await screen.findByRole('table')
}
const rowOf = (text: RegExp) => screen.getAllByRole('row').find((r) => text.test(r.textContent ?? ''))!

describe('ProfessorScreen', () => {
  it('asks for the token first and sends it to the API', async () => {
    await signIn('secret')
    expect(getProfessorSessions).toHaveBeenCalledWith('secret')
  })

  it('a 401 goes back to the token prompt with the message', async () => {
    vi.mocked(getProfessorSessions).mockRejectedValue(new ApiError(401, 'unauthorized', 'That token is not accepted.'))
    render(<ProfessorScreen />)
    fireEvent.change(screen.getByLabelText('Instructor token'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('That token is not accepted.')
    expect(screen.getByLabelText('Instructor token')).toBeInTheDocument()
    expect(sessionStorage.getItem('explainit.professorToken')).toBeNull()
  })

  it('a flagged row says Review with the reason in words', async () => {
    await signIn()
    const row = rowOf(/81\.3/)
    expect(row).toHaveTextContent('Review')
    expect(row).toHaveTextContent('Looked away 5 times in question 2 (limit 4)')
  })

  it('a clean row shows no flag', async () => {
    await signIn()
    const row = rowOf(/73\.3/)
    expect(row).not.toHaveTextContent(/review/i)
    expect(row).not.toHaveTextContent(/looked away/i)
  })

  it('shows the weaker-than-code reason and marks missing camera data as not tracked, not zero', async () => {
    await signIn()
    const row = rowOf(/49\.3/)
    expect(row).toHaveTextContent('Answers weaker than the code score')
    expect(row).not.toHaveTextContent(/looked away 0/i)
    expect(row).toHaveTextContent(/not tracked/i)
  })

  it('detail shows transcripts, a tick per look-away and the caution sentence', async () => {
    await signIn()
    fireEvent.click(within(rowOf(/81\.3/)).getByRole('button', { name: 'Open' }))
    expect(await screen.findByText('Looked away 5 times (limit 4)', { exact: false })).toBeInTheDocument()
    const second = screen.getAllByRole('article')[1]
    expect(second.querySelectorAll('.timeline .tick')).toHaveLength(5)
    expect(screen.getAllByRole('article')[0].querySelectorAll('.timeline .tick')).toHaveLength(0)
    expect(screen.getByText(/seen holds 3, 1 and 2/i)).toBeInTheDocument()
    expect(screen.getByText(/a reason to talk to the student, not proof of anything/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /all sessions/i }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('detail says not tracked instead of zero when the camera data is missing', async () => {
    await signIn()
    fireEvent.click(within(rowOf(/49\.3/)).getByRole('button', { name: 'Open' }))
    await screen.findByText(/Answers weaker than the code score|weaker than the code score/i)
    expect(screen.getAllByText(/not tracked for this answer/i).length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/looked away 0 times/i)
  })

  it('every row can be opened with the keyboard (real buttons)', async () => {
    await signIn()
    for (const b of screen.getAllByRole('button', { name: 'Open' })) expect(b.tagName).toBe('BUTTON')
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(4))
  })
})
