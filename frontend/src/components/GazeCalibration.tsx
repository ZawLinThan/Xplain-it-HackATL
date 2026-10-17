import { useEffect, useRef, useState } from 'react'
import { loadLandmarker } from '../lookaway/MediaPipeFaceTracker'
import { BlinkGate } from '../lookaway/blink'
import { estimateRawGaze } from '../lookaway/gaze'
import { applyCalibration, fitCalibration, setCalibration, type CalibrationPair } from '../lookaway/calibration'
import type { GazeSample } from '../lookaway/types'

const TARGETS = [
  { gx: 0.5, gy: 0.5 }, { gx: 0.15, gy: 0.5 }, { gx: 0.85, gy: 0.5 },
  { gx: 0.5, gy: 0.15 }, { gx: 0.5, gy: 0.85 }, { gx: 0.5, gy: 0.5 },
]
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]

export default function GazeCalibration({ video, onClose }: {
  video: HTMLVideoElement; onClose: (success: boolean) => void
}) {
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    let alive = true
    let timer: number | undefined
    setCalibration(null)
    loadLandmarker().then((model) => {
      if (!alive) return
      const blink = new BlinkGate()
      let index = 0
      let since = performance.now()
      let lastVideoTime = -1
      let samples: GazeSample[] = []
      const pairs: CalibrationPair[] = []
      timer = window.setInterval(() => {
        if (!alive) return
        const now = performance.now()
        if (now - since > 10000) {
          window.clearInterval(timer)
          setError('Not enough usable camera samples. Check lighting and keep your face visible, then try again.')
          return
        }
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return
        lastVideoTime = video.currentTime
        try {
          const face = model.detectForVideo(video, now).faceLandmarks[0]
          const raw = face && blink.accepts(face, now) ? estimateRawGaze(face) : null
          if (raw && now - since >= 900) samples.push(raw)
          if (now - since < 2100 || samples.length < 10) return
          const rawMedian = { gx: median(samples.map((s) => s.gx)), gy: median(samples.map((s) => s.gy)) }
          if (index === 5) {
            window.clearInterval(timer)
            const fit = fitCalibration(pairs)
            const check = fit ? applyCalibration(rawMedian, fit) : null
            if (!fit || !check || Math.hypot(check.gx - 0.5, check.gy - 0.5) > 0.15) {
              setError('Calibration could not reliably distinguish the targets. Keep your head still, look directly at each dot, and try again.')
              return
            }
            setCalibration(fit)
            onClose(true)
            return
          }
          pairs.push({ raw: rawMedian, target: TARGETS[index] })
          index++
          setStep(index)
          samples = []
          since = now
        } catch {
          window.clearInterval(timer)
          setError('Camera tracking could not run. Close this step and try again.')
        }
      }, 66)
    }).catch(() => { if (alive) setError('The camera model could not load. Close this step and try again.') })
    return () => { alive = false; window.clearInterval(timer) }
  }, [video, onClose])

  const target = TARGETS[step]
  return (
    <div role="dialog" aria-modal="true" aria-label="Calibrate look-away detector"
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(false); if (e.key === 'Tab') { e.preventDefault(); closeRef.current?.focus() } }}
      style={{ position: 'fixed', inset: 0, background: '#101827', color: 'white', zIndex: 10001 }}>
      <div style={{ position: 'absolute', top: 20, left: 24, right: 24 }}>
        <p role="status">{error || `Keep your head still and look directly at the dot. Target ${step + 1} of 6${step === 5 ? ' · checking center' : ''}.`}</p>
        <button ref={closeRef} type="button" onClick={() => onClose(false)}>Close calibration</button>
      </div>
      {!error && <div aria-hidden="true" style={{ position: 'absolute', left: `${target.gx * 100}%`, top: `${target.gy * 100}%`,
        width: 24, height: 24, margin: -12, borderRadius: '50%', background: '#fbbf24', border: '4px solid white' }} />}
    </div>
  )
}
