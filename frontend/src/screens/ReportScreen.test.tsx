import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock mode with no delays: the report comes from the three fixture files in src/api/mocks.
beforeEach(() => {
  vi.resetModules()
  vi.stubEnv('VITE_MOCK', '1')
  vi.stubEnv('VITE_MOCK_FAST', '1')
})
afterEach(() => {
  vi.unstubAllEnvs()
  window.history.pushState({}, '', '/')
})

async function renderReport(variant?: string) {
  window.history.pushState({}, '', variant ? `/?mock=${variant}` : '/')
  const { default: ReportScreen } = await import('./ReportScreen')
  const onRestart = vi.fn()
  render(<ReportScreen sessionId="s1" onRestart={onRestart} />)
  return { onRestart }
}

describe('ReportScreen', () => {
  it('strong code and strong explanations', async () => {
    await renderReport()
    expect(await screen.findByText('81.3')).toBeInTheDocument()
    expect(screen.getByText('73%')).toBeInTheDocument()
    expect(screen.getByText('93%')).toBeInTheDocument()
    expect(screen.queryByText(/large gap/i)).toBeNull()
    expect(screen.getAllByRole('article')).toHaveLength(3)
  })

  it('the student report never shows a review flag or look-away information', async () => {
    await renderReport('weak')
    expect(await screen.findByText('49.3')).toBeInTheDocument()
    expect(screen.queryByRole('note')).toBeNull()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/review|look(ed)? away|look-away|flag/i)
    expect(screen.getByText(/no speech was detected/i)).toBeInTheDocument()
  })

  it('a partial report is provisional and offers a retry', async () => {
    await renderReport('partial')
    expect(await screen.findByText('Provisional')).toBeInTheDocument()
    expect(screen.getByText(/question 3 could not be graded/i)).toBeInTheDocument()
    expect(screen.getByText('Not graded yet', { selector: 'dd' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try grading again' }))
    expect(await screen.findByText('Provisional')).toBeInTheDocument()
  })

  it('scores are text as well as bars, never colour alone', async () => {
    await renderReport()
    await screen.findByText('81.3')
    const first = screen.getAllByRole('article')[0]
    expect(within(first).getByRole('img', { name: 'Score 5 out of 5' })).toBeInTheDocument()
    expect(within(first).getByText('5 / 5')).toBeInTheDocument()
  })

  it('has a sensible heading order and explains the scoring', async () => {
    await renderReport()
    await screen.findByText('81.3')
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
    const levels = screen.getAllByRole('heading').map((h) => Number(h.tagName[1]))
    for (let i = 1; i < levels.length; i += 1) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1)
    expect(screen.getByText('How this was scored')).toBeInTheDocument()
  })

  it('start over calls back', async () => {
    const { onRestart } = await renderReport()
    await screen.findByText('81.3')
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))
    expect(onRestart).toHaveBeenCalled()
  })
})
