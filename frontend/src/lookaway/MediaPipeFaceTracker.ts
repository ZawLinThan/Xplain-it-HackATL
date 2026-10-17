import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { estimateRawGaze } from './gaze'
import { GazeFilter } from './filter'
import { BlinkGate } from './blink'
import { applyCalibration, hasCalibration } from './calibration'
import type { FaceTracker } from './FaceTracker'
import type { GazeSample } from './types'

const BASE = `${import.meta.env.BASE_URL}mediapipe`
const FRAME_MS = 66 // about 15 frames a second

let landmarker: Promise<FaceLandmarker> | null = null

/** Load the model once (the wasm files and model are served locally; see `npm run setup-gaze`). */
export function loadLandmarker(): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`)
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: `${BASE}/face_landmarker.task` },
      runningMode: 'VIDEO',
      numFaces: 1,
    })
  })().catch((error: unknown) => {
    landmarker = null // allow a later retry
    throw error
  })
  return landmarker
}

/** Reads the camera video in the browser. No frame ever leaves the device. */
export class MediaPipeFaceTracker implements FaceTracker {
  get calibrated(): boolean { return hasCalibration() }

  private timer: number | null = null
  private generation = 0

  async start(video: HTMLVideoElement, onSample: (sample: GazeSample | null) => void): Promise<void> {
    this.stop()
    const generation = this.generation
    const model = await loadLandmarker()
    if (generation !== this.generation) return
    let lastVideoTime = -1
    const filter = new GazeFilter()
    const blink = new BlinkGate()
    let lastReliable = performance.now()
    this.timer = window.setInterval(() => {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime
      const result = model.detectForVideo(video, performance.now())
      const face = result.faceLandmarks[0]
      const now = performance.now()
      if (face && !blink.accepts(face, now)) {
        // Brief blinks freeze the dot; longer unreliable periods must not keep stale gaze alive.
        if (now - lastReliable > 400) onSample(filter.push(null, now))
        return
      }
      lastReliable = now
      const raw = face ? estimateRawGaze(face) : null
      onSample(filter.push(raw ? applyCalibration(raw) : null, performance.now()))
    }, FRAME_MS)
  }

  stop(): void {
    this.generation++
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }
}
