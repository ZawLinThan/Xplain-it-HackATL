/**
 * One place that says what is real in this build. Every feature on screen carries one of these
 * labels so the demo never overstates what works.
 */
export type FeatureStatus = 'working' | 'simulated' | 'planned'

export const FEATURES = {
  preloadedSample: { label: 'Preloaded sample assessment', status: 'simulated' },
  problemScore: { label: 'Problem score (preset, tests not run live)', status: 'simulated' },
  questionWriting: { label: 'LLM writes the questions', status: 'working' },
  spokenAnswers: { label: 'Spoken answers with a 40-second cap', status: 'working' },
  transcription: { label: 'Speech-to-text transcript', status: 'working' },
  grading: { label: 'Grading against expected answers', status: 'working' },
  lookAway: { label: 'Look-away count for your instructor', status: 'working' },
  typedAnswers: { label: 'Typed-answer accommodation', status: 'planned' },
  fileUpload: { label: 'Upload your own files (text is read; PDF and Word are saved only)', status: 'simulated' },
  instructorView: { label: 'Instructor view', status: 'working' },
} as const satisfies Record<string, { label: string; status: FeatureStatus }>

export type FeatureKey = keyof typeof FEATURES

export const STATUS_TEXT: Record<FeatureStatus, string> = {
  working: 'Working',
  simulated: 'Simulated',
  planned: 'Planned',
}

/** In DEMO_MODE the server returns canned LLM output and transcripts, so say so on screen. */
export const DEMO_OVERRIDES: Partial<Record<FeatureKey, FeatureStatus>> = {
  questionWriting: 'simulated',
  transcription: 'simulated',
  grading: 'simulated',
}

export function statusOf(feature: FeatureKey, demoMode: boolean): FeatureStatus {
  return (demoMode && DEMO_OVERRIDES[feature]) || FEATURES[feature].status
}
