import type { FaceLandmarker } from '@mediapipe/tasks-vision'
import { estimateGaze } from './gaze'
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
  private timer: number | null = null

  async start(video: HTMLVideoElement, onSample: (sample: GazeSample | null) => void): Promise<void> {
    const model = await loadLandmarker()
    let lastVideoTime = -1
    this.timer = window.setInterval(() => {
      if (video.readyState < 2 || video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime
      const result = model.detectForVideo(video, performance.now())
      const face = result.faceLandmarks[0]
      onSample(face ? estimateGaze(face) : null)
    }, FRAME_MS)
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
  }
}
