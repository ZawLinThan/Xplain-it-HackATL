import type { LevelSource } from '../audioLevel'

// Presentation-only types for the neural scene. API types stay authoritative at the data
// boundary; nothing here is sent to the server.

export type NeuralMode = 'landing' | 'assessment' | 'results'

export type NeuralPhase =
  | 'idle'
  | 'preparing'
  | 'ready'
  | 'listening'
  | 'processing'
  | 'review'
  | 'error'
  | 'complete'

export type NeuralQuality = 'standard' | 'low'

/** One main hub. `score` stays null during the round: hubs show progress only, never correctness. */
export interface QuestionVisual {
  id: string
  index: number
  label: string
  answered: boolean
  score: number | null
}

/** A hub's position on screen in CSS pixels relative to the scene container. */
export interface HubAnchor {
  id: string
  x: number
  y: number
}

export interface NeuralSceneProps {
  mode: NeuralMode
  phase: NeuralPhase
  seed: string
  activeQuestionId?: string
  selectedQuestionId?: string
  hoveredQuestionId?: string
  questions: QuestionVisual[]
  levelSource?: LevelSource
  reducedMotion: boolean
  /** Stop the loop without unmounting, for example while the setup dialog covers the hero. */
  paused?: boolean
  /** Results only: hub screen positions, so HTML hotspots can sit on top of the 3D hubs. */
  onHubsProjected?: (anchors: HubAnchor[]) => void
  className?: string
}

export const SCORE_SEGMENTS = 5
