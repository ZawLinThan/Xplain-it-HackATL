import { describe, expect, it } from 'vitest'
import { firstUnanswered, initialState, reducer, type FlowState } from '../src/flow'

const created: FlowState = reducer(initialState, {
  type: 'created',
  sessionId: 's1',
  title: 'Quiz',
  total: 3,
})

describe('flow reducer', () => {
  it('goes start -> loading -> question 1', () => {
    expect(reducer(initialState, { type: 'begin' }).screen).toBe('loading')
    expect(created.screen).toBe('question')
    expect(created.index).toBe(1)
    expect(created.sessionId).toBe('s1')
  })

  it('moves one question at a time and ends on the report', () => {
    let state = created
    state = reducer(state, { type: 'next' })
    expect(state).toMatchObject({ screen: 'question', index: 2 })
    state = reducer(state, { type: 'next' })
    expect(state).toMatchObject({ screen: 'question', index: 3 })
    state = reducer(state, { type: 'next' })
    expect(state.screen).toBe('report')
  })

  it('records transcripts by question number', () => {
    const state = reducer(created, { type: 'answered', n: 1, transcript: 'hello' })
    expect(state.transcripts).toEqual({ 1: 'hello' })
  })

  it('failed returns to the start screen with a message', () => {
    const state = reducer(created, { type: 'failed', message: 'nope' })
    expect(state).toMatchObject({ screen: 'start', error: 'nope', sessionId: null })
  })

  it('reset clears everything', () => {
    expect(reducer(created, { type: 'reset' })).toEqual(initialState)
  })

  it('resumes at the first unanswered question', () => {
    const state = reducer(initialState, {
      type: 'resume',
      sessionId: 's1',
      title: 'Quiz',
      total: 3,
      transcripts: { 1: 'a', 2: 'b' },
    })
    expect(state).toMatchObject({ screen: 'question', index: 3 })
  })

  it('resumes straight to the report when all are answered', () => {
    const state = reducer(initialState, {
      type: 'resume',
      sessionId: 's1',
      title: 'Quiz',
      total: 3,
      transcripts: { 1: 'a', 2: 'b', 3: 'c' },
    })
    expect(state.screen).toBe('report')
  })

  it('firstUnanswered skips gaps correctly', () => {
    expect(firstUnanswered({}, 3)).toBe(1)
    expect(firstUnanswered({ 2: 'x' }, 3)).toBe(1)
    expect(firstUnanswered({ 1: 'x', 3: 'y' }, 3)).toBe(2)
    expect(firstUnanswered({ 1: 'x', 2: 'y', 3: 'z' }, 3)).toBe(4)
  })
})
