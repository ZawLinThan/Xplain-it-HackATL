import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, getQuestion, submitAnswer, questionReadAloud } from '../api/client'
import type { AnswerResult, QuestionPublic } from '../api/types'
import AutoAdvance from '../components/AutoAdvance'
import { StageBackdrop } from '../components/Presentation'
import Badge from '../components/Badge'
import GazeDebugOverlay from '../components/GazeDebugOverlay'
import { useAppConfig } from '../demoMode'
import { LookAwayMonitor, createTracker, type LookawayPayload } from '../lookaway'
import { useVoiceVerification } from '../voice/useVoiceVerification'
import { createLevelChannel } from '../visuals/audioLevel'
import { questionId, roundQuestions } from '../visuals/neural/questionVisuals'
import type { NeuralPhase } from '../visuals/neural/sceneTypes'
import Recorder from '../Recorder'
import { AUTO_ADVANCE_MS } from '../timing'
import { useQuestionSpeech } from '../useQuestionSpeech'
import { useWordReveal } from '../useWordReveal'

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
  const voice = useVoiceVerification(sessionId, index)
  const [levels] = useState(createLevelChannel)
  const [question, setQuestion] = useState<QuestionPublic | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [recording, setRecording] = useState(false)
  const blobRef = useRef<Blob | null>(null)
  const lookRef = useRef<LookawayPayload | undefined>(undefined)
  const config = useAppConfig()
  const [monitor] = useState(() => new LookAwayMonitor(createTracker(config.gaze_tracking)))
  const speech = useQuestionSpeech(question?.text ?? null, () => {
    void questionReadAloud(sessionId, index).catch(() => {
      console.warn('Could not notify the backend that question playback finished.')
    })
  })
  const reveal = useWordReveal(question?.text ?? null)

  useEffect(() => () => monitor.dispose(), [monitor])

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
      submitAnswer(sessionId, index, blob, lookRef.current)
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
      monitor.halt()
      blobRef.current = blob
      lookRef.current = monitor.payload() // counts and times only
      upload(blob)
    },
    [monitor, upload],
  )

  const last = index >= total
  const answering = phase.kind === 'answering' && question !== null
  const listening = answering && recording
  // Listening follows the recorder's real state, never read-aloud completion alone.
  const visualPhase: NeuralPhase =
    phase.kind === 'loading' ? 'preparing'
      : phase.kind === 'load-failed' || phase.kind === 'upload-failed' ? 'error'
        : phase.kind === 'uploading' ? 'processing'
          : phase.kind === 'done' ? 'review'
            : listening ? 'listening' : 'ready'
  const hubs = useMemo(() => roundQuestions(sessionId, total, index, phase.kind === 'done'), [sessionId, total, index, phase.kind])

  return (
    <main className="assessment-stage active-round">
      <StageBackdrop levelSource={levels.subscribe} phase={visualPhase} seed={sessionId} questions={hubs} activeQuestionId={questionId(sessionId, index)} />
      <div className="round-content">
      <header>
        <p className="eyebrow">
          Question {index} of {total}
        </p>
        {/* Progress only: these markers never show correctness during the round. */}
        <ol className="hub-progress" role="img" aria-label={`Question ${index} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <li key={i} className={i + 1 === index ? 'active' : i + 1 < index ? 'done' : undefined}>{i + 1}</li>
          ))}
        </ol>
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
          <h1 id="question-text" className="h2">
            {/* Screen readers get the whole question at once; the words below appear one by one. */}
            <span className="sr-only">{question.text}</span>
            <span aria-hidden="true">
              {reveal.words.map((word, i) => (
                <span key={i} className={i < reveal.shown ? 'word on' : 'word'}>
                  {word}{' '}
                </span>
              ))}
            </span>
          </h1>
          <p className="muted">
            You have {question.max_seconds} seconds. Answer in plain words; you do not need to read
            code aloud. <Badge feature="spokenAnswers" withLabel />
          </p>
        </section>
      )}

      {answering && !speech.done && (
        <div>
          <p role="status">{speech.error || 'Reading the question aloud… Recording will begin afterward.'}</p>
          {speech.error && <button type="button" onClick={speech.retry}>Read question aloud</button>}
          <button type="button" onClick={speech.skip}>Continue without speech</button>
        </div>
      )}
      {answering && !speech.supported && <p className="muted">Read-aloud is unavailable in this browser. Read the question on screen.</p>}

      {answering && (
        <Recorder
          maxSeconds={question.max_seconds}
          onComplete={handleComplete}
          autoStart
          hold={!reveal.done || !speech.done}
          onStarted={() => monitor.beginCounting()}
          onLevel={levels.publish}
          onRecordingStream={voice.begin}
          onVideoReady={(video) => void monitor.attach(video)}
          onRecordingChange={setRecording}
        />
      )}
      {listening && <p className="neural-state-label">Listening to your explanation…</p>}
      <aside className={`live-reminders${voice.flagged ? ' has-warning' : ''}`} aria-label="Voice verification">
        {voice.flagged && <p className="live-reminder" role="alert">Your voice appears to have changed and has been flagged for your instructor. (Testing notice.)</p>}
        <p className="live-check-status">{voice.status} This comparison does not change your score.</p>
      </aside>
      {config.debug_borders && <GazeDebugOverlay monitor={monitor} />}

      {phase.kind === 'uploading' && (
        <p className="muted" role="status" aria-busy="true">Processing your answer…</p>
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
          <AutoAdvance
            ms={AUTO_ADVANCE_MS}
            nextLabel={last ? 'See my report' : 'Next question'}
            whatLabel={last ? 'Your report' : 'Next question'}
            onNext={onNext}
          />
        </section>
      )}
      </div>
    </main>
  )
}
