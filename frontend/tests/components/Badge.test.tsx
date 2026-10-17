import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DemoModeContext } from '../../src/demoMode'
import type { FeatureKey } from '../../src/features'
import Badge from '../../src/components/Badge'

describe('Badge', () => {
  it('shows the live-build label by default', () => {
    render(<Badge feature="grading" />)
    expect(screen.getByText('Working')).toBeInTheDocument()
  })

  it('says Simulated for canned output in demo mode', () => {
    render(
      <DemoModeContext.Provider value={true}>
        <Badge feature="grading" />
        <Badge feature="transcription" />
        <Badge feature="questionWriting" />
      </DemoModeContext.Provider>,
    )
    expect(screen.getAllByText('Simulated')).toHaveLength(3)
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
    render(<Badge feature="preloadedSample" withLabel />)
    expect(screen.getByText(/Preloaded sample assessment/)).toBeInTheDocument()
  })
})


it('labels the preset problem score as simulated', () => {
  render(<Badge feature="problemScore" withLabel />)
  expect(screen.getByText('Simulated')).toBeInTheDocument()
  expect(screen.getByText(/Preset problem score/)).toBeInTheDocument()
})

it('does not crash or invent a status for an unknown runtime feature', () => {
  const { container } = render(<Badge feature={'missing-feature' as FeatureKey} />)
  expect(container).toBeEmptyDOMElement()
})
