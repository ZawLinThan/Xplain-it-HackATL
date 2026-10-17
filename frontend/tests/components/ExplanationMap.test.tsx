import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { QuestionResult } from '../../src/api/types'
import ExplanationMap from '../../src/components/ExplanationMap'

const questions: QuestionResult[] = [
  { index: 2, text: 'Second question?', transcript: 'Second answer.', score: 0, feedback: 'Answer came in late.' },
  { index: 1, text: 'First question?', transcript: 'First answer.', score: 4, feedback: 'Covers most ideas.' },
  { index: 3, text: 'Third question?', transcript: '', score: null, feedback: null },
]

afterEach(() => vi.unstubAllGlobals())

describe('ExplanationMap', () => {
  it('opens on the first question and shows its saved score, feedback and transcript', () => {
    render(<ExplanationMap sessionId="s1" questions={questions} />)
    expect(screen.getByRole('heading', { name: 'Your explanation map' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'First question?' })).toBeInTheDocument()
    expect(screen.getByText('Covers most ideas.')).toBeInTheDocument()
    expect(screen.getByText('First answer.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Question 1/, pressed: true })).toBeInTheDocument()
  })

  it('selecting a hub shows the matching details without any request', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    render(<ExplanationMap sessionId="s1" questions={questions} />)
    fireEvent.click(screen.getByRole('button', { name: /Question 2/ }))
    expect(screen.getByRole('heading', { name: 'Second question?' })).toBeInTheDocument()
    expect(screen.getByText('Second answer.')).toBeInTheDocument()
    expect(screen.getByText('Answer came in late.')).toBeInTheDocument()
    expect(screen.getAllByText('0 / 5').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Question 3/ }))
    expect(screen.getAllByText('Not graded').length).toBeGreaterThan(0)
    expect(screen.getByText(/No spoken words were transcribed/)).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('works with the keyboard through ordinary buttons, not canvas hotspots', () => {
    render(<ExplanationMap sessionId="s1" questions={questions} />)
    const choices = screen.getAllByRole('button')
    expect(choices.map((b) => b.textContent)).toEqual(['Question 14 / 5', 'Question 20 / 5', 'Question 3Not graded'])
    choices[2].focus()
    fireEvent.keyDown(choices[2], { key: 'Enter' })
    fireEvent.click(choices[2])
    expect(screen.getByRole('heading', { name: 'Third question?' })).toBeInTheDocument()
  })
})
