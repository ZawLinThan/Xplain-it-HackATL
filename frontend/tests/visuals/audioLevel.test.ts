import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLevelChannel, startAudioLevel } from '../../src/visuals/audioLevel'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('microphone-driven visual level', () => {
  it('follows voice amplitude, settles in silence, and releases audio resources', () => {
    vi.useFakeTimers()
    let amplitude = 0
    const analyser = { fftSize: 0, getFloatTimeDomainData: (samples: Float32Array) => samples.fill(amplitude), disconnect: vi.fn() }
    const source = { connect: vi.fn(), disconnect: vi.fn() }
    const createSource = vi.fn(() => source)
    const close = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('AudioContext', class {
      state = 'running'
      createAnalyser = () => analyser
      createMediaStreamSource = createSource
      close = close
    })
    const stream = {} as MediaStream
    const level = vi.fn()
    const stop = startAudioLevel(stream, level)
    expect(createSource).toHaveBeenCalledWith(stream)
    expect(source.connect).toHaveBeenCalledWith(analyser)
    vi.advanceTimersByTime(100)
    expect(level).toHaveBeenLastCalledWith(0)
    amplitude = 0.12
    vi.advanceTimersByTime(300)
    expect(level.mock.lastCall?.[0]).toBeGreaterThan(0.95)
    amplitude = 0
    vi.advanceTimersByTime(2000)
    expect(level).toHaveBeenLastCalledWith(0)
    stop()
    stop()
    expect(source.disconnect).toHaveBeenCalledOnce()
    expect(analyser.disconnect).toHaveBeenCalledOnce()
    expect(close).toHaveBeenCalledOnce()
    const count = level.mock.calls.length
    vi.advanceTimersByTime(1000)
    expect(level).toHaveBeenCalledTimes(count)
  })

  it('does not fail recording if Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined)
    const level = vi.fn()
    expect(() => startAudioLevel({} as MediaStream, level)()).not.toThrow()
    expect(level).toHaveBeenLastCalledWith(0)
  })

  it('delivers the current level to new subscribers and removes old listeners', () => {
    const channel = createLevelChannel()
    channel.publish(0.7)
    const listener = vi.fn()
    const unsubscribe = channel.subscribe(listener)
    expect(listener).toHaveBeenLastCalledWith(0.7)
    channel.publish(2)
    expect(listener).toHaveBeenLastCalledWith(1)
    unsubscribe()
    channel.publish(0)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})
