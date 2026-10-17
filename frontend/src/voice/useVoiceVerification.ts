import { useCallback, useRef, useState } from 'react'
import { checkVoice } from '../api/client'
import { capturePcm, joinPcm } from './capture'

export function useVoiceVerification(sessionId: string, question: number) {
  const [status, setStatus] = useState('Voice verification is waiting for recording.')
  const [flagged, setFlagged] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const begin = useCallback((stream: MediaStream) => {
    stopRef.current?.()
    let stopped = false
    let stop: (() => void) | undefined
    let request: AbortController | undefined
    let busy = false
    let sequence = 0
    const chunks: Uint8Array[] = []
    setStatus('Listening for enough clear speech to compare your voice.')
    setFlagged(false)
    const cleanup = () => { stopped = true; stop?.(); request?.abort() }
    stopRef.current = cleanup
    void capturePcm(stream, (pcm) => {
      if (stopped) return
      chunks.push(pcm)
      if (chunks.length > 3) chunks.shift()
      if (chunks.length < 3 || busy) return
      busy = true
      request = new AbortController()
      const timeout = window.setTimeout(() => request?.abort(), 10000)
      void checkVoice(sessionId, question, sequence++, joinPcm(chunks), request.signal).then((result) => {
        if (stopped) return
        setStatus(result.status === 'match' ? 'Voice is consistent with your calibration.' : result.status === 'mismatch' ? 'Checking a possible voice change…' : result.status === 'unavailable' ? 'Voice verification is unavailable. Calibrate before starting an assessment.' : 'Unable to compare this segment: more clear speech is needed.')
        if (result.flagged) setFlagged(true)
      }).catch(() => { if (!stopped) setStatus('Voice verification is temporarily unavailable. This is not a mismatch flag.') })
        .finally(() => { window.clearTimeout(timeout); busy = false })
    }).then((value) => { stop = value; if (stopped) stop() })
      .catch(() => { if (!stopped) setStatus('Live voice capture is unavailable in this browser.') })
    return cleanup
  }, [sessionId, question])
  return { begin, status, flagged }
}
