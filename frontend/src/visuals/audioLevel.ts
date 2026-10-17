export type LevelSource = (listener: (level: number) => void) => () => void

/** Small channel that updates the visual directly without rerendering the question every frame. */
export function createLevelChannel() {
  let value = 0
  const listeners = new Set<(level: number) => void>()
  return {
    publish(level: number) {
      value = Math.max(0, Math.min(1, level))
      listeners.forEach((listener) => listener(value))
    },
    subscribe: ((listener) => {
      listeners.add(listener)
      listener(value)
      return () => { listeners.delete(listener) }
    }) as LevelSource,
  }
}

/** Analyse the existing microphone stream locally; never route microphone audio to speakers. */
export function startAudioLevel(stream: MediaStream, onLevel: (level: number) => void): () => void {
  let context: AudioContext | undefined
  let source: MediaStreamAudioSourceNode | undefined
  let analyser: AnalyserNode | undefined
  let timer: number | undefined
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    window.clearInterval(timer)
    source?.disconnect()
    analyser?.disconnect()
    if (context && context.state !== 'closed') void context.close().catch(() => undefined)
    onLevel(0)
  }
  try {
    if (typeof AudioContext !== 'function') return () => onLevel(0)
    context = new AudioContext()
    analyser = context.createAnalyser()
    analyser.fftSize = 512
    source = context.createMediaStreamSource(stream)
    source.connect(analyser)
    if (context.state === 'suspended') void context.resume().catch(stop)
    const samples = new Float32Array(analyser.fftSize)
    let smoothed = 0
    timer = window.setInterval(() => {
      if (stopped || !analyser) return
      try {
        analyser.getFloatTimeDomainData(samples)
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)
        const target = Math.min(1, Math.max(0, rms - 0.008) * 9)
        smoothed += (target - smoothed) * (target > smoothed ? 0.55 : 0.22)
        onLevel(smoothed < 0.002 ? 0 : smoothed)
      } catch { stop() }
    }, 50)
  } catch { stop() } // An unavailable visual analyser must never interrupt recording.
  return stop
}
