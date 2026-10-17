import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DemoModeContext } from '../../src/demoMode'
import type { FeatureKey } from '../../src/features'
import Badge from '../../src/components/Badge'

describe('Badge', () => {
  it('shows the live-build label by default', () => {
    render(<Badge feature="transcription" />)
    expect(screen.getByText('Working')).toBeInTheDocument()
  })

  it('says Simulated for canned output in demo mode', () => {
    render(
      <DemoModeContext.Provider value={true}>
        <Badge feature="transcription" />
        <Badge feature="questionWriting" />
        <Badge feature="spokenAnswers" />
      </DemoModeContext.Provider>,
    )
    // Only canned services change; real spoken-answer capture stays Working.
    expect(screen.getAllByText('Simulated')).toHaveLength(2)
    expect(screen.getByText('Working')).toBeInTheDocument()
  })

  it('never upgrades something that is only planned', () => {
    render(
      <DemoModeContext.Provider value={true}>
        <Badge feature="typedAnswers" />
      </DemoModeContext.Provider>,
    )
    expect(screen.getByText('Planned')).toBeInTheDocument()
  })

  it('can show the feature name', () => {
    render(<Badge feature="spokenAnswers" withLabel />)
    expect(screen.getByText(/Spoken answers with a 40-second cap/)).toBeInTheDocument()
  })
})

it('does not crash or invent a status for an unknown runtime feature', () => {
  const { container } = render(<Badge feature={'missing-feature' as FeatureKey} />)
  expect(container).toBeEmptyDOMElement()
})
