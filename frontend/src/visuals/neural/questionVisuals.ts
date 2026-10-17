import type { QuestionResult } from '../../api/types'
import { SCORE_SEGMENTS, type QuestionVisual } from './sceneTypes'

/** Stable hub identity: the session plus the server's question number, never an array position. */
export const questionId = (sessionId: string, index: number) => `${sessionId}:${index}`

/** During the round hubs carry progress only, so every score is null by construction. */
export function roundQuestions(sessionId: string, total: number, current: number, currentAnswered: boolean): QuestionVisual[] {
  return Array.from({ length: Math.min(total, 3) }, (_, i) => {
    const index = i + 1
    return {
      id: questionId(sessionId, index),
      index,
      label: `Question ${index}`,
      answered: index < current || (index === current && currentAnswered),
      score: null,
    }
  })
}

/** Saved report entries to hubs. Zero stays zero and null stays "not graded". */
export function reportQuestions(sessionId: string, questions: readonly QuestionResult[]): QuestionVisual[] {
  return [...questions]
    .sort((a, b) => a.index - b.index)
    .slice(0, 3)
    .map((q) => ({
      id: questionId(sessionId, q.index),
      index: q.index,
      label: `Question ${q.index}`,
      answered: true,
      score: typeof q.score === 'number' ? Math.max(0, Math.min(SCORE_SEGMENTS, Math.round(q.score))) : null,
    }))
}

/** Lit segments of the five-segment halo; null means the dashed "not graded" halo. */
export const litSegments = (score: number | null) => (score === null ? null : Math.max(0, Math.min(SCORE_SEGMENTS, score)))
