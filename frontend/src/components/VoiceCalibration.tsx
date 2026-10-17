import { useEffect, useRef, useState } from 'react'
import { enrollVoice, voiceStatus } from '../api/client'
import { capturePcm, joinPcm } from '../voice/capture'
import { setVoiceEnrollment } from '../voice/profile'

export default function VoiceCalibration({ stream, onReadiness }: { stream: () => MediaStream | null; onReadiness: (ready: boolean, available: boolean) => void }) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [consent, setConsent] = useState(false)
  const [state, setState] = useState<'idle' | 'recording' | 'saving' | 'ready' | 'error'>('idle')
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState('')
  const cancel = useRef<(() => void) | null>(null)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    voiceStatus().then((result) => { if (alive.current) { setAvailable(result.available); onReadiness(false, result.available) } }).catch(() => { if (alive.current) { setAvailable(false); onReadiness(false, false) } })
    return () => { alive.current = false; cancel.current?.() }
  }, [onReadiness])
  async function begin() {
    const media = stream()
    if (!media || !consent) return
    setVoiceEnrollment(null)
    onReadiness(false, true)
    setState('recording'); setSeconds(0); setError('')
    let cancelled = false
    let stop: (() => void) | undefined
    const chunks: Uint8Array[] = []
    cancel.current = () => { cancelled = true; stop?.() }
    try {
      stop = await capturePcm(media, (pcm) => {
        if (cancelled || !alive.current) return
        chunks.push(pcm); setSeconds(chunks.length)
        if (chunks.length === 15) {
          stop?.(); setState('saving')
          void enrollVoice(joinPcm(chunks)).then((result) => {
            if (!cancelled && alive.current) { setVoiceEnrollment(result.enrollment_id); setState('ready'); onReadiness(true, true) }
          }).catch((failure: unknown) => {
            if (!cancelled && alive.current) { setError(failure instanceof Error ? failure.message : 'Voice enrollment failed'); setState('error') }
          })
        }
      })
      if (cancelled) stop()
    } catch (failure) {
      if (alive.current && !cancelled) { setState('error'); setError(failure instanceof Error ? failure.message : 'Voice enrollment failed') }
    }
  }
  return <section className="card" aria-labelledby="voice-calibration-title">
    <h2 id="voice-calibration-title">Calibrate your voice</h2>
    <p>Read aloud for 15 seconds: “Today I will explain my own work. I will describe the choices I made, how the code runs, and what I would change to improve it.” Repeat naturally until recording ends.</p>
    <label className="check"><input type="checkbox" checked={consent} disabled={state === 'recording' || state === 'saving'} onChange={(e) => { setConsent(e.target.checked); if (!e.target.checked) { setVoiceEnrollment(null); setState('idle'); onReadiness(false, Boolean(available)) } }} />
      <span>Allow session-only biometric voice comparison. Calibration audio and short live audio chunks go to this app’s backend. Audio is processed in memory; the voice reference is deleted on assessment completion or expiry. This check can be wrong and does not prove identity or affect my score.</span></label>
    {available === false && <p className="muted">Speaker verification is unavailable. The backend voice worker must be installed and warmed up. The assessment can continue without this check.</p>}
    <button type="button" disabled={!available || !consent || state === 'recording' || state === 'saving'} onClick={() => void begin()}>{state === 'recording' ? `Recording ${seconds}/15 seconds…` : state === 'saving' ? 'Building voice reference…' : state === 'ready' ? 'Recalibrate voice' : 'Record voice calibration'}</button>
    {state === 'ready' && <p role="status" className="ok">Voice calibrated for this assessment.</p>}
    {state === 'recording' && <button type="button" onClick={() => { cancel.current?.(); setState('idle') }}>Cancel voice calibration</button>}
    {error && <p role="alert" className="error">{error}</p>}
  </section>
}
