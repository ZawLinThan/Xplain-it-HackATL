import { useCallback, useEffect, useState } from 'react'
import { ApiError, getProfessorSession, getProfessorSessions } from '../api/client'
import type { ProfessorQuestion, ProfessorSession, ProfessorSessions } from '../api/types'
import { reasonsFor } from './professorFlags'

const TOKEN_KEY = 'explainit.professorToken'
const WINDOW_SECONDS = 40

function readToken(): string {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}
function writeToken(token: string) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // storage can be blocked; the token then lives only in memory
  }
}

const errorText = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.'

function TokenForm({ message, onToken }: { message: string; onToken: (token: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <main className="screen">
      <header>
        <p className="eyebrow">Explain-It · instructor</p>
        <h1>Instructor view</h1>
      </header>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault()
          if (value.trim()) onToken(value.trim())
        }}
      >
        <label htmlFor="token" className="label">Instructor token</label>
        <input id="token" type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
        {message && <p role="alert" className="error">{message}</p>}
        <p>
          <button type="submit" className="primary" disabled={!value.trim()}>Open</button>
        </p>
      </form>
    </main>
  )
}

function Timeline({ q, limit }: { q: ProfessorQuestion; limit: number }) {
  const look = q.lookaway
  if (!look.tracked) {
    return <p className="muted">Look-away: not tracked for this answer (no camera, or the detector was off).</p>
  }
  return (
    <div>
      <p>
        <strong>Looked away {look.count} {look.count === 1 ? 'time' : 'times'} (limit {limit})</strong>
        {look.flagged ? ' · Review' : ''}
      </p>
      <div className="timeline" role="img" aria-label={`Look-away timeline over ${WINDOW_SECONDS} seconds`}>
        {look.events.map((ev, i) => (
          <span
            key={i}
            className="tick"
            title={`${(ev.t_ms / 1000).toFixed(1)} s, ${ev.side}`}
            style={{ left: `${Math.min(100, (ev.t_ms / (WINDOW_SECONDS * 1000)) * 100)}%` }}
          />
        ))}
      </div>
      {look.events.length > 0 && (
        <ul className="muted">
          {look.events.map((ev, i) => (
            <li key={i}>
              {(ev.t_ms / 1000).toFixed(1)} s: {ev.side === 'lost' ? 'face not found' : `looked ${ev.side}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Detail({ token, id, onBack, onAuth }: { token: string; id: string; onBack: () => void; onAuth: (m: string) => void }) {
  const [data, setData] = useState<ProfessorSession | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let alive = true
    getProfessorSession(token, id)
      .then((d) => alive && setData(d))
      .catch((e: unknown) => {
        if (!alive) return
        if (e instanceof ApiError && e.status === 401) onAuth(e.message)
        else setError(errorText(e))
      })
    return () => {
      alive = false
    }
  }, [token, id, onAuth])

  const pct = (v: number | null) => (v === null ? 'not graded yet' : `${Math.round(v * 100)}%`)
  return (
    <main className="screen">
      <button type="button" className="link" onClick={onBack}>← All sessions</button>
      {error && <p role="alert" className="error">{error}</p>}
      {!data && !error && <p className="muted" role="status">Loading…</p>}
      {data && (
        <>
          <header>
            <p className="eyebrow">Explain-It · instructor</p>
            <h1>{data.title}</h1>
            <p className="muted">{new Date(data.created_at * 1000).toLocaleString()}</p>
          </header>
          <section className="card">
            <dl className="parts">
              <div><dt>Final score</dt><dd>{data.final_score ?? 'not graded yet'}</dd></div>
              <div><dt>Code score (P)</dt><dd>{pct(data.problem_score)}</dd></div>
              <div><dt>Explanation score (E)</dt><dd>{pct(data.explanation_score)}</dd></div>
            </dl>
            {data.review_flag && (
              <p role="note">
                <strong>Review: answers are weaker than the code score</strong> (gap over{' '}
                {Math.round(data.review_threshold * 100)} points).
              </p>
            )}
            {data.lookaway_flagged && (
              <p role="note">
                <strong>Review: looked away {data.lookaway_threshold} or more times in an answer.</strong>
              </p>
            )}
            <p className="muted">
              A flag is a reason to talk to the student, not proof of anything. Glances at notes, a
              second monitor, a camera angle or a disability can all cause one.
            </p>
          </section>
          {data.questions.map((q) => (
            <article key={q.n} className="card" aria-labelledby={`pq${q.n}`}>
              <h2 id={`pq${q.n}`} className="h3">{q.n}. {q.text}</h2>
              {q.answered ? (
                <>
                  <p className="label">Transcript</p>
                  {q.transcript ? <blockquote>{q.transcript}</blockquote> : <p className="muted">No speech was detected.</p>}
                  <p>
                    Score: {q.score === null ? 'not graded yet' : `${q.score} / 5`}
                    {q.late ? ' · answered late' : ''} · {q.seconds_used} s
                  </p>
                  <Timeline q={q} limit={data.lookaway_threshold} />
                </>
              ) : (
                <p className="muted">Not answered yet.</p>
              )}
            </article>
          ))}
        </>
      )}
    </main>
  )
}

export default function ProfessorScreen() {
  const [token, setToken] = useState(readToken)
  const [message, setMessage] = useState('')
  const [list, setList] = useState<ProfessorSessions | null>(null)
  const [error, setError] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)

  const reject = useCallback((m: string) => {
    writeToken('')
    setToken('')
    setList(null)
    setOpenId(null)
    setMessage(m)
  }, [])

  useEffect(() => {
    if (!token) return
    let alive = true
    getProfessorSessions(token)
      .then((l) => alive && setList(l))
      .catch((e: unknown) => {
        if (!alive) return
        if (e instanceof ApiError && e.status === 401) reject(e.message)
        else setError(errorText(e))
      })
    return () => {
      alive = false
    }
  }, [token, reject])

  if (!token) {
    return (
      <TokenForm
        message={message}
        onToken={(t) => {
          writeToken(t)
          setMessage('')
          setError('')
          setToken(t)
        }}
      />
    )
  }
  if (openId) return <Detail token={token} id={openId} onBack={() => setOpenId(null)} onAuth={reject} />

  return (
    <main className="screen wide">
      <header>
        <p className="eyebrow">Explain-It · instructor</p>
        <h1>Recent sessions</h1>
      </header>
      {error && <p role="alert" className="error">{error}</p>}
      {!list && !error && <p className="muted" role="status">Loading…</p>}
      {list && list.sessions.length === 0 && <p className="muted">No sessions yet.</p>}
      {list && list.sessions.length > 0 && (
        <table className="sessions">
          <caption className="sr-only">Recent sessions and their flags</caption>
          <thead>
            <tr>
              <th scope="col">Started</th>
              <th scope="col">Answered</th>
              <th scope="col">Final score</th>
              <th scope="col">Flag</th>
              <th scope="col"><span className="sr-only">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {list.sessions.map((row) => {
              const reasons = reasonsFor(row, list.lookaway_threshold)
              return (
                <tr key={row.session_id}>
                  <td>{new Date(row.created_at * 1000).toLocaleString()}</td>
                  <td>{row.answered} of 3</td>
                  <td>{row.final_score ?? '–'}</td>
                  <td>
                    {reasons.length > 0 && (
                      <>
                        <strong>Review</strong>: {reasons.join('; ')}
                      </>
                    )}
                    {reasons.length === 0 && !row.lookaway_tracked_all && row.answered > 0 && (
                      <span className="muted">Not tracked</span>
                    )}
                    {reasons.length > 0 && !row.lookaway_tracked_all && <span className="muted"> · some answers not tracked</span>}
                  </td>
                  <td>
                    <button type="button" onClick={() => setOpenId(row.session_id)}>Open</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <p className="muted">
        A flag is a reason to talk to the student, not proof of anything.{' '}
        <button type="button" className="link" onClick={() => reject('')}>Sign out</button>
      </p>
    </main>
  )
}
