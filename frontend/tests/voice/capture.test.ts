import { expect, it } from 'vitest'
import { joinPcm, pcm16 } from '../../src/voice/capture'

it('resamples one second of microphone audio to little-endian 16 kHz PCM16', () => {
  const pcm = pcm16(new Float32Array(48000).fill(0.5), 48000)
  expect(pcm.byteLength).toBe(32000)
  expect(new DataView(pcm.buffer).getInt16(0, true)).toBe(16384)
})
it('joins chunks exactly without changing the originals', () => {
  const first = new Uint8Array([1, 2]), second = new Uint8Array([3, 4])
  expect([...joinPcm([first, second])]).toEqual([1, 2, 3, 4])
  expect([...first]).toEqual([1, 2])
})
