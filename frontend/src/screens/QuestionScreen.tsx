import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getQuestion, submitAnswer } from '../api/client'
import type { AnswerResult, QuestionPublic } from '../api/types'
import Badge from '../components/Badge'
import Recorder from '../Recorder'

interface QuestionScreenProps {
  sessionId: string
  /** 1-based number of the question to ask. Remount (key) this component per question. */
  index: number
  total: number
  onAnswered: (n: number, transcript: string) => void
  onNext: () => void
  onSessionLost: () => void
}

type Phase =
  | { kind: 'loading' }
  | { kind: 'load-failed'; message: string }
  | { kind: 'answering' }
  | { kind: 'uploading' }
  | { kind: 'upload-failed'; message: string }
  | { kind: 'done'; result: AnswerResult; note?: string }

const message = (e: unknown) =>
  e instanceof ApiError || e instanceof Error ? e.message : 'Something went wrong.'

export default function QuestionScreen({
  sessionId,
  index,
  total,
  onAnswered,
  onNext,
  onSessionLost,
}: QuestionScreenProps) {
  const [question, setQuestion] = useState<QuestionPublic | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const blobRef = useRef<Blob | null>(null)

  // Asking for the question starts the server's timer for it.
  useEffect(() => {
    let alive = true
    getQuestion(sessionId, index)
      .then((q) => {
        if (!alive) return
        setQuestion(q)
        setPhase({ kind: 'answering' })
      })
      .catch((e: unknown) => {
        if (!alive) return
        if (e instanceof ApiError && e.code === 'session_not_found') onSessionLost()
        else setPhase({ kind: 'load-failed', message: message(e) })
      })
    return () => {
      alive = false
    }
  }, [sessionId, index, attempt, onSessionLost])

  const upload = useCallback(
    (blob: Blob) => {
      setPhase({ kind: 'uploading' })
      submitAnswer(sessionId, index, blob)
        .then((result) => {
          blobRef.current = null
          onAnswered(index, result.transcript)
          setPhase({ kind: 'done', result })
        })
        .catch((e: unknown) => {
          if (e instanceof ApiError && e.code === 'already_answered') {
            // saved earlier (for example before a refresh): carry on
            onAnswered(index, '')
            setPhase({
              kind: 'done',
              result: { transcript: '', seconds_used: 0, late: false },
              note: 'This question already had a saved answer.',
            })
          } else if (e instanceof ApiError && e.code === 'session_not_found') {
            onSessionLost()
          } else {
            setPhase({ kind: 'upload-failed', message: message(e) })
          }
        })
    },
    [sessionId, index, onAnswered, onSessionLost],
  )

  const handleComplete = useCallback(
    (blob: Blob) => {
      blobRef.current = blob
      upload(blob)
    },
    [upload],
  )

  const last = index >= total
  const answering = phase.kind === 'answering' && question !== null

  return (
    <main className="screen">
      <header>
        <p className="eyebrow">
          Question {index} of {total}
        </p>
        <div className="dots" role="img" aria-label={`Question ${index} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={i < index ? 'dot on' : 'dot'} />
          ))}
        </div>
      </header>

      {phase.kind === 'loading' && <p className="muted" role="status">Loading your question…</p>}
      {phase.kind === 'load-failed' && (
        <div>
          <p role="alert" className="error">{phase.message}</p>
          <button type="button" onClick={() => { setPhase({ kind: 'loading' }); setAttempt((a) => a + 1) }}>
            Try again
          </button>
        </div>
      )}

      {question && (
        <section className="card question" aria-labelledby="question-text">
          <h1 id="question-text" className="h2">{question.text}</h1>
          <p className="muted">
            You have {question.max_seconds} seconds. Answer in plain words; you do not need to read
            code aloud. <Badge feature="spokenAnswers" withLabel />
          </p>
        </section>
      )}

      {answering && <Recorder maxSeconds={question.max_seconds} onComplete={handleComplete} />}

      {phase.kind === 'uploading' && (
        <p className="muted" role="status" aria-busy="true">Transcribing your answer…</p>
      )}

      {phase.kind === 'upload-failed' && (
        <div>
          <p role="alert" className="error">{phase.message}</p>
          <p className="muted">Your recording is still here. Sending it again does not restart the clock.</p>
          <button
            type="button"
            className="primary"
            onClick={() => blobRef.current && upload(blobRef.current)}
          >
            Send again
          </button>
        </div>
      )}

      {phase.kind === 'done' && (
        <section className="card" aria-labelledby="heard-title">
          <h2 id="heard-title" className="h3">What we heard <Badge feature="transcription" /></h2>
          {phase.result.transcript ? (
            <blockquote>{phase.result.transcript}</blockquote>
          ) : (
            <p className="muted">{phase.note ?? 'No speech was detected in this answer.'}</p>
          )}
          {phase.result.late && (
            <p className="muted" role="status">
              This answer came in after the time limit, so your instructor will see it marked late.
            </p>
          )}
          <button type="button" className="primary" onClick={onNext}>
            {last ? 'See my report' : 'Next question'}
          </button>
        </section>
      )}
    </main>
  )
}
