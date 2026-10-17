import { describe, expect, it } from 'vitest'
import type { QuestionResult } from '../../../src/api/types'
import { litSegments, questionId, reportQuestions, roundQuestions } from '../../../src/visuals/neural/questionVisuals'

const result = (index: number, score: number | null): QuestionResult => ({
  index, text: `Q${index}`, transcript: 't', score, feedback: null,
})

describe('question visuals', () => {
  it('keeps zero and null distinct and orders hubs by the saved question number', () => {
    const hubs = reportQuestions('s1', [result(3, null), result(1, 0), result(2, 4)])
    expect(hubs.map((h) => [h.id, h.label, h.score])).toEqual([
      ['s1:1', 'Question 1', 0],
      ['s1:2', 'Question 2', 4],
      ['s1:3', 'Question 3', null],
    ])
    expect(litSegments(0)).toBe(0)
    expect(litSegments(null)).toBeNull()
    expect(litSegments(4)).toBe(4)
  })

  it('identifies hubs by session and question number, not array position', () => {
    const a = reportQuestions('s1', [result(1, 5), result(2, 3), result(3, 1)])
    const b = reportQuestions('s1', [result(2, 3), result(3, 1), result(1, 5)])
    expect(a).toEqual(b)
    expect(a[1].id).toBe(questionId('s1', 2))
  })

  it('carries progress only during the round, never a score', () => {
    const hubs = roundQuestions('s1', 3, 2, true)
    expect(hubs.map((h) => h.answered)).toEqual([true, true, false])
    expect(hubs.every((h) => h.score === null)).toBe(true)
  })
})
