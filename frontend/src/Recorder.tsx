import { useCallback, useEffect, useRef, useState } from 'react'
import { openMedia, pickMimeType, stopStream } from './api/media'

type RecorderState = 'requesting' | 'idle' | 'recording' | 'done' | 'error'

interface RecorderProps {
  /** Hard limit in seconds. The recording stops by itself when it is reached. */
  maxSeconds: number
  /** Called once with the audio and the seconds actually recorded. */
  onComplete: (blob: Blob, secondsUsed: number) => void
}

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/**
 * Camera preview plus a microphone recording with a countdown. The camera is only a live
 * preview (a presence check); just the audio track is recorded and uploaded.
 *
 * The countdown is computed from performance.now() on every tick rather than by counting
 * ticks, so a throttled background tab cannot make a recording last longer than maxSeconds.
 */
export default function Recorder({ maxSeconds, onComplete }: RecorderProps) {
  const [state, setState] = useState<RecorderState>('requesting')
  const [error, setError] = useState('')
  const [hasVideo, setHasVideo] = useState(false)
  const [remaining, setRemaining] = useState(maxSeconds)
  const [announcement, setAnnouncement] = useState('')

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const announcedRef = useRef({ ten: false, zero: false })
  const onCompleteRef = useRef(onComplete)

  useEffect(() => {
    onCompleteRef.current = onComplete
  })

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // Open the devices on mount and release every track on unmount.
  useEffect(() => {
    let cancelled = false
    openMedia()
      .then(({ stream, hasVideo: video }) => {
        if (cancelled) {
          stopStream(stream)
          return
        }
        streamRef.current = stream
        setHasVideo(video)
        setState('idle')
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Could not open the microphone.')
        setState('error')
      })
    return () => {
      cancelled = true
      clearTimer()
      const recorder = recorderRef.current
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null
        recorder.stop()
      }
      stopStream(streamRef.current)
      streamRef.current = null
    }
  }, [clearTimer])

  useEffect(() => {
    if (videoRef.current && streamRef.current && hasVideo) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [hasVideo, state])

  const stop = useCallback(() => {
    clearTimer()
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [clearTimer])

  const tick = useCallback(() => {
    const elapsed = (performance.now() - startedAtRef.current) / 1000
    const left = Math.max(0, maxSeconds - elapsed)
    setRemaining(left)
    if (left <= 10 && left > 0 && !announcedRef.current.ten) {
      announcedRef.current.ten = true
      setAnnouncement('10 seconds left')
    }
    if (left <= 0) {
      if (!announcedRef.current.zero) {
        announcedRef.current.zero = true
        setAnnouncement('Time is up. Your answer is being saved.')
      }
      stop()
    }
  }, [maxSeconds, stop])

  const start = useCallback(() => {
    const stream = streamRef.current
    if (!stream || recorderRef.current) return
    try {
      const mimeType = pickMimeType()
      const audioOnly = new MediaStream(stream.getAudioTracks())
      const recorder = new MediaRecorder(audioOnly, mimeType ? { mimeType } : undefined)
      chunksRef.current = []
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        clearTimer()
        const seconds = Math.min(maxSeconds, (performance.now() - startedAtRef.current) / 1000)
        const type = recorder.mimeType || mimeType || 'audio/webm'
        setState('done')
        setRemaining(Math.max(0, maxSeconds - seconds))
        onCompleteRef.current(new Blob(chunksRef.current, { type }), Math.round(seconds * 10) / 10)
      }
      announcedRef.current = { ten: false, zero: false }
      recorderRef.current = recorder
      recorder.start()
      startedAtRef.current = performance.now()
      setRemaining(maxSeconds)
      setAnnouncement('Recording started.')
      setState('recording')
      timerRef.current = window.setInterval(tick, 100)
    } catch {
      recorderRef.current = null
      setError('Recording could not start in this browser.')
      setState('error')
    }
  }, [clearTimer, maxSeconds, tick])

  const shown = Math.ceil(remaining)
  const progress = remaining / maxSeconds

  return (
    <section className="recorder" aria-label="Answer recorder">
      <div className="recorder-preview">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label="Your camera preview"
          hidden={!hasVideo}
        />
        {!hasVideo && state !== 'error' && (
          <p className="muted">
            {state === 'requesting' ? 'Opening your microphone…' : 'No camera found. Audio only.'}
          </p>
        )}
      </div>

      <div className="countdown" data-state={state}>
        <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
          <circle className="ring-track" cx="60" cy="60" r={RADIUS} />
          <circle
            className="ring-fill"
            cx="60"
            cy="60"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <span className="countdown-text">{shown} s left</span>
      </div>

      {state === 'idle' && (
        <button type="button" className="primary" onClick={start}>
          Start answering
        </button>
      )}
      {state === 'recording' && (
        <button type="button" className="primary" onClick={stop}>
          Stop and submit
        </button>
      )}
      {state === 'done' && <p className="muted">Recording saved.</p>}
      {state === 'error' && (
        <p role="alert" className="error">
          {error}
        </p>
      )}

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </section>
  )
}
