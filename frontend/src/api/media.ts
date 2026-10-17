/** Camera and microphone access shared by the consent check and the recorder. */

export interface OpenedMedia {
  stream: MediaStream
  hasVideo: boolean
}

export class MediaDenied extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MediaDenied'
  }
}

function explain(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone access was blocked. Allow it in your browser\'s address bar, then try again.'
  }
  if (name === 'NotFoundError') {
    return 'No microphone was found. Plug one in or choose a different device, then try again.'
  }
  if (name === 'NotReadableError') {
    return 'Your microphone is in use by another app. Close it and try again.'
  }
  return 'Could not open the microphone.'
}

/** Ask for microphone and camera. The camera is a presence check, so audio alone still works. */
export async function openMedia(): Promise<OpenedMedia> {
  const devices = navigator.mediaDevices
  if (!devices?.getUserMedia) {
    throw new MediaDenied(
      'This browser cannot record. Use a current browser on https:// or http://localhost.',
    )
  }
  try {
    const stream = await devices.getUserMedia({ audio: true, video: true })
    return { stream, hasVideo: stream.getVideoTracks().length > 0 }
  } catch (first) {
    try {
      const stream = await devices.getUserMedia({ audio: true })
      return { stream, hasVideo: false }
    } catch {
      throw new MediaDenied(explain(first))
    }
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop())
}

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']

/** First recording format this browser supports, or undefined to let it choose. */
export function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type))
}
