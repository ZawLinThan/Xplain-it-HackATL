/* global AudioWorkletProcessor, registerProcessor, sampleRate */
class VoicePcmCapture extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = new Float32Array(Math.round(sampleRate))
    this.offset = 0
  }
  process(inputs) {
    const channel = inputs[0]?.[0]
    if (channel) for (const sample of channel) {
      this.samples[this.offset++] = sample
      if (this.offset === this.samples.length) {
        this.port.postMessage({ samples: this.samples, rate: sampleRate }, [this.samples.buffer])
        this.samples = new Float32Array(Math.round(sampleRate))
        this.offset = 0
      }
    }
    return true // Outputs remain silent: microphone audio is never played through speakers.
  }
}
registerProcessor('voice-pcm-capture', VoicePcmCapture)
