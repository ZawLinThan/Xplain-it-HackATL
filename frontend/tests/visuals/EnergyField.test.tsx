import { act, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { EnergyField } from '../../src/visuals/EnergyField'
import { createLevelChannel } from '../../src/visuals/audioLevel'

describe('voice-reactive background', () => {
  it('applies microphone levels only while listening and resets for reduced motion', () => {
    const channel = createLevelChannel()
    const view = render(<EnergyField phase="listening" amplitude={0} reducedMotion={false} quality="standard" levelSource={channel.subscribe} />)
    const field = view.container.firstElementChild as HTMLElement
    act(() => channel.publish(0.8))
    expect(field.style.getPropertyValue('--energy')).toBe('0.8')
    view.rerender(<EnergyField phase="listening" amplitude={0} reducedMotion quality="standard" levelSource={channel.subscribe} />)
    act(() => channel.publish(1))
    expect(field.style.getPropertyValue('--energy')).toBe('0')
    view.rerender(<EnergyField phase="processing" amplitude={0} reducedMotion={false} quality="standard" levelSource={channel.subscribe} />)
    act(() => channel.publish(1))
    expect(field.style.getPropertyValue('--energy')).toBe('0')
  })
})
