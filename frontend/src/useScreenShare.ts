import { useCallback, useEffect, useRef, useState } from 'react'
import { stopStream } from './api/media'

/** Keep a locally held display stream alive for the assessment; never record or upload it. */
export function useScreenShare(enabled: boolean) {
  const streamRef = useRef<MediaStream | null>(null)
  const pending = useRef(false)
  const mounted = useRef(false)
  const [active, setActive] = useState(false)
  const [error, setError] = useState('')
  const [requesting, setRequesting] = useState(false)
  const stop = useCallback(() => {
    stopStream(streamRef.current)
    streamRef.current = null
    setActive(false)
  }, [])

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; stopStream(streamRef.current); streamRef.current = null }
  }, [])
  useEffect(() => {
    // Release the browser capture when the report opens, and reflect that external resource state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!enabled) stop()
  }, [enabled, stop])

  async function request() {
    if (pending.current) return
    pending.current = true
    setRequesting(true)
    setError('')
    let stream: MediaStream | null = null
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error('Screen sharing is unavailable. Use a desktop browser that supports sharing your entire screen.')
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor' }, audio: false })
      if (!mounted.current) { stopStream(stream); return }
      const track = stream.getVideoTracks()[0]
      if (!track || track.getSettings().displaySurface !== 'monitor') {
        throw new Error('Choose Entire Screen in the sharing dialog, rather than a window or browser tab.')
      }
      stopStream(streamRef.current)
      streamRef.current = stream
      track.addEventListener('ended', () => {
        if (streamRef.current !== stream) return
        stop()
        setError('Screen sharing stopped. Share your entire screen to continue.')
      }, { once: true })
      setActive(true)
    } catch (e) {
      stopStream(stream)
      if (mounted.current) setError(e instanceof Error && e.name !== 'NotAllowedError' ? e.message : 'Screen sharing was cancelled or blocked. Share your entire screen to continue.')
    } finally {
      pending.current = false
      if (mounted.current) setRequesting(false)
    }
  }
  return { active, error, requesting, request, stop }
}
