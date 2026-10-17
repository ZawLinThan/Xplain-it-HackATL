export function pcm16(samples: Float32Array, rate: number): Uint8Array {
  const length = Math.floor(samples.length * 16000 / rate)
  const result = new Uint8Array(length * 2)
  const view = new DataView(result.buffer)
  for (let i = 0; i < length; i++) {
    const position = i * rate / 16000
    const a = Math.floor(position), fraction = position - a
    const value = samples[a] * (1 - fraction) + (samples[Math.min(a + 1, samples.length - 1)] ?? 0) * fraction
    view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, value)) * 32767), true)
  }
  return result
}

export function joinPcm(chunks: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0))
  let offset = 0
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length }
  return result
}

/** Use the already-authorized microphone stream; never request or record the camera here. */
export async function capturePcm(stream: MediaStream, onChunk: (pcm: Uint8Array) => void): Promise<() => void> {
  const context = new AudioContext()
  let source: MediaStreamAudioSourceNode | undefined
  let node: AudioWorkletNode | undefined
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    if (node) node.port.onmessage = null
    source?.disconnect(); node?.disconnect()
    void context.close().catch(() => undefined)
  }
  try {
    await context.audioWorklet.addModule(new URL('./capture.worklet.js', import.meta.url))
    await context.resume()
    node = new AudioWorkletNode(context, 'voice-pcm-capture')
    source = context.createMediaStreamSource(stream)
    node.port.onmessage = (event: MessageEvent<{ samples: Float32Array; rate: number }>) => {
      if (!stopped) onChunk(pcm16(event.data.samples, event.data.rate))
    }
    source.connect(node)
    node.connect(context.destination) // Worklet emits silence; its input is only sent to the callback.
    return stop
  } catch (error) { stop(); throw error }
}
