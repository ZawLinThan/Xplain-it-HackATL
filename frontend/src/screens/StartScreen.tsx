import { useEffect, useRef, useState } from 'react'
import { ApiError, uploadFiles } from '../api/client'
import { MediaDenied, openMedia, stopStream } from '../api/media'
import Badge from '../components/Badge'
import FileDrop from '../components/FileDrop'
import FilesDrop from '../components/FilesDrop'
import { useAppConfig } from '../demoMode'
import { preloadTracker } from '../lookaway'

interface StartScreenProps {
  /** Message from a failed attempt (backend down, expired session, ...). */
  error: string | null
  /** uploadId is set when the student's own files were uploaded; otherwise the sample quiz is used. */
  onStart: (uploadId?: string) => void
}

type Check = 'idle' | 'checking' | 'ok' | 'denied'
type Upload =
  | { kind: 'none' }
  | { kind: 'uploading' }
  | { kind: 'ready'; uploadId: string; note: string }
  | { kind: 'failed'; message: string }

export default function StartScreen({ error, onStart }: StartScreenProps) {
  const [check, setCheck] = useState<Check>('idle')
  const [hasCamera, setHasCamera] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [consent, setConsent] = useState(false)
  const [typedInfo, setTypedInfo] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const config = useAppConfig()
  const [useSample, setUseSample] = useState(true)
  const [questionsFile, setQuestionsFile] = useState<File | null>(null)
  const [answersFiles, setAnswersFiles] = useState<File[]>([])
  const [fileErrors, setFileErrors] = useState<{ questions: string | null; answers: string | null }>({
    questions: null,
    answers: null,
  })
  const [upload, setUpload] = useState<Upload>({ kind: 'none' })

  // Warm up the look-away model while the student reads this screen.
  useEffect(() => preloadTracker(config.gaze_tracking), [config.gaze_tracking])

  // Upload as soon as both files are chosen, so a problem shows up before Start.
  useEffect(() => {
    if (useSample || !questionsFile || !answersFiles.length) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUpload({ kind: 'uploading' })
    uploadFiles(questionsFile, answersFiles)
      .then((r) => alive && setUpload({ kind: 'ready', uploadId: r.upload_id, note: r.note }))
      .catch((e: unknown) => {
        if (!alive) return
        setUpload({
          kind: 'failed',
          message: e instanceof ApiError || e instanceof Error ? e.message : 'The upload failed.',
        })
      })
    return () => {
      alive = false
    }
  }, [useSample, questionsFile, answersFiles])

  function choose(which: 'questions', file: File | null) {
    setFileErrors((e) => ({ ...e, [which]: null }))
    setUpload({ kind: 'none' })
    if (which === 'questions') setQuestionsFile(file)
  }
  function reject(which: 'questions' | 'answers', message: string) {
    setFileErrors((e) => ({ ...e, [which]: message }))
  }

  // Release the camera when this screen goes away.
  useEffect(() => () => stopStream(streamRef.current), [])

  useEffect(() => {
    if (check === 'ok' && hasCamera && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [check, hasCamera])

  async function runCheck() {
    setCheck('checking')
    setCheckError('')
    stopStream(streamRef.current)
    try {
      const { stream, hasVideo } = await openMedia()
      streamRef.current = stream
      setHasCamera(hasVideo)
      setCheck('ok')
    } catch (e) {
      setCheckError(e instanceof MediaDenied ? e.message : 'Could not open the microphone.')
      setCheck('denied')
    }
  }

  const filesReady = useSample || upload.kind === 'ready'
  const ready = check === 'ok' && consent && filesReady

  return (
    <main className="screen">
      <header>
        <p className="eyebrow">Explain-It</p>
        <h1>Show that you understand your own code</h1>
        <p className="lead">
          You will hear three short questions about the answers you gave in a coding quiz. Answer
          each one out loud, in your own words, in 40 seconds or less.
        </p>
      </header>

      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <section className="card" aria-labelledby="sample-title">
        <h2 id="sample-title">The assessment</h2>
        <label className="check">
          <input type="checkbox" checked={useSample} onChange={(e) => setUseSample(e.target.checked)} />
          <span>
            Use the sample quiz instead: two small Python functions, already loaded.{' '}
            <Badge feature="preloadedSample" withLabel />
          </span>
        </label>
        <p className="muted">
          Its code score is preset rather than run live. <Badge feature="problemScore" withLabel />
        </p>
        {!useSample && (
          <div className="uploads">
            <p>
              Upload your quiz questions and the answers you gave. Text files are read to write your
              questions. <Badge feature="fileUpload" withLabel />
            </p>
            <FileDrop
              label="Assessment questions"
              file={questionsFile}
              error={fileErrors.questions}
              onChange={(f) => choose('questions', f)}
              onReject={(m) => reject('questions', m)}
            />
            <FilesDrop
              label="Your answers"
              files={answersFiles}
              error={fileErrors.answers}
              onChange={(files) => { setAnswersFiles(files); setUpload({ kind: 'none' }); setFileErrors((e) => ({ ...e, answers: null })) }}
              onReject={(m) => reject('answers', m)}
            />
            {upload.kind === 'uploading' && <p className="muted" role="status">Uploading your files…</p>}
            {upload.kind === 'ready' && <p className="ok" role="status">{upload.note}</p>}
            {upload.kind === 'failed' && (
              <p role="alert" className="error">
                {upload.message}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="privacy-title">
        <h2 id="privacy-title">What is recorded, and why</h2>
        <ul>
          <li>Your microphone records each answer. It is turned into text, then the audio is deleted.</li>
          <li>
            Your camera shows a live preview so you can see yourself. While you answer, your browser
            estimates which way your head and eyes point and keeps a count of how often you look away
            from the screen. Nothing from the camera leaves your device except that count and its
            times. It never changes your score. Your instructor may look at it.{' '}
            <Badge feature="lookAway" />
          </li>
          <li>Your instructor sees your transcript and score. A low score is a reason to talk to you, not proof of anything.</li>
        </ul>
      </section>

      <section className="card" aria-labelledby="check-title">
        <h2 id="check-title">Check your camera and microphone</h2>
        {check === 'idle' && (
          <button type="button" onClick={runCheck}>
            Check devices
          </button>
        )}
        {check === 'checking' && <p className="muted">Waiting for your browser to ask permission…</p>}
        {check === 'ok' && (
          <div>
            <video
              ref={videoRef}
              className="check-preview"
              muted
              playsInline
              autoPlay
              hidden={!hasCamera}
              aria-label="Your camera preview"
            />
            <p className="ok">Microphone ready. {hasCamera ? 'Camera ready.' : 'No camera found, audio only.'}</p>
          </div>
        )}
        {check === 'denied' && (
          <div>
            <p role="alert" className="error">
              {checkError}
            </p>
            <button type="button" onClick={runCheck}>
              Try again
            </button>
            <p className="muted">
              If you cannot use a microphone, ask your instructor to approve typed answers.
            </p>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="consent-title">
        <h2 id="consent-title">Consent</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>I agree to my voice being recorded and transcribed as described above.</span>
        </label>
        <p>
          <button type="button" className="link" onClick={() => setTypedInfo((v) => !v)}>
            Request typed answers instead
          </button>{' '}
          <Badge feature="typedAnswers" />
        </p>
        {typedInfo && (
          <p className="muted" role="status">
            Typed answers need your instructor&apos;s approval and are not available in this demo.
            Voice answers are required for now.
          </p>
        )}
      </section>

      <div className="actions">
        <button type="button" className="primary" disabled={!ready} onClick={() => onStart(useSample || upload.kind !== 'ready' ? undefined : upload.uploadId)}>
          Start
        </button>
        {!ready && (
          <p className="muted">
            {check !== 'ok'
              ? 'Check your devices first.'
              : !consent
                ? 'Tick the consent box to continue.'
                : 'Add both files, or use the sample quiz.'}
          </p>
        )}
      </div>
    </main>
  )
}
