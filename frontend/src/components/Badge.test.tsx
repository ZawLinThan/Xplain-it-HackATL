import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DemoModeContext } from '../demoMode'
import Badge from './Badge'

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
        <Badge feature="fileUpload" />
      </DemoModeContext.Provider>,
    )
    expect(screen.getByText('Planned')).toBeInTheDocument()
  })

  it('can show the feature name', () => {
    render(<Badge feature="preloadedSample" withLabel />)
    expect(screen.getByText(/Preloaded sample assessment/)).toBeInTheDocument()
  })
})
