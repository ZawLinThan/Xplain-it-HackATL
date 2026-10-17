/** App flow as one reducer: start -> loading -> question (1..3) -> report. No router. */

export const TOTAL_QUESTIONS = 3

export type Screen = 'start' | 'loading' | 'question' | 'report'

export interface FlowState {
  screen: Screen
  sessionId: string | null
  title: string
  total: number
  /** 1-based number of the question being asked */
  index: number
  /** transcripts of answered questions, by question number */
  transcripts: Record<number, string>
  error: string | null
}

export type FlowAction =
  | { type: 'begin' }
  | { type: 'created'; sessionId: string; title: string; total: number }
  | { type: 'resume'; sessionId: string; title: string; total: number; transcripts: Record<number, string> }
  | { type: 'answered'; n: number; transcript: string }
  | { type: 'next' }
  | { type: 'failed'; message: string }
  | { type: 'reset' }

export const initialState: FlowState = {
  screen: 'start',
  sessionId: null,
  title: '',
  total: TOTAL_QUESTIONS,
  index: 1,
  transcripts: {},
  error: null,
}

/** First question number with no saved transcript; total + 1 means all are answered. */
export function firstUnanswered(transcripts: Record<number, string>, total: number): number {
  for (let n = 1; n <= total; n += 1) {
    if (!(n in transcripts)) return n
  }
  return total + 1
}

export function reducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'begin':
      return { ...initialState, screen: 'loading' }
    case 'created':
      return {
        ...initialState,
        screen: 'question',
        sessionId: action.sessionId,
        title: action.title,
        total: action.total,
      }
    case 'resume': {
      const index = firstUnanswered(action.transcripts, action.total)
      return {
        ...initialState,
        screen: index > action.total ? 'report' : 'question',
        sessionId: action.sessionId,
        title: action.title,
        total: action.total,
        index: Math.min(index, action.total),
        transcripts: action.transcripts,
      }
    }
    case 'answered':
      return { ...state, transcripts: { ...state.transcripts, [action.n]: action.transcript } }
    case 'next':
      return state.index >= state.total
        ? { ...state, screen: 'report' }
        : { ...state, index: state.index + 1 }
    case 'failed':
      return { ...initialState, error: action.message }
    case 'reset':
      return initialState
  }
}

// ------------------------------------------------------------- refresh support

const KEY = 'Xplain-it-session'

export interface SavedSession {
  sessionId: string
  title: string
  total: number
  transcripts: Record<number, string>
}

/** Storage can be missing or blocked, so every access is wrapped. */
export function saveSession(state: FlowState): void {
  try {
    if (!state.sessionId) return
    const saved: SavedSession = {
      sessionId: state.sessionId,
      title: state.title,
      total: state.total,
      transcripts: state.transcripts,
    }
    sessionStorage.setItem(KEY, JSON.stringify(saved))
  } catch {
    // resume is a convenience only
  }
}

export function loadSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as SavedSession) : null
  } catch {
    return null
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
