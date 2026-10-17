/** Every timing number for the question flow, in one place. VITE_MOCK_FAST=1 shortens them for tests. */
const FAST = import.meta.env.VITE_MOCK_FAST === '1'

/** The real values, kept separate so a test can check the arithmetic against the server grace. */
export const REAL_REVEAL_MS_PER_WORD = 200
export const REAL_REVEAL_MAX_MS = 8000
export const REAL_AUTO_ADVANCE_MS = 5000
/** Mirrors the backend's ANSWER_GRACE_SECONDS default (30 s on top of the 40 s answer). */
export const SERVER_GRACE_MS = 30000

export const REVEAL_MS_PER_WORD = FAST ? 5 : REAL_REVEAL_MS_PER_WORD
export const REVEAL_MAX_MS = FAST ? 50 : REAL_REVEAL_MAX_MS
export const REDUCED_MOTION_PAUSE_MS = FAST ? 10 : 1000
export const AUTO_ADVANCE_MS = FAST ? 150 : REAL_AUTO_ADVANCE_MS

/** Milliseconds per word: 200, but never so slow that the whole reveal passes the cap. */
export function msPerWord(words: number, perWord = REVEAL_MS_PER_WORD, maxMs = REVEAL_MAX_MS): number {
  return Math.min(perWord, maxMs / Math.max(1, words))
}
