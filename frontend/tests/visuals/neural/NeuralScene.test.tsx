import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { NeuralScene } from '../../../src/visuals/neural/NeuralScene'
import type { QuestionVisual } from '../../../src/visuals/neural/sceneTypes'

const hubs: QuestionVisual[] = [
  { id: 's1:1', index: 1, label: 'Question 1', answered: true, score: 4 },
  { id: 's1:2', index: 2, label: 'Question 2', answered: true, score: 0 },
  { id: 's1:3', index: 3, label: 'Question 3', answered: true, score: null },
]

describe('NeuralScene without WebGL', () => {
  it('shows the designed static network instead of a blank area, hidden from assistive technology', () => {
    const { container } = render(<NeuralScene mode="assessment" phase="ready" seed="s1" questions={hubs} reducedMotion={false} />)
    const scene = container.querySelector('.neural-scene') as HTMLElement
    expect(scene.dataset.renderer).toBe('static')
    expect(scene).toHaveAttribute('aria-hidden', 'true')
    expect(scene.querySelector('svg.neural-fallback')).not.toBeNull()
    expect(scene.querySelectorAll('line').length).toBeGreaterThan(40)
  })

  it('keeps the same score halos in the static results map: four, zero and not graded', () => {
    const { container } = render(<NeuralScene mode="results" phase="complete" seed="s1" questions={hubs} selectedQuestionId="s1:2" reducedMotion />)
    const lit = [...container.querySelectorAll<SVGGElement>('[data-hub-id]')].map((g) => [g.dataset.hubId, g.dataset.lit])
    expect(lit).toEqual([['s1:1', '4'], ['s1:2', '0'], ['s1:3', 'ungraded']])
    expect(container.querySelector('[data-selected=true]')).toHaveAttribute('data-hub-id', 's1:2')
  })

  it('never shows score halos during the round', () => {
    const { container } = render(<NeuralScene mode="assessment" phase="listening" seed="s1" questions={hubs} reducedMotion={false} />)
    container.querySelectorAll<SVGGElement>('[data-hub-id]').forEach((g) => expect(g.dataset.lit).toBeUndefined())
  })
})
