import { useEffect, useRef, useState } from 'react'
import { MediaDenied, openMedia, stopStream } from '../api/media'
import Badge from '../components/Badge'

interface StartScreenProps {
  /** Message from a failed attempt (backend down, expired session, ...). */
  error: string | null
  onStart: () => void
}

type Check = 'idle' | 'checking' | 'ok' | 'denied'

export default function StartScreen({ error, onStart }: StartScreenProps) {
  const [check, setCheck] = useState<Check>('idle')
  const [hasCamera, setHasCamera] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [consent, setConsent] = useState(false)
  const [typedInfo, setTypedInfo] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)

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

  const ready = check === 'ok' && consent

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
        <p>
          This demo uses one sample quiz that is already loaded: two small Python functions.{' '}
          <Badge feature="preloadedSample" withLabel />
        </p>
        <p>
          Its code score is preset rather than run live. <Badge feature="problemScore" withLabel />
        </p>
        <p>
          Uploading your own file comes later. <Badge feature="fileUpload" withLabel />
        </p>
      </section>

      <section className="card" aria-labelledby="privacy-title">
        <h2 id="privacy-title">What is recorded, and why</h2>
        <ul>
          <li>Your microphone records each answer. It is turned into text, then the audio is deleted.</li>
          <li>Your camera shows a live preview so you can see yourself. It is not analysed.</li>
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
        <button type="button" className="primary" disabled={!ready} onClick={onStart}>
          Start
        </button>
        {!ready && (
          <p className="muted">
            {check !== 'ok' ? 'Check your devices first.' : 'Tick the consent box to continue.'}
          </p>
        )}
      </div>
    </main>
  )
}
